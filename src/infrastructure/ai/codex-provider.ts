import type { z } from "zod";
import { AIError } from "../../shared/errors.js";
import { logger } from "../../shared/logger.js";
import { readConfig } from "../config/manager.js";
import { safeEnv, spawnWithStdin } from "./subprocess.js";
import type {
	AIProvider,
	AIResponse,
	QueryOptions,
	StructuredAIResponse,
	TokenUsage,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 60_000;

/** CLI パスのバリデーション */
function isValidCliPath(cliPath: string): boolean {
	if (!cliPath.trim()) return false;
	return !/[;&|`$()'"<>\\!{}]/.test(cliPath);
}

/** codex exec でプロンプトを実行（非同期 + stdin 経由） */
async function execCodex(cliPath: string, prompt: string, timeout: number): Promise<string> {
	if (!isValidCliPath(cliPath)) {
		throw new AIError(`無効な Codex CLI パス: ${cliPath}`, "INVALID_PATH");
	}

	try {
		// プロンプトは stdin 経由で渡す（-c フラグではなく）
		const result = await spawnWithStdin(cliPath, ["exec", "--full-auto", "-q"], prompt, {
			timeout,
			env: safeEnv(),
		});
		return result.trim();
	} catch (error) {
		if (error instanceof AIError) throw error;

		if (error instanceof Error) {
			if (error.message.includes("ENOENT")) {
				throw new AIError(
					"Codex CLI が見つかりません。`npm install -g @openai/codex` でインストールしてください。",
					"CLI_NOT_FOUND",
				);
			}
			if (
				(error as { killed?: boolean }).killed === true ||
				error.message.includes("ETIMEDOUT") ||
				error.message.includes("timed out") ||
				error.message.includes("Process timed out")
			) {
				throw new AIError(`Codex がタイムアウトしました（${timeout / 1000}秒）`, "TIMEOUT");
			}
			throw new AIError(`Codex 実行に失敗: ${error.message}`, "EXEC_ERROR");
		}
		throw new AIError("Codex 実行に失敗しました", "UNKNOWN");
	}
}

/** Codex の出力からトークン推定（概算） */
function estimateTokens(input: string, output: string): TokenUsage {
	// 日本語テキストの概算: 1トークン ≈ 1.5文字
	const inputTokens = Math.ceil(input.length / 1.5);
	const outputTokens = Math.ceil(output.length / 1.5);
	return { inputTokens, outputTokens };
}

export function createCodexProvider(): AIProvider {
	const config = readConfig();
	const cliPath = config.providers.codex?.cliPath ?? "codex";

	return {
		id: "codex",

		async query(prompt: string, options?: QueryOptions): Promise<AIResponse> {
			const fullPrompt = options?.systemPrompt ? `${options.systemPrompt}\n\n${prompt}` : prompt;

			const output = await execCodex(cliPath, fullPrompt, DEFAULT_TIMEOUT_MS);
			const usage = estimateTokens(fullPrompt, output);

			return {
				content: output,
				usage,
				model: "codex",
				provider: "codex",
			};
		},

		async queryStructured<T>(
			prompt: string,
			schema: z.ZodSchema<T>,
			options?: QueryOptions,
		): Promise<StructuredAIResponse<T>> {
			const structuredRetries = 1;
			let retryHint = "";

			for (let attempt = 0; attempt <= structuredRetries; attempt++) {
				const systemPrompt = [
					options?.systemPrompt ?? "",
					"必ず JSON 形式のみで応答してください。余分なテキストや説明は含めないでください。",
					retryHint,
				]
					.filter(Boolean)
					.join("\n\n");

				const response = await this.query(prompt, { ...options, systemPrompt });

				// JSON パース
				let parsed: unknown;
				try {
					const cleaned = response.content
						.replace(/^```(?:json)?\s*\n?/m, "")
						.replace(/\n?```\s*$/m, "")
						.trim();
					parsed = JSON.parse(cleaned);
				} catch {
					// コードブロック除去後もパース失敗 → { ... } を抽出
					const jsonMatch = response.content.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
					if (jsonMatch?.[1]) {
						try {
							parsed = JSON.parse(jsonMatch[1].trim());
						} catch {
							// 抽出も失敗
						}
					}

					if (parsed === undefined) {
						if (attempt < structuredRetries) {
							logger.warn(
								`Codex 応答の JSON パースに失敗（試行 ${attempt + 1}/${structuredRetries + 1}）。リトライします`,
							);
							retryHint =
								"前回の応答は JSON として解析できませんでした。必ず有効な JSON のみを出力してください。";
							continue;
						}
						throw new AIError(
							`Codex からの応答が JSON 形式ではありません: ${response.content.slice(0, 200)}`,
							"PARSE_ERROR",
						);
					}
				}

				const result = schema.safeParse(parsed);
				if (!result.success) {
					const summary = result.error.issues
						.map((i) => `${i.path.join(".")}: ${i.message}`)
						.join("; ");
					if (attempt < structuredRetries) {
						logger.warn(
							`Codex 応答のバリデーションに失敗（試行 ${attempt + 1}/${structuredRetries + 1}）。リトライします — ${summary}`,
						);
						retryHint = `前回の応答はスキーマに適合しませんでした。エラー: ${result.error.message}。正しい構造の JSON を出力してください。`;
						continue;
					}
					throw new AIError(`Codex 応答のバリデーションに失敗: ${summary}`, "VALIDATION_ERROR");
				}

				return {
					data: result.data,
					usage: response.usage,
					model: response.model,
					provider: "codex",
				};
			}

			throw new AIError("Codex 応答の構造化に失敗しました", "VALIDATION_ERROR");
		},

		estimateCost(): number {
			return 0;
		},
	};
}

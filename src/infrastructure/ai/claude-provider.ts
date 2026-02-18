import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { AIError } from "../../shared/errors.js";
import { logger } from "../../shared/logger.js";
import { detectClaudeCliPath } from "../auth/detector.js";
import { readConfig } from "../config/manager.js";
import { loadPricing } from "./pricing.js";
import { safeEnv, spawnWithStdin } from "./subprocess.js";
import type {
	AIProvider,
	AIResponse,
	QueryOptions,
	StructuredAIResponse,
	TokenUsage,
} from "./types.js";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const CLI_TIMEOUT_MS = 60_000;

// ────────────────────────────────────────
// 共通ユーティリティ
// ────────────────────────────────────────

/** 指数バックオフで待機 */
function delay(attempt: number): Promise<void> {
	const ms = BASE_DELAY_MS * 2 ** attempt;
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 認証モードの判定結果 */
type AuthMode = { type: "sdk" } | { type: "cli"; cliPath: string };

/** 認証モードを判定 */
function resolveAuthMode(): AuthMode {
	const config = readConfig();
	const claude = config.providers.claude;

	// API Key が明示的に設定されている場合は SDK
	if (claude?.apiKey) return { type: "sdk" };

	// 環境変数 ANTHROPIC_API_KEY がある場合は SDK
	if (process.env.ANTHROPIC_API_KEY) return { type: "sdk" };

	// cli_detect / oauth → Claude Code CLI プロキシ
	if (claude?.authMethod === "cli_detect" || claude?.authMethod === "oauth") {
		const cliPath = detectClaudeCliPath();
		if (cliPath) return { type: "cli", cliPath };
	}

	// デフォルト（認証なし）→ SDK に任せてエラーを出す
	return { type: "sdk" };
}

// ────────────────────────────────────────
// SDK モード（API Key / 環境変数）
// ────────────────────────────────────────

/** Anthropic SDK クライアントを生成 */
function createClient(): Anthropic {
	const config = readConfig();
	const claude = config.providers.claude;

	if (claude?.apiKey) {
		return new Anthropic({ apiKey: claude.apiKey });
	}

	if (process.env.ANTHROPIC_API_KEY) {
		return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
	}

	throw new AIError("Claude の認証情報が設定されていません。`oshi auth` を実行してください。");
}

/** リトライ可能なエラーか判定 */
function isRetryable(error: unknown): boolean {
	if (error instanceof Anthropic.RateLimitError) return true;
	if (error instanceof Anthropic.InternalServerError) return true;
	if (error instanceof Anthropic.APIConnectionError) return true;
	return false;
}

/** Anthropic エラーを AIError に変換 */
function toAIError(error: unknown): AIError {
	if (error instanceof AIError) return error;

	if (error instanceof Anthropic.AuthenticationError) {
		return new AIError(
			"Claude の認証に失敗しました。`oshi auth` で認証情報を確認してください。",
			"AUTH_FAILED",
		);
	}
	if (error instanceof Anthropic.RateLimitError) {
		return new AIError(
			"Claude API のレート制限に達しました。しばらく待ってから再試行してください。",
			"RATE_LIMITED",
		);
	}
	if (error instanceof Anthropic.APIError) {
		return new AIError(`Claude API エラー: ${error.message}`, "API_ERROR");
	}
	if (error instanceof Error) {
		return new AIError(`Claude 呼び出しに失敗: ${error.message}`, "UNKNOWN");
	}
	return new AIError("Claude 呼び出しに失敗しました", "UNKNOWN");
}

/** SDK レスポンスから TokenUsage を抽出 */
function extractUsage(usage: Anthropic.Usage): TokenUsage {
	return {
		inputTokens: usage.input_tokens,
		outputTokens: usage.output_tokens,
		cacheTokens: (usage as unknown as Record<string, number>).cache_read_input_tokens ?? 0,
	};
}

/** SDK 経由でクエリ実行 */
async function queryViaSdk(
	prompt: string,
	options: QueryOptions | undefined,
	defaultModel: string,
): Promise<AIResponse> {
	const client = createClient();
	const model = options?.model ?? defaultModel;
	let lastError: unknown;

	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		try {
			const message = await client.messages.create({
				model,
				max_tokens: options?.maxTokens ?? 4096,
				...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
				...(options?.systemPrompt ? { system: options.systemPrompt } : {}),
				messages: [{ role: "user", content: prompt }],
			});

			const textContent = message.content
				.filter((block): block is Anthropic.TextBlock => block.type === "text")
				.map((block) => block.text)
				.join("");

			return {
				content: textContent,
				usage: extractUsage(message.usage),
				model: message.model,
				provider: "claude",
			};
		} catch (error) {
			lastError = error;
			if (isRetryable(error) && attempt < MAX_RETRIES - 1) {
				logger.debug(`Claude リトライ (${attempt + 1}/${MAX_RETRIES})`);
				await delay(attempt);
				continue;
			}
			throw toAIError(error);
		}
	}

	throw toAIError(lastError);
}

// ────────────────────────────────────────
// CLI モード（Claude Code CLI プロキシ）
// ────────────────────────────────────────

/** claude -p --output-format json のレスポンス */
interface ClaudeCliResponse {
	result: string;
	is_error: boolean;
	total_cost_usd: number;
	session_id: string;
	usage?: {
		input_tokens: number;
		output_tokens: number;
		cache_read_input_tokens?: number;
	};
	model?: string;
}

/** Claude Code CLI 経由でクエリ実行（プロンプトは stdin 経由） */
async function queryViaCli(
	cliPath: string,
	prompt: string,
	options: QueryOptions | undefined,
	defaultModel: string,
): Promise<AIResponse> {
	const model = options?.model ?? defaultModel;

	const args = ["-p", "--output-format", "json", "--model", model, "--max-turns", "1"];

	if (options?.systemPrompt) {
		args.push("--system-prompt", options.systemPrompt);
	}

	// プロンプトは stdin 経由で渡す（長いプロンプトでも安全）

	try {
		const result = await spawnWithStdin(cliPath, args, prompt, {
			timeout: CLI_TIMEOUT_MS,
			env: safeEnv(),
		});

		const parsed = JSON.parse(result.trim()) as ClaudeCliResponse;

		if (parsed.is_error) {
			throw new AIError(`Claude CLI エラー: ${parsed.result}`, "EXEC_ERROR");
		}

		const usage: TokenUsage = parsed.usage
			? {
					inputTokens: parsed.usage.input_tokens,
					outputTokens: parsed.usage.output_tokens,
					cacheTokens: parsed.usage.cache_read_input_tokens ?? 0,
				}
			: estimateTokens(prompt, parsed.result);

		return {
			content: parsed.result,
			usage,
			model: parsed.model ?? model,
			provider: "claude",
		};
	} catch (error) {
		if (error instanceof AIError) throw error;

		if (error instanceof SyntaxError) {
			throw new AIError("Claude CLI の出力を解析できませんでした", "PARSE_ERROR");
		}

		if (error instanceof Error) {
			if (error.message.includes("ENOENT")) {
				throw new AIError(
					"Claude Code CLI が見つかりません。`npm install -g @anthropic-ai/claude-code` でインストールしてください。",
					"CLI_NOT_FOUND",
				);
			}
			if (
				(error as { killed?: boolean }).killed === true ||
				error.message.includes("ETIMEDOUT") ||
				error.message.includes("timed out") ||
				error.message.includes("Process timed out")
			) {
				throw new AIError(
					`Claude CLI がタイムアウトしました（${CLI_TIMEOUT_MS / 1000}秒）`,
					"TIMEOUT",
				);
			}
			throw new AIError(`Claude CLI 実行に失敗: ${error.message}`, "EXEC_ERROR");
		}
		throw new AIError("Claude CLI 実行に失敗しました", "UNKNOWN");
	}
}

/** CLI モード用のトークン推定（usage が取れない場合のフォールバック） */
function estimateTokens(input: string, output: string): TokenUsage {
	const inputTokens = Math.ceil(input.length / 1.5);
	const outputTokens = Math.ceil(output.length / 1.5);
	return { inputTokens, outputTokens };
}

// ────────────────────────────────────────
// プロバイダーファクトリ
// ────────────────────────────────────────

export function createClaudeProvider(): AIProvider {
	const config = readConfig();
	const defaultModel = config.models.default;
	const mode = resolveAuthMode();

	logger.debug(`Claude プロバイダー: ${mode.type} モードで初期化`);

	return {
		id: "claude",

		async query(prompt: string, options?: QueryOptions): Promise<AIResponse> {
			if (mode.type === "cli") {
				return queryViaCli(mode.cliPath, prompt, options, defaultModel);
			}
			return queryViaSdk(prompt, options, defaultModel);
		},

		async queryStructured<T>(
			prompt: string,
			schema: z.ZodSchema<T>,
			options?: QueryOptions,
		): Promise<StructuredAIResponse<T>> {
			// CLI モードはサブプロセス起動が重いためリトライを減らす
			const structuredRetries = mode.type === "cli" ? 1 : 2;
			let retryHint = "";

			for (let attempt = 0; attempt <= structuredRetries; attempt++) {
				const systemPrompt = [
					options?.systemPrompt ?? "",
					"必ず JSON 形式のみで応答してください。余分なテキストや説明は含めないでください。",
					retryHint,
				]
					.filter(Boolean)
					.join("\n\n");

				const response = await this.query(prompt, {
					...options,
					systemPrompt,
				});

				// JSON パース
				let parsed: unknown;
				try {
					parsed = JSON.parse(response.content.trim());
				} catch {
					// コードブロックや前後の説明テキストから JSON を抽出
					const codeBlockMatch = response.content.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/);
					if (codeBlockMatch?.[1]) {
						try {
							parsed = JSON.parse(codeBlockMatch[1].trim());
						} catch {
							// コードブロック内もパース失敗
						}
					}

					// コードブロックがない場合、最初の { ... } または [ ... ] を抽出
					if (parsed === undefined) {
						const jsonMatch = response.content.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
						if (jsonMatch?.[1]) {
							try {
								parsed = JSON.parse(jsonMatch[1].trim());
							} catch {
								// JSON 抽出も失敗
							}
						}
					}

					if (parsed === undefined) {
						if (attempt < structuredRetries) {
							logger.warn(
								`AI 応答の JSON パースに失敗（試行 ${attempt + 1}/${structuredRetries + 1}）。リトライします`,
							);
							retryHint =
								"前回の応答は JSON として解析できませんでした。必ず有効な JSON のみを出力してください。余分なテキストや説明は一切含めないでください。";
							continue;
						}
						throw new AIError(
							`AI からの応答が JSON 形式ではありません: ${response.content.slice(0, 200)}`,
							"PARSE_ERROR",
						);
					}
				}

				const result = schema.safeParse(parsed);
				if (!result.success) {
					const issuesSummary = result.error.issues
						.map((i) => `${i.path.join(".")}: ${i.message}`)
						.join("; ");
					if (attempt < structuredRetries) {
						logger.warn(
							`AI 応答のバリデーションに失敗（試行 ${attempt + 1}/${structuredRetries + 1}）。リトライします — ${issuesSummary}`,
						);
						retryHint = `前回の応答はスキーマに適合しませんでした。エラー: ${result.error.message}。正しい構造の JSON を出力してください。`;
						continue;
					}
					throw new AIError(`AI 応答のバリデーションに失敗: ${issuesSummary}`, "VALIDATION_ERROR");
				}

				return {
					data: result.data,
					usage: response.usage,
					model: response.model,
					provider: "claude",
				};
			}

			// ここには到達しないが型安全のため
			throw new AIError("AI 応答の構造化に失敗しました", "VALIDATION_ERROR");
		},

		estimateCost(inputTokens: number, outputTokens: number, cacheTokens?: number): number {
			// CLI モードではコストは Claude Code 側で管理
			if (mode.type === "cli") return 0;

			const pricing = loadPricing();
			const modelPricing = pricing.claude[defaultModel];
			if (!modelPricing) {
				logger.warn(
					`モデル "${defaultModel}" の料金情報が見つかりません。コスト推定をスキップします。`,
				);
				return 0;
			}

			const inputCost = (inputTokens / 1_000_000) * modelPricing.inputPerMToken;
			const outputCost = (outputTokens / 1_000_000) * modelPricing.outputPerMToken;
			const cacheCost = cacheTokens
				? (cacheTokens / 1_000_000) * modelPricing.cacheReadPerMToken
				: 0;

			return inputCost + outputCost + cacheCost;
		},
	};
}

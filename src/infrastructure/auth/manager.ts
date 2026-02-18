import { logger } from "../../shared/logger.js";
import { readConfig, updateConfig } from "../config/manager.js";
import { detectClaudeCliPath, detectEnvAuth, maskApiKey } from "./detector.js";
import type { AuthMethod, AuthProvider, AuthValidationResult } from "./types.js";

/** サブプロセスに渡す最小限の環境変数 */
function safeEnv(): NodeJS.ProcessEnv {
	return {
		HOME: process.env.HOME,
		PATH: process.env.PATH,
		TERM: process.env.TERM,
		LANG: process.env.LANG,
		XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
	};
}

/** Claude API Key を検証（テストリクエスト） */
async function validateClaudeApiKey(apiKey: string): Promise<boolean> {
	try {
		const res = await fetch("https://api.anthropic.com/v1/messages", {
			method: "POST",
			headers: {
				"x-api-key": apiKey,
				"anthropic-version": "2023-06-01",
				"content-type": "application/json",
			},
			body: JSON.stringify({
				model: "claude-haiku-4-5-20251001",
				max_tokens: 1,
				messages: [{ role: "user", content: "ping" }],
			}),
		});
		// 200 OK → 認証成功
		// 400 Bad Request → 認証 OK（リクエスト形式の問題）
		// 401 Unauthorized → 認証失敗
		// その他（403, 429, 500等）→ 検証不能として失敗扱い
		return res.status === 200 || res.status === 400;
	} catch (error) {
		logger.error("Claude API Key 検証に失敗", error);
		return false;
	}
}

/** Claude Code CLI を検証（--version 実行） */
async function validateClaudeCli(): Promise<boolean> {
	const cliPath = detectClaudeCliPath();
	if (!cliPath) return false;

	const { execFileSync } = await import("node:child_process");
	try {
		execFileSync(cliPath, ["--version"], {
			encoding: "utf-8",
			timeout: 10000,
			env: safeEnv(),
		});
		return true;
	} catch {
		return false;
	}
}

/** CLI パスのバリデーション（コマンドインジェクション防止） */
function isValidCliPath(cliPath: string): boolean {
	if (!cliPath.trim()) return false;
	// シェルメタ文字を拒否
	return !/[;&|`$()'"<>\\!{}]/.test(cliPath);
}

/** Codex CLI の動作確認 */
async function validateCodexCli(cliPath: string): Promise<boolean> {
	if (!isValidCliPath(cliPath)) {
		logger.warn(`無効な CLI パス: ${cliPath}`);
		return false;
	}

	const { execFileSync } = await import("node:child_process");
	try {
		execFileSync(cliPath, ["--version"], { encoding: "utf-8", timeout: 10000 });
		return true;
	} catch {
		return false;
	}
}

/** Claude API Key で認証を設定 */
export async function setupClaudeApiKey(apiKey: string): Promise<AuthValidationResult> {
	const valid = await validateClaudeApiKey(apiKey);

	if (!valid) {
		return {
			valid: false,
			provider: "claude",
			method: "api_key",
			message: "API Key が無効です。キーを確認してください。",
		};
	}

	updateConfig({
		providers: {
			claude: {
				authMethod: "api_key",
				apiKey,
			},
		},
		defaultProvider: "claude",
	});

	return {
		valid: true,
		provider: "claude",
		method: "api_key",
		message: `Claude API Key を設定しました (${maskApiKey(apiKey)})`,
	};
}

/** Claude Code CLI プロキシモードで認証を設定 */
export async function setupClaudeCliProxy(): Promise<AuthValidationResult> {
	const valid = await validateClaudeCli();

	if (!valid) {
		return {
			valid: false,
			provider: "claude",
			method: "cli_detect",
			message:
				"Claude Code CLI の動作確認に失敗しました。`npm install -g @anthropic-ai/claude-code` でインストールしてください。",
		};
	}

	updateConfig({
		providers: {
			claude: {
				authMethod: "cli_detect",
			},
		},
		defaultProvider: "claude",
	});

	return {
		valid: true,
		provider: "claude",
		method: "cli_detect",
		message: "Claude Code CLI プロキシモードを設定しました",
	};
}

/** Codex CLI で認証を設定 */
export async function setupCodex(cliPath: string): Promise<AuthValidationResult> {
	const valid = await validateCodexCli(cliPath);

	if (!valid) {
		return {
			valid: false,
			provider: "codex",
			method: "cli_detect",
			message: `Codex CLI (${cliPath}) の動作確認に失敗しました。`,
		};
	}

	updateConfig({
		providers: {
			codex: {
				enabled: true,
				cliPath,
			},
		},
	});

	return {
		valid: true,
		provider: "codex",
		method: "cli_detect",
		message: `Codex CLI を設定しました (${cliPath})`,
	};
}

/** 認証情報を削除 */
export function removeAuth(provider: AuthProvider): void {
	const config = readConfig();
	if (provider === "claude") {
		const { claude: _, ...restProviders } = config.providers;
		updateConfig({
			providers: restProviders,
			...(config.defaultProvider === "claude" ? { defaultProvider: undefined } : {}),
		});
	} else {
		const { codex: _, ...restProviders } = config.providers;
		updateConfig({
			providers: restProviders,
			...(config.defaultProvider === "codex" ? { defaultProvider: undefined } : {}),
		});
	}
}

/** 現在の認証ステータスを取得 */
export function getAuthStatus(): Array<{
	provider: AuthProvider;
	method: AuthMethod | "env" | "none";
	detail: string;
}> {
	const statuses: Array<{
		provider: AuthProvider;
		method: AuthMethod | "env" | "none";
		detail: string;
	}> = [];

	// 環境変数チェック
	const envAuth = detectEnvAuth();

	// Claude
	try {
		const config = readConfig();
		if (envAuth.claude && process.env.ANTHROPIC_API_KEY) {
			statuses.push({
				provider: "claude",
				method: "env",
				detail: `環境変数 ANTHROPIC_API_KEY (${maskApiKey(process.env.ANTHROPIC_API_KEY)})`,
			});
		} else if (config.providers.claude?.apiKey) {
			statuses.push({
				provider: "claude",
				method: "api_key",
				detail: `API Key (${maskApiKey(config.providers.claude.apiKey)})`,
			});
		} else if (config.providers.claude?.authMethod === "cli_detect") {
			statuses.push({
				provider: "claude",
				method: "cli_detect",
				detail: "Claude Code CLI プロキシ",
			});
		} else {
			statuses.push({ provider: "claude", method: "none", detail: "未設定" });
		}

		// Codex
		if (envAuth.codex && process.env.OPENAI_API_KEY) {
			statuses.push({
				provider: "codex",
				method: "env",
				detail: `環境変数 OPENAI_API_KEY (${maskApiKey(process.env.OPENAI_API_KEY)})`,
			});
		} else if (config.providers.codex?.enabled) {
			statuses.push({
				provider: "codex",
				method: "cli_detect",
				detail: `Codex CLI (${config.providers.codex.cliPath ?? "auto"})`,
			});
		} else {
			statuses.push({ provider: "codex", method: "none", detail: "未設定" });
		}
	} catch {
		// config が読めない場合は環境変数のみ表示
		if (envAuth.claude) {
			statuses.push({
				provider: "claude",
				method: "env",
				detail: `環境変数 ANTHROPIC_API_KEY`,
			});
		}
		if (envAuth.codex) {
			statuses.push({
				provider: "codex",
				method: "env",
				detail: `環境変数 OPENAI_API_KEY`,
			});
		}
	}

	return statuses;
}

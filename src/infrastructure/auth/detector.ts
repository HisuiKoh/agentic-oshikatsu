import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { logger } from "../../shared/logger.js";
import type { ClaudeOAuth, DetectedAuth } from "./types.js";

/** Claude の ~/.claude/.credentials.json のスキーマ（claudeAiOauth フィールド） */
const ClaudeCredentialsFileSchema = z.object({
	claudeAiOauth: z.object({
		accessToken: z.string().min(1),
		refreshToken: z.string().min(1),
		expiresAt: z.number(),
	}),
});

/** Codex の ~/.codex/auth.json のスキーマ */
const _CodexAuthFileSchema = z.object({
	tokens: z.object({
		access_token: z.string().min(1),
		refresh_token: z.string().min(1),
		expires_at: z.number(),
	}),
});

/** ファイルのパーミッションが安全か検証 */
function hasSecurePermissions(filePath: string): boolean {
	try {
		const stat = statSync(filePath);
		const mode = stat.mode & 0o777;
		// owner のみ読み書き可能（0600）か、owner のみ読み取り可能（0400）
		return mode <= 0o600;
	} catch {
		return false;
	}
}

/**
 * ~/.claude/.credentials.json から Claude OAuth 情報を読み込む。
 * トークンリフレッシュ（DD-004）と初回検出の両方で使用。
 */
export function detectClaudeCredentials(): ClaudeOAuth | null {
	const home = process.env.HOME;
	if (!home) return null;

	const credPath = join(home, ".claude", ".credentials.json");
	if (!existsSync(credPath)) return null;

	if (!hasSecurePermissions(credPath)) {
		logger.warn(`${credPath} のパーミッションが安全ではありません。読み込みをスキップします`);
		return null;
	}

	try {
		const raw = readFileSync(credPath, "utf-8");
		const parsed = JSON.parse(raw);
		const result = ClaudeCredentialsFileSchema.safeParse(parsed);

		if (!result.success) {
			logger.debug("Claude 認証ファイルのパースに失敗", result.error.message);
			return null;
		}

		return result.data.claudeAiOauth;
	} catch (error) {
		logger.debug("Claude 認証ファイルの読み込みに失敗", error);
		return null;
	}
}

/** 既存の Claude CLI 認証情報を検出 */
function detectClaudeAuth(): DetectedAuth | null {
	const credentials = detectClaudeCredentials();
	if (!credentials) return null;

	const home = process.env.HOME ?? "";
	const credPath = join(home, ".claude", ".credentials.json");

	return {
		provider: "claude",
		method: "cli_detect",
		filePath: credPath,
		data: credentials,
	};
}

/** PATH から codex CLI を探す */
function detectCodexAuth(): DetectedAuth | null {
	try {
		const pathDirs = process.env.PATH?.split(":") ?? [];
		for (const dir of pathDirs) {
			const cliPath = join(dir, "codex");
			if (existsSync(cliPath)) {
				return {
					provider: "codex",
					method: "cli_detect",
					filePath: cliPath,
					data: { cliPath },
				};
			}
		}
		return null;
	} catch {
		return null;
	}
}

/** 環境変数からの認証情報を検出 */
export function detectEnvAuth(): { claude: boolean; codex: boolean } {
	return {
		claude: Boolean(process.env.ANTHROPIC_API_KEY),
		codex: Boolean(process.env.OPENAI_API_KEY),
	};
}

/** PATH から claude CLI を探す */
export function detectClaudeCliPath(): string | null {
	try {
		const pathDirs = process.env.PATH?.split(":") ?? [];
		for (const dir of pathDirs) {
			const cliPath = join(dir, "claude");
			if (existsSync(cliPath)) {
				return cliPath;
			}
		}
		return null;
	} catch {
		return null;
	}
}

/** 既存 CLI の認証情報を全て検出 */
export function detectExistingAuth(): DetectedAuth[] {
	const results: DetectedAuth[] = [];

	const claude = detectClaudeAuth();
	if (claude) results.push(claude);

	const codex = detectCodexAuth();
	if (codex) results.push(codex);

	return results;
}

/** API キーをマスクして表示用にする */
export function maskApiKey(key: string): string {
	if (key.length <= 8) return "****";
	return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

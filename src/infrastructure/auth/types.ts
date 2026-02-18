import { z } from "zod";

export type AuthProvider = "claude" | "codex";

export type AuthMethod = "api_key" | "oauth" | "cli_detect";

/** 外部 API の種別 */
export type ExternalApiType = "youtube" | "x";

/** Claude OAuth トークン（~/.claude/.credentials.json 由来） */
export const ClaudeOAuthSchema = z.object({
	accessToken: z.string().min(1),
	refreshToken: z.string().min(1),
	expiresAt: z.number(),
});

export type ClaudeOAuth = z.infer<typeof ClaudeOAuthSchema>;

/** Claude の認証情報 */
export const ClaudeAuthSchema = z.discriminatedUnion("method", [
	z.object({
		method: z.literal("api_key"),
		apiKey: z.string().min(1),
	}),
	z.object({
		method: z.literal("oauth"),
		oauth: ClaudeOAuthSchema,
	}),
	z.object({
		method: z.literal("cli_detect"),
		oauth: ClaudeOAuthSchema,
	}),
]);

export type ClaudeAuth = z.infer<typeof ClaudeAuthSchema>;

/** Codex の認証情報 */
export const CodexAuthSchema = z.object({
	enabled: z.boolean(),
	cliPath: z.string().min(1),
});

export type CodexAuth = z.infer<typeof CodexAuthSchema>;

/** 認証の検証結果 */
export interface AuthValidationResult {
	valid: boolean;
	provider: AuthProvider;
	method: AuthMethod;
	message: string;
}

/** 既存 CLI 認証の検出結果 */
export interface DetectedAuth {
	provider: AuthProvider;
	method: "cli_detect";
	filePath: string;
	data: ClaudeOAuth | { cliPath: string };
}

import { describe, expect, it } from "vitest";
import {
	ClaudeAuthSchema,
	ClaudeOAuthSchema,
	CodexAuthSchema,
} from "@/infrastructure/auth/types.js";

describe("ClaudeOAuthSchema", () => {
	it("有効な OAuth データを受け入れる", () => {
		const result = ClaudeOAuthSchema.safeParse({
			accessToken: "test-token",
			refreshToken: "test-refresh",
			expiresAt: 1234567890,
		});
		expect(result.success).toBe(true);
	});

	it("空の accessToken を拒否する", () => {
		const result = ClaudeOAuthSchema.safeParse({
			accessToken: "",
			refreshToken: "test-refresh",
			expiresAt: 1234567890,
		});
		expect(result.success).toBe(false);
	});

	it("expiresAt が数値でない場合を拒否する", () => {
		const result = ClaudeOAuthSchema.safeParse({
			accessToken: "test-token",
			refreshToken: "test-refresh",
			expiresAt: "not-a-number",
		});
		expect(result.success).toBe(false);
	});
});

describe("ClaudeAuthSchema", () => {
	it("api_key メソッドを受け入れる", () => {
		const result = ClaudeAuthSchema.safeParse({
			method: "api_key",
			apiKey: "sk-ant-api03-test",
		});
		expect(result.success).toBe(true);
	});

	it("oauth メソッドを受け入れる", () => {
		const result = ClaudeAuthSchema.safeParse({
			method: "oauth",
			oauth: {
				accessToken: "token",
				refreshToken: "refresh",
				expiresAt: 9999999999,
			},
		});
		expect(result.success).toBe(true);
	});

	it("cli_detect メソッドを受け入れる", () => {
		const result = ClaudeAuthSchema.safeParse({
			method: "cli_detect",
			oauth: {
				accessToken: "token",
				refreshToken: "refresh",
				expiresAt: 9999999999,
			},
		});
		expect(result.success).toBe(true);
	});

	it("不正なメソッドを拒否する", () => {
		const result = ClaudeAuthSchema.safeParse({
			method: "invalid",
			apiKey: "test",
		});
		expect(result.success).toBe(false);
	});

	it("api_key メソッドで apiKey が空の場合を拒否する", () => {
		const result = ClaudeAuthSchema.safeParse({
			method: "api_key",
			apiKey: "",
		});
		expect(result.success).toBe(false);
	});
});

describe("CodexAuthSchema", () => {
	it("有効な Codex 設定を受け入れる", () => {
		const result = CodexAuthSchema.safeParse({
			enabled: true,
			cliPath: "/usr/local/bin/codex",
		});
		expect(result.success).toBe(true);
	});

	it("空の cliPath を拒否する", () => {
		const result = CodexAuthSchema.safeParse({
			enabled: true,
			cliPath: "",
		});
		expect(result.success).toBe(false);
	});
});

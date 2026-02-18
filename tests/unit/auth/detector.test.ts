import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { detectEnvAuth, detectExistingAuth, maskApiKey } from "@/infrastructure/auth/detector.js";

const TEST_DIR = "./data/test-auth";
const FAKE_HOME = join(TEST_DIR, "home");
const CLAUDE_DIR = join(FAKE_HOME, ".claude");

beforeAll(() => {
	mkdirSync(CLAUDE_DIR, { recursive: true });
});

afterAll(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("maskApiKey", () => {
	it("長いキーの先頭4文字と末尾4文字を表示する", () => {
		expect(maskApiKey("sk-ant-api03-abcdefghij")).toBe("sk-a...ghij");
	});

	it("短いキーは **** に変換する", () => {
		expect(maskApiKey("short")).toBe("****");
		expect(maskApiKey("12345678")).toBe("****");
	});

	it("9文字以上のキーはマスクされる", () => {
		expect(maskApiKey("123456789")).toBe("1234...6789");
	});
});

describe("detectEnvAuth", () => {
	const originalEnv = process.env;

	afterEach(() => {
		process.env = originalEnv;
	});

	it("環境変数が未設定の場合 false を返す", () => {
		process.env = { ...originalEnv };
		delete process.env.ANTHROPIC_API_KEY;
		delete process.env.OPENAI_API_KEY;

		const result = detectEnvAuth();
		expect(result.claude).toBe(false);
		expect(result.codex).toBe(false);
	});

	it("ANTHROPIC_API_KEY が設定されている場合 claude が true", () => {
		process.env = { ...originalEnv, ANTHROPIC_API_KEY: "sk-ant-test" };

		const result = detectEnvAuth();
		expect(result.claude).toBe(true);
	});

	it("OPENAI_API_KEY が設定されている場合 codex が true", () => {
		process.env = { ...originalEnv, OPENAI_API_KEY: "sk-test" };

		const result = detectEnvAuth();
		expect(result.codex).toBe(true);
	});
});

describe("detectExistingAuth", () => {
	it("検出結果が配列で返される", () => {
		const results = detectExistingAuth();
		expect(Array.isArray(results)).toBe(true);
	});

	it("各検出結果は正しい構造を持つ", () => {
		const results = detectExistingAuth();
		for (const result of results) {
			expect(result).toHaveProperty("provider");
			expect(result).toHaveProperty("method", "cli_detect");
			expect(result).toHaveProperty("filePath");
			expect(result).toHaveProperty("data");
		}
	});
});

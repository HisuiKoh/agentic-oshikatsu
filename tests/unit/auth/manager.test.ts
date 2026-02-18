import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DIR = "./data/test-auth-manager";
const FAKE_HOME = join(TEST_DIR, "home");

beforeAll(() => {
	mkdirSync(join(FAKE_HOME, ".agentic-oshikatsu"), { recursive: true });
});

afterAll(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("setupClaudeCliProxy", () => {
	it("関数がエクスポートされている", async () => {
		const { setupClaudeCliProxy } = await import("@/infrastructure/auth/manager.js");
		expect(typeof setupClaudeCliProxy).toBe("function");
	});
});

describe("getAuthStatus", () => {
	it("関数がエクスポートされている", async () => {
		const { getAuthStatus } = await import("@/infrastructure/auth/manager.js");
		expect(typeof getAuthStatus).toBe("function");
	});
});

describe("removeAuth", () => {
	it("関数がエクスポートされている", async () => {
		const { removeAuth } = await import("@/infrastructure/auth/manager.js");
		expect(typeof removeAuth).toBe("function");
	});
});

describe("setupClaudeApiKey", () => {
	it("関数がエクスポートされている", async () => {
		const { setupClaudeApiKey } = await import("@/infrastructure/auth/manager.js");
		expect(typeof setupClaudeApiKey).toBe("function");
	});
});

describe("setupCodex", () => {
	it("関数がエクスポートされている", async () => {
		const { setupCodex } = await import("@/infrastructure/auth/manager.js");
		expect(typeof setupCodex).toBe("function");
	});
});

describe("removeExternalApi", () => {
	beforeEach(() => {
		vi.stubEnv("HOME", FAKE_HOME);

		// 初期設定ファイルを作成
		const configPath = join(FAKE_HOME, ".agentic-oshikatsu", "config.json");
		const config = {
			providers: {},
			defaultProvider: "claude",
			models: { default: "claude-sonnet-4-5-20250929", linter: "claude-haiku-4-5-20251001" },
			externalApis: { youtube: "AIzaTest123", x: "BearerTokenTest" },
			locale: "ja",
			notifications: { discord: { enabled: false } },
			budget: { defaultCurrency: "JPY" },
			linter: {},
		};
		writeFileSync(configPath, JSON.stringify(config), { mode: 0o600 });
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	it("YouTube の API Key のみ削除され X は保持される", async () => {
		const { removeExternalApi, readConfig } = await import("@/infrastructure/config/manager.js");

		removeExternalApi("youtube");

		const config = readConfig();
		expect(config.externalApis.youtube).toBeUndefined();
		expect(config.externalApis.x).toBe("BearerTokenTest");
	});

	it("X の Bearer Token のみ削除され YouTube は保持される", async () => {
		const { removeExternalApi, readConfig } = await import("@/infrastructure/config/manager.js");

		removeExternalApi("x");

		const config = readConfig();
		expect(config.externalApis.youtube).toBe("AIzaTest123");
		expect(config.externalApis.x).toBeUndefined();
	});
});

describe("updateConfig で externalApis を設定", () => {
	beforeEach(() => {
		vi.stubEnv("HOME", FAKE_HOME);

		const configPath = join(FAKE_HOME, ".agentic-oshikatsu", "config.json");
		const config = {
			providers: {},
			defaultProvider: "claude",
			models: { default: "claude-sonnet-4-5-20250929", linter: "claude-haiku-4-5-20251001" },
			externalApis: {},
			locale: "ja",
			notifications: { discord: { enabled: false } },
			budget: { defaultCurrency: "JPY" },
			linter: {},
		};
		writeFileSync(configPath, JSON.stringify(config), { mode: 0o600 });
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	it("YouTube API Key が正しく保存される", async () => {
		const { updateConfig, readConfig } = await import("@/infrastructure/config/manager.js");

		updateConfig({ externalApis: { youtube: "AIzaNewKey" } });

		const config = readConfig();
		expect(config.externalApis.youtube).toBe("AIzaNewKey");
	});
});

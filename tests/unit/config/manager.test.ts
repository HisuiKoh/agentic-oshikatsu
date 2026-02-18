import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "@/infrastructure/config/defaults.js";

const TEST_HOME = join(process.cwd(), "data/test/home");

// HOME をテスト用に上書き
vi.stubEnv("HOME", TEST_HOME);

// stubEnv 後に import（HOME を参照するため）
const { ensureAppDir, getAppDir, isInitialized, readConfig, writeConfig } = await import(
	"@/infrastructure/config/manager.js"
);

beforeAll(() => {
	if (!existsSync(TEST_HOME)) {
		mkdirSync(TEST_HOME, { recursive: true });
	}
});

beforeEach(() => {
	const appDir = getAppDir();
	if (existsSync(appDir)) {
		rmSync(appDir, { recursive: true, force: true });
	}
});

afterAll(() => {
	rmSync(TEST_HOME, { recursive: true, force: true });
	vi.unstubAllEnvs();
});

describe("ConfigManager", () => {
	it("getAppDir が ~/.agentic-oshikatsu を返す", () => {
		const dir = getAppDir();
		expect(dir).toBe(join(TEST_HOME, ".agentic-oshikatsu"));
	});

	it("isInitialized は初期化前に false を返す", () => {
		expect(isInitialized()).toBe(false);
	});

	it("ensureAppDir でディレクトリが作成される", () => {
		ensureAppDir();
		const dir = getAppDir();
		expect(existsSync(dir)).toBe(true);
	});

	it("writeConfig + readConfig で設定を読み書きできる", () => {
		writeConfig(DEFAULT_CONFIG);
		expect(isInitialized()).toBe(true);

		const config = readConfig();
		expect(config.defaultProvider).toBe("claude");
		expect(config.locale).toBe("ja");
	});

	it("config.json が 0600 パーミッションで作成される", () => {
		writeConfig(DEFAULT_CONFIG);
		const configPath = join(getAppDir(), "config.json");
		const stat = statSync(configPath);
		const mode = stat.mode & 0o777;
		expect(mode).toBe(0o600);
	});

	it("未初期化で readConfig するとエラー", () => {
		expect(() => readConfig()).toThrow("設定ファイルが見つかりません");
	});
});

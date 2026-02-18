import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const CLI_PATH = join(__dirname, "../../bin/oshi.ts");
const TEST_HOME = join(tmpdir(), `oshi-e2e-${Date.now()}`);

function run(args: string[], env?: Record<string, string>): string {
	return execFileSync("npx", ["tsx", CLI_PATH, ...args], {
		encoding: "utf-8",
		timeout: 15_000,
		env: {
			...process.env,
			HOME: TEST_HOME,
			XDG_CONFIG_HOME: join(TEST_HOME, ".config"),
			...env,
		},
		cwd: join(__dirname, "../.."),
	});
}

beforeAll(() => {
	mkdirSync(TEST_HOME, { recursive: true });
});

afterAll(() => {
	if (existsSync(TEST_HOME)) {
		rmSync(TEST_HOME, { recursive: true, force: true });
	}
});

describe("CLI E2E", () => {
	it("help を表示できる", () => {
		const output = run(["help"]);
		expect(output).toContain("agentic-oshikatsu");
		expect(output).toContain("oshi <command>");
		expect(output).toContain("--lang");
	});

	it("--help フラグでヘルプを表示", () => {
		const output = run(["--help"]);
		expect(output).toContain("agentic-oshikatsu");
	});

	it("help は英語ロケールでも表示可能", () => {
		const output = run(["--lang", "en", "help"]);
		expect(output).toContain("agentic-oshikatsu");
	});

	it("不明なコマンドはエラー", () => {
		try {
			run(["unknown-command"]);
			expect.fail("Should have thrown");
		} catch (error) {
			const err = error as { stdout?: string; stderr?: string; status?: number };
			const output = (err.stdout ?? "") + (err.stderr ?? "");
			expect(output).toContain("不明なコマンド");
		}
	});

	it("不明なコマンドは英語ロケールで英語エラー", () => {
		try {
			run(["--lang", "en", "unknown-command"]);
			expect.fail("Should have thrown");
		} catch (error) {
			const err = error as { stdout?: string; stderr?: string; status?: number };
			const output = (err.stdout ?? "") + (err.stderr ?? "");
			expect(output).toContain("Unknown command");
		}
	});

	it("init 前の list は初期化エラー", () => {
		// 未初期化時はエラーメッセージを出力して正常終了
		const output = run(["list"]);
		expect(output).toContain("oshi init");
	});

	it("init 前の cost は初期化エラー", () => {
		const output = run(["cost"]);
		expect(output).toContain("oshi init");
	});

	it("--lang invalid はエラー終了", () => {
		try {
			run(["--lang", "invalid", "help"]);
			expect.fail("Should have thrown");
		} catch (error) {
			const err = error as { stdout?: string; stderr?: string };
			const output = (err.stdout ?? "") + (err.stderr ?? "");
			expect(output).toContain("Invalid language");
		}
	});
});

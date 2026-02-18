import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { safeEnv, spawnWithStdin } from "@/infrastructure/ai/subprocess.js";

describe("spawnWithStdin", () => {
	it("stdin 経由で入力を渡して stdout を取得できる", async () => {
		const result = await spawnWithStdin("cat", [], "hello world", {
			timeout: 5000,
		});
		expect(result).toBe("hello world");
	});

	it("長い入力でも正しく処理できる", async () => {
		const longInput = "x".repeat(10_000);
		const result = await spawnWithStdin("cat", [], longInput, {
			timeout: 5000,
		});
		expect(result).toBe(longInput);
	});

	it("日本語・特殊文字を含む入力を正しく処理できる", async () => {
		const input = '{"name": "杵月のあ", "tags": ["VTuber", "<推し>"]}\n改行あり';
		const result = await spawnWithStdin("cat", [], input, {
			timeout: 5000,
		});
		expect(result).toBe(input);
	});

	it("タイムアウトでプロセスが kill される", async () => {
		await expect(
			spawnWithStdin(
				"node",
				["-e", "setTimeout(() => {}, 60000)"],
				"",
				{ timeout: 200 },
			),
		).rejects.toThrow("Process timed out");
	}, 10000);

	it("タイムアウトエラーに killed フラグが付く", async () => {
		try {
			await spawnWithStdin(
				"node",
				["-e", "setTimeout(() => {}, 60000)"],
				"",
				{ timeout: 200 },
			);
			expect.fail("Should have thrown");
		} catch (error) {
			expect((error as { killed?: boolean }).killed).toBe(true);
		}
	}, 10000);

	it("存在しないコマンドで ENOENT エラーが発生する", async () => {
		await expect(
			spawnWithStdin("/nonexistent/command", [], "", { timeout: 5000 }),
		).rejects.toThrow("ENOENT");
	});

	it("非ゼロ終了コードでエラーが発生する", async () => {
		await expect(
			spawnWithStdin("sh", ["-c", "exit 1"], "", { timeout: 5000 }),
		).rejects.toThrow("Process exited with code 1");
	});

	it("非ゼロ終了コードでも stdout があれば resolve する", async () => {
		// stderr に出力しつつ exit 1 でも stdout に内容があれば成功扱い
		const result = await spawnWithStdin(
			"sh",
			["-c", "echo 'output' && exit 1"],
			"",
			{ timeout: 5000 },
		);
		expect(result).toContain("output");
	});

	it("env オプションでサブプロセスの環境変数を制御できる", async () => {
		const result = await spawnWithStdin(
			"sh",
			["-c", "echo $TEST_VAR"],
			"",
			{ timeout: 5000, env: { ...process.env, TEST_VAR: "custom_value" } },
		);
		expect(result.trim()).toBe("custom_value");
	});
});

describe("safeEnv", () => {
	it("親プロセスの環境変数を継承する", () => {
		const env = safeEnv();
		expect(env.HOME).toBe(process.env.HOME);
		expect(env.PATH).toBe(process.env.PATH);
	});

	it("ANTHROPIC_API_KEY を除外する", () => {
		const original = process.env.ANTHROPIC_API_KEY;
		process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
		try {
			const env = safeEnv();
			expect(env.ANTHROPIC_API_KEY).toBeUndefined();
		} finally {
			if (original !== undefined) {
				process.env.ANTHROPIC_API_KEY = original;
			} else {
				delete process.env.ANTHROPIC_API_KEY;
			}
		}
	});

	it("OPENAI_API_KEY を除外する", () => {
		const original = process.env.OPENAI_API_KEY;
		process.env.OPENAI_API_KEY = "sk-test-key";
		try {
			const env = safeEnv();
			expect(env.OPENAI_API_KEY).toBeUndefined();
		} finally {
			if (original !== undefined) {
				process.env.OPENAI_API_KEY = original;
			} else {
				delete process.env.OPENAI_API_KEY;
			}
		}
	});

	it("TMPDIR などシステム変数を保持する", () => {
		const original = process.env.TMPDIR;
		process.env.TMPDIR = "/tmp/test";
		try {
			const env = safeEnv();
			expect(env.TMPDIR).toBe("/tmp/test");
		} finally {
			if (original !== undefined) {
				process.env.TMPDIR = original;
			} else {
				delete process.env.TMPDIR;
			}
		}
	});
});

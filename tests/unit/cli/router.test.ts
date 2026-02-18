import { describe, expect, it, vi } from "vitest";
import { routeCommand } from "@/cli/router.js";

// @clack/prompts のモック
vi.mock("@clack/prompts", () => ({
	log: {
		error: vi.fn(),
		info: vi.fn(),
		success: vi.fn(),
	},
	intro: vi.fn(),
	outro: vi.fn(),
}));

// 引数なし + 非 TTY → dashboard の静的表示にフォールバック
// dashboard コマンドは isInitialized() を呼ぶのでモック
vi.mock("@/infrastructure/config/manager.js", () => ({
	isInitialized: vi.fn(() => false),
	getDbPath: vi.fn(() => ":memory:"),
}));

describe("routeCommand", () => {
	it("不明なコマンドでエラーコードが設定される", async () => {
		process.exitCode = 0;
		await routeCommand(["unknown-command"]);
		expect(process.exitCode).toBe(1);
	});

	it("引数なしで非 TTY 時はダッシュボード（静的表示）にフォールバック", async () => {
		// 非 TTY 環境（テスト環境）では dashboard --static にフォールバック
		process.exitCode = 0;
		await routeCommand([]);
		// エラーで終了しないこと（初期化エラーで return するが exitCode は 0 のまま）
		expect(process.exitCode).toBe(0);
	});

	it("--help でヘルプが表示される", async () => {
		const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		process.exitCode = 0;
		await routeCommand(["--help"]);
		expect(process.exitCode).toBe(0);
		consoleSpy.mockRestore();
	});
});

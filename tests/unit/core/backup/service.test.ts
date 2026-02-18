import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBackup, listBackups, restoreBackup } from "@/core/backup/service.js";

// config/manager をモック
vi.mock("@/infrastructure/config/manager.js", () => ({
	getAppDir: vi.fn(),
	getDbPath: vi.fn(),
}));

import { getAppDir, getDbPath } from "@/infrastructure/config/manager.js";

const mockGetAppDir = vi.mocked(getAppDir);
const mockGetDbPath = vi.mocked(getDbPath);

let testDir: string;

beforeEach(() => {
	testDir = join(tmpdir(), `oshi-backup-test-${Date.now()}`);
	mkdirSync(testDir, { recursive: true });
	mockGetAppDir.mockReturnValue(testDir);
	mockGetDbPath.mockReturnValue(join(testDir, "oshikatsu.db"));

	// テスト用 DB ファイル作成
	writeFileSync(join(testDir, "oshikatsu.db"), "test-db-content");
});

afterEach(() => {
	rmSync(testDir, { recursive: true, force: true });
});

describe("backup service", () => {
	it("バックアップを作成できる", () => {
		const result = createBackup();

		expect(result.name).toMatch(/^oshikatsu-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.db$/);
		expect(existsSync(result.path)).toBe(true);
	});

	it("バックアップ一覧を取得できる", () => {
		createBackup();
		const backups = listBackups();

		expect(backups.length).toBe(1);
		expect(backups[0].name).toContain("oshikatsu-");
	});

	it("バックアップが 5 世代を超えると古いものが削除される", () => {
		// 6 回バックアップを作成（ファイル名が衝突しないよう少し待つ代わりに手動作成）
		const backupDir = join(testDir, "backups");
		mkdirSync(backupDir, { recursive: true });

		for (let i = 0; i < 7; i++) {
			const name = `oshikatsu-2026-01-0${i + 1}_00-00-00.db`;
			writeFileSync(join(backupDir, name), `backup-${i}`);
		}

		// createBackup で 1 つ追加 → 世代管理で古いものが削除される
		createBackup();

		const backups = listBackups();
		expect(backups.length).toBeLessThanOrEqual(5);
	});

	it("バックアップディレクトリが未作成でも一覧は空配列を返す", () => {
		const backups = listBackups();
		expect(backups).toEqual([]);
	});

	it("リストアできる", () => {
		const backup = createBackup();

		// DB を変更
		writeFileSync(join(testDir, "oshikatsu.db"), "modified-content");

		// リストア
		restoreBackup(backup.path);

		// リストア前のバックアップが作成される（pre-restore- プレフィックス付き）
		const backupDir = join(testDir, "backups");
		const files = readdirSync(backupDir);
		expect(files.some((f) => f.includes("pre-restore"))).toBe(true);
	});

	it("存在しないバックアップのリストアはエラー", () => {
		expect(() => restoreBackup("/nonexistent/path.db")).toThrow("見つかりません");
	});
});

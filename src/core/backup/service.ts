import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { getAppDir, getDbPath } from "../../infrastructure/config/manager.js";
import { logger } from "../../shared/logger.js";

const BACKUP_DIR_NAME = "backups";
const MAX_GENERATIONS = 5;

/** バックアップ用ディレクトリパス */
export function getBackupDir(): string {
	return join(getAppDir(), BACKUP_DIR_NAME);
}

/** バックアップディレクトリを作成 */
function ensureBackupDir(): string {
	const dir = getBackupDir();
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true, mode: 0o700 });
	}
	return dir;
}

/** バックアップファイル名を生成 */
function generateBackupName(): string {
	const now = new Date();
	const ts = now.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
	return `oshikatsu-${ts}.db`;
}

/** 既存のバックアップ一覧を取得（新しい順） */
export function listBackups(): Array<{
	name: string;
	path: string;
	createdAt: Date;
	size: number;
}> {
	const dir = getBackupDir();
	if (!existsSync(dir)) return [];

	return readdirSync(dir)
		.filter((f) => f.startsWith("oshikatsu-") && f.endsWith(".db"))
		.map((name) => {
			const filePath = join(dir, name);
			const stat = statSync(filePath);
			return { name, path: filePath, createdAt: stat.mtime, size: stat.size };
		})
		.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** DB バックアップを作成（最新 N 世代を保持） */
export function createBackup(): { path: string; name: string } {
	const dbPath = getDbPath();
	if (!existsSync(dbPath)) {
		throw new Error("データベースが見つかりません。`oshi init` を実行してください。");
	}

	const dir = ensureBackupDir();
	const name = generateBackupName();
	const backupPath = join(dir, name);

	copyFileSync(dbPath, backupPath);
	logger.info(`バックアップを作成しました: ${name}`);

	// 世代管理（古いものを削除）
	pruneOldBackups();

	return { path: backupPath, name };
}

/** 古いバックアップを削除（MAX_GENERATIONS を超えるもの） */
function pruneOldBackups(): void {
	const backups = listBackups();
	if (backups.length <= MAX_GENERATIONS) return;

	for (const old of backups.slice(MAX_GENERATIONS)) {
		rmSync(old.path);
		logger.debug(`古いバックアップを削除: ${old.name}`);
	}
}

/** バックアップからリストアする */
export function restoreBackup(backupPath: string): void {
	if (!existsSync(backupPath)) {
		throw new Error(`バックアップファイルが見つかりません: ${backupPath}`);
	}

	const dbPath = getDbPath();

	// 現在の DB をバックアップしてからリストア
	if (existsSync(dbPath)) {
		const dir = ensureBackupDir();
		const safeName = `pre-restore-${basename(generateBackupName())}`;
		copyFileSync(dbPath, join(dir, safeName));
		logger.info(`リストア前のバックアップを作成: ${safeName}`);
	}

	copyFileSync(backupPath, dbPath);
	logger.info(`リストアしました: ${backupPath}`);
}

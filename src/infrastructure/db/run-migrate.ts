import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** migrations フォルダを解決（ビルド後の dist/ 配下でも動作する） */
function getMigrationsFolder(): string {
	// 同ディレクトリ直下（tsx 実行時 or migrations をコピー済みの場合）
	const direct = resolve(__dirname, "migrations");
	if (existsSync(direct)) return direct;

	// ビルド後: dist/src/infrastructure/db/ → プロジェクトルートの src/ 側へフォールバック
	const fallback = resolve(__dirname, "../../../../src/infrastructure/db/migrations");
	if (existsSync(fallback)) return fallback;

	throw new Error(`マイグレーションフォルダが見つかりません: ${direct}`);
}

/** DB マイグレーションを実行（プログラム呼び出し用） */
export function runMigrate(dbPath: string): void {
	const sqlite = new Database(dbPath);
	sqlite.pragma("journal_mode = WAL");
	sqlite.pragma("foreign_keys = ON");

	const db = drizzle(sqlite);

	try {
		migrate(db, { migrationsFolder: getMigrationsFolder() });
	} finally {
		sqlite.close();
	}
}

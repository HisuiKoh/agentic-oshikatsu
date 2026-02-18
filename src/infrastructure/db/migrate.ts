import { existsSync, mkdirSync } from "node:fs";
import { dirname, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_DB_PATH = "./data/oshikatsu.db";

function validateDbPath(userPath: string): string {
	const normalized = normalize(userPath);
	const resolved = resolve(normalized);

	if (!resolved.endsWith(".db")) {
		throw new Error("DB ファイルは .db 拡張子が必要です");
	}

	return resolved;
}

const dbPath = process.argv[2] ? validateDbPath(process.argv[2]) : resolve(DEFAULT_DB_PATH);

// DB ディレクトリがなければ作成
const dbDir = dirname(dbPath);
if (!existsSync(dbDir)) {
	mkdirSync(dbDir, { recursive: true });
}

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

const db = drizzle(sqlite);

const direct = resolve(__dirname, "migrations");
const fallback = resolve(__dirname, "../../../../src/infrastructure/db/migrations");
const migrationsFolder = existsSync(direct) ? direct : fallback;

migrate(db, { migrationsFolder });

console.log("マイグレーション完了:", dbPath);
sqlite.close();

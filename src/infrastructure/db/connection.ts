import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

let sqlite: InstanceType<typeof Database> | null = null;
let db: ReturnType<typeof createDb> | null = null;
let currentDbPath: string | null = null;

function createDb(dbPath: string) {
	const sqliteInstance = new Database(dbPath);

	// WAL モード + 推奨プラグマ設定
	sqliteInstance.pragma("journal_mode = WAL");
	sqliteInstance.pragma("busy_timeout = 5000");
	sqliteInstance.pragma("foreign_keys = ON");

	sqlite = sqliteInstance;
	return drizzle(sqliteInstance, { schema });
}

export function getDb(dbPath: string) {
	if (db && currentDbPath !== dbPath) {
		throw new Error(`DB は既に ${currentDbPath} で初期化されています`);
	}
	if (!db) {
		db = createDb(dbPath);
		currentDbPath = dbPath;
	}
	return db;
}

export function closeDb() {
	if (sqlite) {
		sqlite.close();
		sqlite = null;
	}
	db = null;
	currentDbPath = null;
}

export type AppDatabase = ReturnType<typeof createDb>;

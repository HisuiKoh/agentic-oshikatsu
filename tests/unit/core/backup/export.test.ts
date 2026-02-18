import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exportToFile, exportToJson, importFromFile } from "@/core/backup/export.js";
import * as schema from "@/infrastructure/db/schema.js";

let db: ReturnType<typeof drizzle<typeof schema>>;
let testDir: string;

beforeEach(() => {
	testDir = join(tmpdir(), `oshi-export-test-${Date.now()}`);
	const sqlite = new Database(":memory:");
	sqlite.pragma("journal_mode = WAL");
	sqlite.pragma("foreign_keys = ON");
	db = drizzle(sqlite, { schema });

	// テーブル作成
	sqlite.exec(`
		CREATE TABLE oshis (
			id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
			subcategory TEXT, description TEXT, image_url TEXT,
			registered_at TEXT NOT NULL, metadata TEXT
		);
		CREATE TABLE oshi_attributes (
			id TEXT PRIMARY KEY, oshi_id TEXT NOT NULL REFERENCES oshis(id) ON DELETE CASCADE,
			key TEXT NOT NULL, value TEXT NOT NULL, source TEXT, collected_at TEXT,
			UNIQUE(oshi_id, key)
		);
		CREATE TABLE collected_info (
			id TEXT PRIMARY KEY, oshi_id TEXT NOT NULL REFERENCES oshis(id) ON DELETE CASCADE,
			source_plugin TEXT NOT NULL, title TEXT NOT NULL, url TEXT UNIQUE,
			summary TEXT, category TEXT, importance INTEGER, sentiment TEXT,
			raw_content TEXT, collected_at TEXT NOT NULL, published_at TEXT, event_date TEXT, is_read INTEGER NOT NULL DEFAULT 0,
			relevance_score INTEGER, approval_status TEXT NOT NULL DEFAULT 'approved'
		);
		CREATE TABLE budget_entries (
			id TEXT PRIMARY KEY, oshi_id TEXT REFERENCES oshis(id) ON DELETE SET NULL,
			type TEXT NOT NULL, category TEXT, amount INTEGER NOT NULL,
			currency TEXT NOT NULL DEFAULT 'JPY', description TEXT, date TEXT NOT NULL, metadata TEXT
		);
		CREATE TABLE budget_limits (
			id TEXT PRIMARY KEY, oshi_id TEXT REFERENCES oshis(id) ON DELETE SET NULL,
			type TEXT NOT NULL, period TEXT NOT NULL, "limit" INTEGER NOT NULL,
			currency TEXT NOT NULL DEFAULT 'JPY', created_at TEXT NOT NULL
		);
		CREATE TABLE suggestions (
			id TEXT PRIMARY KEY, oshi_id TEXT NOT NULL REFERENCES oshis(id) ON DELETE CASCADE,
			category TEXT, content TEXT NOT NULL, context TEXT, created_at TEXT NOT NULL
		);
		CREATE TABLE lint_results (
			id TEXT PRIMARY KEY, suggestion_id TEXT REFERENCES suggestions(id) ON DELETE CASCADE,
			action TEXT NOT NULL, verdict TEXT NOT NULL, evaluations TEXT, timestamp TEXT NOT NULL
		);
		CREATE TABLE user_profile (
			id TEXT PRIMARY KEY, formality TEXT NOT NULL DEFAULT 'neutral',
			feedback_style TEXT NOT NULL DEFAULT 'balanced', detail_level TEXT NOT NULL DEFAULT 'normal',
			decoration TEXT NOT NULL DEFAULT 'moderate', oshi_intensity TEXT NOT NULL DEFAULT 'moderate',
			locale TEXT NOT NULL DEFAULT 'ja', updated_at TEXT NOT NULL
		);
	`);
});

afterEach(() => {
	if (existsSync(testDir)) {
		rmSync(testDir, { recursive: true, force: true });
	}
});

describe("export/import", () => {
	it("空の DB をエクスポートできる", () => {
		const data = exportToJson(db);

		expect(data.version).toBe("1.0.0");
		expect(data.exportedAt).toBeDefined();
		expect(data.oshis).toEqual([]);
		expect(data.collectedInfo).toEqual([]);
	});

	it("データ入りの DB をエクスポートできる", () => {
		db.insert(schema.oshis)
			.values({
				id: "oshi-1",
				name: "テスト推し",
				category: "vtuber",
				registeredAt: "2026-01-01T00:00:00Z",
			})
			.run();

		const data = exportToJson(db);

		expect(data.oshis).toHaveLength(1);
		expect((data.oshis[0] as Record<string, string>).name).toBe("テスト推し");
	});

	it("JSON ファイルに書き出せる", () => {
		const { mkdirSync: mkDir } = require("node:fs");
		mkDir(testDir, { recursive: true });
		const filePath = join(testDir, "test-export.json");

		exportToFile(db, filePath);

		expect(existsSync(filePath)).toBe(true);
		const content = JSON.parse(readFileSync(filePath, "utf-8"));
		expect(content.version).toBe("1.0.0");
	});

	it("JSON ファイルからインポートできる", () => {
		// データを作成してエクスポート
		db.insert(schema.oshis)
			.values({
				id: "oshi-export",
				name: "エクスポート推し",
				category: "character",
				registeredAt: "2026-01-01T00:00:00Z",
			})
			.run();

		const data = exportToJson(db);

		// DB をクリアして別 DB にインポート
		const sqlite2 = new Database(":memory:");
		sqlite2.pragma("journal_mode = WAL");
		sqlite2.pragma("foreign_keys = ON");
		const db2 = drizzle(sqlite2, { schema });
		sqlite2.exec(`
			CREATE TABLE oshis (
				id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
				subcategory TEXT, description TEXT, image_url TEXT,
				registered_at TEXT NOT NULL, metadata TEXT
			);
			CREATE TABLE oshi_attributes (
				id TEXT PRIMARY KEY, oshi_id TEXT NOT NULL,
				key TEXT NOT NULL, value TEXT NOT NULL, source TEXT, collected_at TEXT,
				UNIQUE(oshi_id, key)
			);
			CREATE TABLE collected_info (
				id TEXT PRIMARY KEY, oshi_id TEXT NOT NULL,
				source_plugin TEXT NOT NULL, title TEXT NOT NULL, url TEXT UNIQUE,
				summary TEXT, category TEXT, importance INTEGER, sentiment TEXT,
				raw_content TEXT, collected_at TEXT NOT NULL, published_at TEXT, event_date TEXT, is_read INTEGER NOT NULL DEFAULT 0
			);
			CREATE TABLE budget_entries (
				id TEXT PRIMARY KEY, oshi_id TEXT,
				type TEXT NOT NULL, category TEXT, amount INTEGER NOT NULL,
				currency TEXT NOT NULL DEFAULT 'JPY', description TEXT, date TEXT NOT NULL, metadata TEXT
			);
			CREATE TABLE budget_limits (
				id TEXT PRIMARY KEY, oshi_id TEXT,
				type TEXT NOT NULL, period TEXT NOT NULL, "limit" INTEGER NOT NULL,
				currency TEXT NOT NULL DEFAULT 'JPY', created_at TEXT NOT NULL
			);
			CREATE TABLE suggestions (
				id TEXT PRIMARY KEY, oshi_id TEXT NOT NULL,
				category TEXT, content TEXT NOT NULL, context TEXT, created_at TEXT NOT NULL
			);
			CREATE TABLE lint_results (
				id TEXT PRIMARY KEY, suggestion_id TEXT,
				action TEXT NOT NULL, verdict TEXT NOT NULL, evaluations TEXT, timestamp TEXT NOT NULL
			);
			CREATE TABLE user_profile (
				id TEXT PRIMARY KEY, formality TEXT NOT NULL DEFAULT 'neutral',
				feedback_style TEXT NOT NULL DEFAULT 'balanced', detail_level TEXT NOT NULL DEFAULT 'normal',
				decoration TEXT NOT NULL DEFAULT 'moderate', oshi_intensity TEXT NOT NULL DEFAULT 'moderate',
				locale TEXT NOT NULL DEFAULT 'ja', updated_at TEXT NOT NULL
			);
		`);

		const { mkdirSync: mkDir } = require("node:fs");
		mkDir(testDir, { recursive: true });
		const filePath = join(testDir, "import-test.json");
		writeFileSync(filePath, JSON.stringify(data));

		const result = importFromFile(db2, filePath);

		expect(result.imported).toBeGreaterThan(0);
		const oshis = db2.select().from(schema.oshis).all();
		expect(oshis).toHaveLength(1);
		expect(oshis[0].name).toBe("エクスポート推し");
	});

	it("不正なエクスポートファイルはエラー", () => {
		const { mkdirSync: mkDir } = require("node:fs");
		mkDir(testDir, { recursive: true });
		const filePath = join(testDir, "invalid.json");
		writeFileSync(filePath, JSON.stringify({ invalid: true }));

		expect(() => importFromFile(db, filePath)).toThrow("形式が不正");
	});
});

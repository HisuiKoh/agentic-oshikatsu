import { existsSync, mkdirSync, rmSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/infrastructure/db/schema.js";

const TEST_DB_DIR = "./data/test-usage";
const TEST_DB_PATH = `${TEST_DB_DIR}/test-usage.db`;

let sqlite: InstanceType<typeof Database>;
let db: ReturnType<typeof drizzle>;

beforeAll(() => {
	if (!existsSync(TEST_DB_DIR)) {
		mkdirSync(TEST_DB_DIR, { recursive: true });
	}
	sqlite = new Database(TEST_DB_PATH);
	sqlite.pragma("journal_mode = WAL");
	sqlite.pragma("foreign_keys = ON");
	db = drizzle(sqlite, { schema });

	migrate(db, {
		migrationsFolder: new URL("../../../src/infrastructure/db/migrations", import.meta.url)
			.pathname,
	});
});

beforeEach(() => {
	sqlite.exec("DELETE FROM ai_usage");
});

afterAll(() => {
	sqlite.close();
	rmSync(TEST_DB_DIR, { recursive: true, force: true });
});

describe("ai_usage テーブル", () => {
	it("使用量レコードを挿入できる", () => {
		db.insert(schema.aiUsage)
			.values({
				id: "test-usage-1",
				provider: "claude",
				model: "claude-sonnet-4-5-20250929",
				inputTokens: 500,
				outputTokens: 200,
				cacheTokens: 0,
				cost: 0.0045,
				purpose: "oshi_registration",
				timestamp: new Date().toISOString(),
			})
			.run();

		const rows = db.select().from(schema.aiUsage).all();
		expect(rows).toHaveLength(1);
		expect(rows[0].provider).toBe("claude");
		expect(rows[0].inputTokens).toBe(500);
	});

	it("複数プロバイダーのレコードを保存できる", () => {
		db.insert(schema.aiUsage)
			.values({
				id: "test-usage-2",
				provider: "claude",
				model: "claude-haiku-4-5-20251001",
				inputTokens: 100,
				outputTokens: 50,
				cacheTokens: 0,
				cost: 0.0003,
				purpose: "linting",
				timestamp: new Date().toISOString(),
			})
			.run();

		db.insert(schema.aiUsage)
			.values({
				id: "test-usage-3",
				provider: "codex",
				model: "codex",
				inputTokens: 200,
				outputTokens: 100,
				cacheTokens: 0,
				cost: 0,
				purpose: "suggestion",
				timestamp: new Date().toISOString(),
			})
			.run();

		const rows = db.select().from(schema.aiUsage).all();
		expect(rows).toHaveLength(2);

		const providers = rows.map((r) => r.provider);
		expect(providers).toContain("claude");
		expect(providers).toContain("codex");
	});

	it("purpose が正しく保存される", () => {
		const purposes = ["oshi_registration", "info_analysis", "suggestion", "linting", "other"];

		for (let i = 0; i < purposes.length; i++) {
			db.insert(schema.aiUsage)
				.values({
					id: `test-purpose-${i}`,
					provider: "claude",
					model: "test",
					inputTokens: 10,
					outputTokens: 5,
					cacheTokens: 0,
					cost: 0,
					purpose: purposes[i] as "oshi_registration",
					timestamp: new Date().toISOString(),
				})
				.run();
		}

		const rows = db.select().from(schema.aiUsage).all();
		expect(rows).toHaveLength(purposes.length);
	});
});

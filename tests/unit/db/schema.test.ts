import { existsSync, mkdirSync, rmSync } from "node:fs";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/infrastructure/db/schema.js";
import { generateId } from "@/shared/id.js";

const TEST_DB_DIR = "./data/test";
const TEST_DB_PATH = `${TEST_DB_DIR}/test-schema.db`;

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

afterAll(() => {
	sqlite.close();
	rmSync(TEST_DB_DIR, { recursive: true, force: true });
});

describe("DB スキーマ", () => {
	it("推しを挿入・取得できる", () => {
		const oshi = {
			id: generateId(),
			name: "杵月のあ",
			category: "vtuber",
			description: "VTuber",
			registeredAt: new Date().toISOString(),
		};

		db.insert(schema.oshis).values(oshi).run();
		const result = db.select().from(schema.oshis).all();

		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("杵月のあ");
	});

	it("推し属性を挿入でき、CASCADE 削除が動作する", () => {
		const oshiId = generateId();
		db.insert(schema.oshis)
			.values({
				id: oshiId,
				name: "テスト推し",
				category: "person",
				registeredAt: new Date().toISOString(),
			})
			.run();

		db.insert(schema.oshiAttributes)
			.values({
				id: generateId(),
				oshiId,
				key: "birthday",
				value: "1月1日",
			})
			.run();

		// 推しを削除 → 属性も消える
		db.delete(schema.oshis).where(eq(schema.oshis.id, oshiId)).run();

		const attrs = db
			.select()
			.from(schema.oshiAttributes)
			.where(eq(schema.oshiAttributes.oshiId, oshiId))
			.all();
		expect(attrs).toHaveLength(0);
	});

	it("oshi_attributes の (oshiId, key) ユニーク制約が動作する", () => {
		const oshiId = generateId();
		db.insert(schema.oshis)
			.values({
				id: oshiId,
				name: "ユニーク制約テスト",
				category: "character",
				registeredAt: new Date().toISOString(),
			})
			.run();

		db.insert(schema.oshiAttributes)
			.values({ id: generateId(), oshiId, key: "work", value: "作品A" })
			.run();

		// 同じキーで再挿入 → エラー
		expect(() =>
			db
				.insert(schema.oshiAttributes)
				.values({ id: generateId(), oshiId, key: "work", value: "作品B" })
				.run(),
		).toThrow();
	});
});

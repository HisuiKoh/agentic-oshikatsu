import { existsSync, mkdirSync, rmSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getCollectedInfo, markAsRead } from "@/core/info-collection/collector.js";
import * as schema from "@/infrastructure/db/schema.js";
import { generateId } from "@/shared/id.js";

const TEST_DB_DIR = "./data/test-collector";
const TEST_DB_PATH = `${TEST_DB_DIR}/test-collector.db`;

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
		migrationsFolder: new URL("../../../../src/infrastructure/db/migrations", import.meta.url)
			.pathname,
	});
});

beforeEach(() => {
	sqlite.exec("DELETE FROM collected_info");
	sqlite.exec("DELETE FROM oshi_attributes");
	sqlite.exec("DELETE FROM oshis");
});

afterAll(() => {
	sqlite.close();
	rmSync(TEST_DB_DIR, { recursive: true, force: true });
});

/** テスト用の推しを作成 */
function createTestOshi() {
	const oshiId = generateId();
	db.insert(schema.oshis)
		.values({
			id: oshiId,
			name: "テスト推し",
			category: "vtuber",
			registeredAt: new Date().toISOString(),
		})
		.run();
	return oshiId;
}

/** テスト用の収集情報を作成 */
function createTestInfo(
	oshiId: string,
	overrides?: Partial<typeof schema.collectedInfo.$inferInsert>,
) {
	const id = generateId();
	db.insert(schema.collectedInfo)
		.values({
			id,
			oshiId,
			sourcePlugin: "google-news",
			title: "テスト記事",
			url: `https://example.com/${id}`,
			summary: "テスト要約",
			category: "活動報告",
			importance: 7,
			sentiment: "positive",
			collectedAt: new Date().toISOString(),
			isRead: false,
			...overrides,
		})
		.run();
	return id;
}

describe("getCollectedInfo", () => {
	it("推しの収集済み情報を取得できる", () => {
		const oshiId = createTestOshi();
		createTestInfo(oshiId);
		createTestInfo(oshiId);

		const infos = getCollectedInfo(db as never, oshiId);
		expect(infos).toHaveLength(2);
	});

	it("limit で件数を制限できる", () => {
		const oshiId = createTestOshi();
		createTestInfo(oshiId);
		createTestInfo(oshiId);
		createTestInfo(oshiId);

		const infos = getCollectedInfo(db as never, oshiId, { limit: 2 });
		expect(infos).toHaveLength(2);
	});

	it("他の推しの情報は含まれない", () => {
		const oshiId1 = createTestOshi();
		const oshiId2 = createTestOshi();
		createTestInfo(oshiId1);
		createTestInfo(oshiId2);

		const infos = getCollectedInfo(db as never, oshiId1);
		expect(infos).toHaveLength(1);
		expect(infos[0].oshiId).toBe(oshiId1);
	});
});

describe("markAsRead", () => {
	it("情報を既読にできる", () => {
		const oshiId = createTestOshi();
		const infoId = createTestInfo(oshiId);

		markAsRead(db as never, infoId);

		const infos = getCollectedInfo(db as never, oshiId);
		expect(infos[0].isRead).toBe(true);
	});
});

import { existsSync, mkdirSync, rmSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { OshiRepository } from "@/core/oshi/repository.js";
import { SuggestionRepository } from "@/core/suggest/repository.js";
import * as schema from "@/infrastructure/db/schema.js";

const TEST_DB_DIR = "./data/test-suggestion-repo";
const TEST_DB_PATH = `${TEST_DB_DIR}/test.db`;

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
	sqlite.exec("DELETE FROM suggestions");
	sqlite.exec("DELETE FROM oshis");
});

afterAll(() => {
	sqlite.close();
	rmSync(TEST_DB_DIR, { recursive: true, force: true });
});

function createTestOshi(): string {
	const repo = new OshiRepository(db as never);
	const oshi = repo.create({
		name: "テスト推し",
		category: "character",
	});
	return oshi.id;
}

describe("SuggestionRepository", () => {
	it("提案を保存できる", () => {
		const oshiId = createTestOshi();
		const repo = new SuggestionRepository(db as never);

		const id = repo.save(
			oshiId,
			{ category: "goods", content: "グッズを買う", reason: "新発売" },
			{
				oshiName: "テスト推し",
				oshiCategory: "character",
			},
		);

		expect(id).toBeDefined();
		const saved = repo.findById(id);
		expect(saved).toBeDefined();
		expect(saved?.content).toBe("グッズを買う");
		expect(saved?.category).toBe("goods");
		expect(saved?.oshiId).toBe(oshiId);
	});

	it("推し ID で提案履歴を取得できる", () => {
		const oshiId = createTestOshi();
		const repo = new SuggestionRepository(db as never);

		repo.save(
			oshiId,
			{ category: "event", content: "イベント参加", reason: "理由1" },
			{ oshiName: "テスト推し", oshiCategory: "character" },
		);
		repo.save(
			oshiId,
			{ category: "sns", content: "SNS投稿", reason: "理由2" },
			{ oshiName: "テスト推し", oshiCategory: "character" },
		);

		const history = repo.findByOshiId(oshiId);
		expect(history).toHaveLength(2);
	});

	it("limit で件数を制限できる", () => {
		const oshiId = createTestOshi();
		const repo = new SuggestionRepository(db as never);

		for (let i = 0; i < 5; i++) {
			repo.save(
				oshiId,
				{ category: "other", content: `提案${i}`, reason: `理由${i}` },
				{ oshiName: "テスト推し", oshiCategory: "character" },
			);
		}

		const limited = repo.findByOshiId(oshiId, { limit: 3 });
		expect(limited).toHaveLength(3);
	});

	it("存在しない ID は undefined を返す", () => {
		const repo = new SuggestionRepository(db as never);
		expect(repo.findById("nonexistent")).toBeUndefined();
	});
});

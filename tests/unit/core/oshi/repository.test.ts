import { existsSync, mkdirSync, rmSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { OshiRepository } from "@/core/oshi/repository.js";
import * as schema from "@/infrastructure/db/schema.js";

const TEST_DB_DIR = "./data/test";
const TEST_DB_PATH = `${TEST_DB_DIR}/test-repository.db`;

let sqlite: InstanceType<typeof Database>;
let db: ReturnType<typeof drizzle>;
let repo: OshiRepository;

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
	// テストごとにデータをクリア
	sqlite.exec("DELETE FROM oshi_attributes");
	sqlite.exec("DELETE FROM oshis");
	// biome-ignore lint/suspicious/noExplicitAny: テスト用の型互換性のため
	repo = new OshiRepository(db as any);
});

afterAll(() => {
	sqlite.close();
	rmSync(TEST_DB_DIR, { recursive: true, force: true });
});

describe("OshiRepository", () => {
	it("推しを作成して取得できる", () => {
		const oshi = repo.create({
			name: "杵月のあ",
			category: "vtuber",
			description: "歌とトークが魅力の VTuber",
		});

		expect(oshi.name).toBe("杵月のあ");
		expect(oshi.category).toBe("vtuber");
		expect(oshi.id).toBeDefined();

		const found = repo.findById(oshi.id);
		expect(found).toBeDefined();
		expect(found?.name).toBe("杵月のあ");
	});

	it("属性付きで推しを作成できる", () => {
		const oshi = repo.create({
			name: "テスト推し",
			category: "person",
			attributes: [
				{ key: "birthday", value: "1月1日" },
				{ key: "group", value: "テストグループ" },
			],
		});

		const attrs = repo.getAttributes(oshi.id);
		expect(attrs).toHaveLength(2);
		expect(attrs.find((a) => a.key === "birthday")?.value).toBe("1月1日");
	});

	it("全推しを一覧取得できる", () => {
		repo.create({ name: "推し1", category: "vtuber" });
		repo.create({ name: "推し2", category: "idol" });
		repo.create({ name: "推し3", category: "character" });

		const all = repo.findAll();
		expect(all).toHaveLength(3);
	});

	it("名前で前方一致検索できる", () => {
		repo.create({ name: "杵月のあ", category: "vtuber" });
		repo.create({ name: "杵月テスト", category: "vtuber" });
		repo.create({ name: "別の推し", category: "person" });

		const results = repo.findByName("杵月");
		expect(results).toHaveLength(2);
	});

	it("推しを削除でき、属性も CASCADE 削除される", () => {
		const oshi = repo.create({
			name: "削除テスト",
			category: "other",
			attributes: [{ key: "test", value: "value" }],
		});

		const deleted = repo.delete(oshi.id);
		expect(deleted).toBe(true);

		const found = repo.findById(oshi.id);
		expect(found).toBeUndefined();

		const attrs = repo.getAttributes(oshi.id);
		expect(attrs).toHaveLength(0);
	});

	it("存在しない推しの削除は false を返す", () => {
		const deleted = repo.delete("non-existent-id");
		expect(deleted).toBe(false);
	});

	it("重複した属性キーでエラーになる", () => {
		expect(() =>
			repo.create({
				name: "重複テスト",
				category: "other",
				attributes: [
					{ key: "test", value: "value1" },
					{ key: "test", value: "value2" },
				],
			}),
		).toThrow("属性キーが重複しています");
	});

	it("LIKE ワイルドカードを含む名前でも正確に検索できる", () => {
		repo.create({ name: "100%推し", category: "other" });
		repo.create({ name: "100人の推し", category: "other" });

		const results = repo.findByName("100%");
		expect(results).toHaveLength(1);
		expect(results[0].name).toBe("100%推し");
	});
});

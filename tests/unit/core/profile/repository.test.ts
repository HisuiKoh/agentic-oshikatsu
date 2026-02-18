import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { ProfileRepository } from "@/core/profile/repository.js";
import * as schema from "@/infrastructure/db/schema.js";

let dbPath: string;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(() => {
	dbPath = `:memory:`;
	const sqlite = new Database(dbPath);
	sqlite.pragma("journal_mode = WAL");
	sqlite.pragma("foreign_keys = ON");
	db = drizzle(sqlite, { schema });

	// テーブル作成（メモリ DB なのでマイグレーション不可、直接 CREATE）
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS user_profile (
			id TEXT PRIMARY KEY,
			formality TEXT NOT NULL DEFAULT 'neutral',
			feedback_style TEXT NOT NULL DEFAULT 'balanced',
			detail_level TEXT NOT NULL DEFAULT 'normal',
			decoration TEXT NOT NULL DEFAULT 'moderate',
			oshi_intensity TEXT NOT NULL DEFAULT 'moderate',
			locale TEXT NOT NULL DEFAULT 'ja',
			updated_at TEXT NOT NULL
		)
	`);
});

describe("ProfileRepository", () => {
	it("初期状態では get() が undefined を返す", () => {
		const repo = new ProfileRepository(db);
		expect(repo.get()).toBeUndefined();
	});

	it("upsert で新規作成できる", () => {
		const repo = new ProfileRepository(db);
		const result = repo.upsert({
			formality: "casual",
			feedbackStyle: "gentle",
			detailLevel: "brief",
			decoration: "minimal",
			oshiIntensity: "intense",
			locale: "ja",
		});

		expect(result.formality).toBe("casual");
		expect(result.feedbackStyle).toBe("gentle");
		expect(result.detailLevel).toBe("brief");
		expect(result.decoration).toBe("minimal");
		expect(result.oshiIntensity).toBe("intense");
		expect(result.id).toBeDefined();
	});

	it("upsert 後に get で取得できる", () => {
		const repo = new ProfileRepository(db);
		repo.upsert({
			formality: "formal",
			feedbackStyle: "strict",
			detailLevel: "detailed",
			decoration: "rich",
			oshiIntensity: "casual",
			locale: "en",
		});

		const profile = repo.get();
		expect(profile).toBeDefined();
		expect(profile?.formality).toBe("formal");
		expect(profile?.locale).toBe("en");
	});

	it("upsert で既存プロファイルを更新できる", () => {
		const repo = new ProfileRepository(db);

		// 初回作成
		const created = repo.upsert({
			formality: "casual",
			feedbackStyle: "gentle",
			detailLevel: "brief",
			decoration: "minimal",
			oshiIntensity: "intense",
			locale: "ja",
		});

		// 更新
		const updated = repo.upsert({
			formality: "formal",
			feedbackStyle: "strict",
			detailLevel: "detailed",
			decoration: "rich",
			oshiIntensity: "casual",
			locale: "en",
		});

		expect(updated.id).toBe(created.id); // 同じ ID
		expect(updated.formality).toBe("formal");

		// DB に 1 件のみ
		const rows = db.select().from(schema.userProfile).all();
		expect(rows).toHaveLength(1);
	});
});

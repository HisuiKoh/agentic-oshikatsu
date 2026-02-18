import { existsSync, mkdirSync, rmSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { aggregateDashboard, aggregateOverview } from "@/core/dashboard/aggregator.js";
import { OshiRepository } from "@/core/oshi/repository.js";
import * as schema from "@/infrastructure/db/schema.js";
import { generateId } from "@/shared/id.js";

const TEST_DB_DIR = "./data/test-dashboard";
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
	sqlite.exec("DELETE FROM lint_results");
	sqlite.exec("DELETE FROM suggestions");
	sqlite.exec("DELETE FROM collected_info");
	sqlite.exec("DELETE FROM oshi_attributes");
	sqlite.exec("DELETE FROM ai_usage");
	sqlite.exec("DELETE FROM oshis");
});

afterAll(() => {
	sqlite.close();
	rmSync(TEST_DB_DIR, { recursive: true, force: true });
});

function createTestOshi(name = "テスト推し") {
	const repo = new OshiRepository(db as never);
	return repo.create({ name, category: "character", attributes: [{ key: "色", value: "赤" }] });
}

describe("aggregateDashboard", () => {
	it("推し情報サマリーを返す", () => {
		const oshi = createTestOshi();

		const data = aggregateDashboard(db as never, oshi, []);

		expect(data.oshi.name).toBe("テスト推し");
		expect(data.oshi.category).toBe("character");
		expect(data.oshi.attributeCount).toBe(1);
		expect(data.oshi.infoCount).toBe(0);
	});

	it("収集情報を取得する", () => {
		const oshi = createTestOshi();
		db.insert(schema.collectedInfo)
			.values({
				id: generateId(),
				oshiId: oshi.id,
				sourcePlugin: "test",
				title: "テスト情報",
				summary: "サマリー",
				collectedAt: new Date().toISOString(),
			})
			.run();

		const data = aggregateDashboard(db as never, oshi, []);

		expect(data.recentInfo).toHaveLength(1);
		expect(data.recentInfo[0].title).toBe("テスト情報");
		expect(data.oshi.infoCount).toBe(1);
	});

	it("Linter 結果を取得する（suggestion 経由）", () => {
		const oshi = createTestOshi();
		const suggestionId = generateId();
		db.insert(schema.suggestions)
			.values({
				id: suggestionId,
				oshiId: oshi.id,
				category: "goods",
				content: "テスト提案",
				createdAt: new Date().toISOString(),
			})
			.run();
		db.insert(schema.lintResults)
			.values({
				id: generateId(),
				suggestionId,
				action: "テスト行動",
				verdict: "PASS",
				evaluations: [],
				timestamp: new Date().toISOString(),
			})
			.run();

		const data = aggregateDashboard(db as never, oshi, []);

		expect(data.recentLintResults).toHaveLength(1);
		expect(data.recentLintResults[0].verdict).toBe("PASS");
	});

	it("suggestionId なしの Linter 結果は推し固有ダッシュボードに含まれない", () => {
		const oshi = createTestOshi();
		db.insert(schema.lintResults)
			.values({
				id: generateId(),
				action: "直接 lint した行動",
				verdict: "WARN",
				evaluations: [],
				timestamp: new Date().toISOString(),
			})
			.run();

		const data = aggregateDashboard(db as never, oshi, []);

		expect(data.recentLintResults).toHaveLength(0);
	});

	it("提案を取得する", () => {
		const oshi = createTestOshi();
		db.insert(schema.suggestions)
			.values({
				id: generateId(),
				oshiId: oshi.id,
				category: "goods",
				content: "グッズを購入",
				createdAt: new Date().toISOString(),
			})
			.run();

		const data = aggregateDashboard(db as never, oshi, []);

		expect(data.recentSuggestions).toHaveLength(1);
		expect(data.recentSuggestions[0].content).toBe("グッズを購入");
	});

	it("AI 使用量を取得する", () => {
		const oshi = createTestOshi();
		db.insert(schema.aiUsage)
			.values({
				id: generateId(),
				provider: "claude",
				model: "claude-haiku-4-5-20251001",
				inputTokens: 100,
				outputTokens: 50,
				cost: 0.001,
				purpose: "linting",
				timestamp: new Date().toISOString(),
			})
			.run();

		const data = aggregateDashboard(db as never, oshi, []);

		expect(data.aiUsage).toHaveLength(1);
		expect(data.aiUsage[0].provider).toBe("claude");
		expect(data.aiUsage[0].callCount).toBe(1);
	});

	it("予算サマリーをそのまま返す", () => {
		const oshi = createTestOshi();
		const budgetSummaries = [
			{
				type: "oshi_activity" as const,
				period: "monthly" as const,
				limit: 50000,
				spent: 20000,
				remaining: 30000,
				usageRate: 0.4,
				currency: "JPY",
			},
		];

		const data = aggregateDashboard(db as never, oshi, budgetSummaries);

		expect(data.budgetSummaries).toHaveLength(1);
		expect(data.budgetSummaries[0].remaining).toBe(30000);
	});
});

describe("aggregateOverview", () => {
	it("全推しの概要を返す", () => {
		const oshi1 = createTestOshi("推しA");
		const oshi2 = createTestOshi("推しB");

		const overview = aggregateOverview(db as never, [oshi1, oshi2], []);

		expect(overview.oshis).toHaveLength(2);
		expect(overview.oshis[0].name).toBe("推しA");
		expect(overview.oshis[1].name).toBe("推しB");
	});

	it("推しが0件の場合は空配列を返す", () => {
		const overview = aggregateOverview(db as never, [], []);

		expect(overview.oshis).toHaveLength(0);
		expect(overview.aiUsage).toHaveLength(0);
	});
});

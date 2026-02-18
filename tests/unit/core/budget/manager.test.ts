import { existsSync, mkdirSync, rmSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BudgetManager } from "@/core/budget/manager.js";
import * as schema from "@/infrastructure/db/schema.js";

const TEST_DB_DIR = "./data/test-budget";
const TEST_DB_PATH = `${TEST_DB_DIR}/test-budget.db`;

let sqlite: InstanceType<typeof Database>;
let db: ReturnType<typeof drizzle>;
let manager: BudgetManager;

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
	sqlite.exec("DELETE FROM budget_entries");
	sqlite.exec("DELETE FROM budget_limits");
	sqlite.exec("DELETE FROM ai_usage");
	manager = new BudgetManager(db as never);
});

afterAll(() => {
	sqlite.close();
	rmSync(TEST_DB_DIR, { recursive: true, force: true });
});

describe("BudgetManager", () => {
	describe("setLimit", () => {
		it("予算上限を設定できる", () => {
			manager.setLimit({
				type: "oshi_activity",
				period: "monthly",
				limit: 30000,
				currency: "JPY",
			});

			const limits = manager.getLimits();
			expect(limits).toHaveLength(1);
			expect(limits[0].type).toBe("oshi_activity");
			expect(limits[0].limit).toBe(30000);
		});

		it("同じ type + period の予算を上書きできる", () => {
			manager.setLimit({
				type: "oshi_activity",
				period: "monthly",
				limit: 30000,
				currency: "JPY",
			});

			manager.setLimit({
				type: "oshi_activity",
				period: "monthly",
				limit: 50000,
				currency: "JPY",
			});

			const limits = manager.getLimits();
			expect(limits).toHaveLength(1);
			expect(limits[0].limit).toBe(50000);
		});
	});

	describe("addEntry", () => {
		it("支出を記録できる", () => {
			manager.addEntry({
				type: "oshi_activity",
				amount: 3500,
				currency: "JPY",
				description: "アクリルスタンド",
				date: new Date().toISOString().split("T")[0],
			});

			const spent = manager.getSpent("oshi_activity", "monthly");
			expect(spent).toBe(3500);
		});

		it("複数の支出を合計できる", () => {
			const today = new Date().toISOString().split("T")[0];
			manager.addEntry({ type: "oshi_activity", amount: 1000, currency: "JPY", date: today });
			manager.addEntry({ type: "oshi_activity", amount: 2000, currency: "JPY", date: today });
			manager.addEntry({ type: "oshi_activity", amount: 3000, currency: "JPY", date: today });

			const spent = manager.getSpent("oshi_activity", "monthly");
			expect(spent).toBe(6000);
		});
	});

	describe("getSummary", () => {
		it("予算サマリーを取得できる", () => {
			manager.setLimit({
				type: "oshi_activity",
				period: "monthly",
				limit: 30000,
				currency: "JPY",
			});

			const today = new Date().toISOString().split("T")[0];
			manager.addEntry({ type: "oshi_activity", amount: 10000, currency: "JPY", date: today });

			const summaries = manager.getSummary();
			expect(summaries).toHaveLength(1);
			expect(summaries[0].limit).toBe(30000);
			expect(summaries[0].spent).toBe(10000);
			expect(summaries[0].remaining).toBe(20000);
			expect(summaries[0].usageRate).toBeCloseTo(1 / 3);
		});

		it("予算がない場合は空配列を返す", () => {
			const summaries = manager.getSummary();
			expect(summaries).toHaveLength(0);
		});
	});

	describe("syncAiCosts", () => {
		it("AI コストがない場合は 0 を返す", () => {
			const cost = manager.syncAiCosts();
			expect(cost).toBe(0);
		});
	});
});

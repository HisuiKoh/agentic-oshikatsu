import { existsSync, mkdirSync, rmSync } from "node:fs";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LinterEngine } from "@/core/linter/engine.js";
import { BudgetRule } from "@/core/linter/rules/budget-rule.js";
import { KeywordRule } from "@/core/linter/rules/keyword-rule.js";
import { TimeRule } from "@/core/linter/rules/time-rule.js";
import type { AIProvider } from "@/infrastructure/ai/types.js";
import * as schema from "@/infrastructure/db/schema.js";

// evaluateWithAI テストで recordUsage が DB にアクセスするためモック
vi.mock("@/infrastructure/ai/usage-tracker.js", () => ({
	recordUsage: vi.fn(),
}));

const TEST_DB_DIR = "./data/test-linter-engine";
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
});

afterAll(() => {
	sqlite.close();
	rmSync(TEST_DB_DIR, { recursive: true, force: true });
});

describe("LinterEngine", () => {
	it("Layer 1 で問題なし + 日中 → evaluations 空で PASS", () => {
		const engine = new LinterEngine(db as never);
		engine.addRule(new BudgetRule());
		engine.addRule(new TimeRule());
		engine.addRule(new KeywordRule());

		const result = engine.evaluate("推しのイベントに参加する", {
			budgetRemaining: 50000,
			now: new Date("2026-02-16T14:00:00"),
		});

		// Layer 1 単体では問題なし（Layer 2 の LLM 評価が別途必要）
		expect(result.verdict).toBe("PASS");
		expect(result.evaluations).toHaveLength(0);
	});

	it("深夜の購入行動は TimeRule で WARN", () => {
		const engine = new LinterEngine(db as never);
		engine.addRule(new BudgetRule());
		engine.addRule(new TimeRule());
		engine.addRule(new KeywordRule());

		const result = engine.evaluate("グッズを購入する", {
			budgetRemaining: 50000,
			now: new Date("2026-02-19T03:00:00"),
		});

		expect(result.verdict).toBe("WARN");
		expect(result.evaluations).toHaveLength(1);
		expect(result.evaluations[0].ruleId).toBe("time-rule");
		expect(result.evaluations[0].category).toBe("late_night");
	});

	it("BLOCK があれば最終判定は BLOCK", () => {
		const engine = new LinterEngine(db as never);
		engine.addRule(new BudgetRule());
		engine.addRule(new KeywordRule({ blockKeywords: ["転売"] }));

		const result = engine.evaluate("転売で15,000円のグッズを売る", {
			budgetRemaining: 50000,
		});

		expect(result.verdict).toBe("BLOCK");
	});

	it("WARN のみなら最終判定は WARN", () => {
		const engine = new LinterEngine(db as never);
		engine.addRule(new TimeRule());

		const result = engine.evaluate("グッズを購入する", {
			now: new Date("2026-02-16T03:00:00"),
		});

		expect(result.verdict).toBe("WARN");
		expect(result.evaluations).toHaveLength(1);
		expect(result.evaluations[0].ruleId).toBe("time-rule");
	});

	it("複数のルールが同時にヒットする", () => {
		const engine = new LinterEngine(db as never);
		engine.addRule(new BudgetRule());
		engine.addRule(new TimeRule());
		engine.addRule(new KeywordRule({ warnKeywords: ["限定"] }));

		const result = engine.evaluate("限定グッズを15,000円で購入する", {
			budgetRemaining: 10000,
			now: new Date("2026-02-16T03:00:00"),
		});

		// BudgetRule: BLOCK (予算超過), TimeRule: WARN, KeywordRule: WARN
		expect(result.verdict).toBe("BLOCK");
		expect(result.evaluations.length).toBeGreaterThanOrEqual(2);
	});

	it("結果を DB に保存できる", () => {
		const engine = new LinterEngine(db as never);
		engine.addRule(new BudgetRule());

		const result = engine.evaluate("50,000円のグッズ購入", { budgetRemaining: 10000 });
		const id = engine.saveResult(result);

		const saved = db.select().from(schema.lintResults).where(eq(schema.lintResults.id, id)).get();

		expect(saved).toBeDefined();
		expect(saved?.verdict).toBe("BLOCK");
		expect(saved?.action).toBe("50,000円のグッズ購入");
	});
});

describe("LinterEngine.evaluateWithAI", () => {
	it("Layer 1 で BLOCK なら Layer 2 スキップ", async () => {
		const engine = new LinterEngine(db as never);
		engine.addRule(new BudgetRule());

		const mockProvider: AIProvider = {
			id: "claude",
			query: vi.fn(),
			queryStructured: vi.fn(),
			estimateCost: vi.fn(),
		};

		const result = await engine.evaluateWithAI(
			"50,000円のグッズ購入",
			{ budgetRemaining: 10000 },
			mockProvider,
		);

		expect(result.verdict).toBe("BLOCK");
		expect(result.layer2Skipped).toBe(true);
		expect(mockProvider.queryStructured).not.toHaveBeenCalled();
	});

	it("Layer 1 で PASS でも Layer 2 は必ず実行される", async () => {
		const engine = new LinterEngine(db as never);
		engine.addRule(new BudgetRule());

		const mockProvider: AIProvider = {
			id: "claude",
			query: vi.fn(),
			queryStructured: vi.fn().mockResolvedValue({
				data: {
					evaluations: [{ category: "social_risk", severity: 2, reason: "問題なし" }],
				},
				usage: { inputTokens: 100, outputTokens: 50 },
				model: "claude-haiku-4-5-20251001",
				provider: "claude",
			}),
			estimateCost: vi.fn().mockReturnValue(0.001),
		};

		const result = await engine.evaluateWithAI(
			"推しのイベントに参加する",
			{ budgetRemaining: 50000 },
			mockProvider,
		);

		// Layer 2 が実行されている
		expect(result.layer2Skipped).toBe(false);
		expect(mockProvider.queryStructured).toHaveBeenCalled();
		expect(result.evaluations.length).toBeGreaterThanOrEqual(1);
	});

	it("Layer 1 で WARN なら Layer 2 も実行", async () => {
		const engine = new LinterEngine(db as never);
		engine.addRule(new TimeRule());

		const mockProvider: AIProvider = {
			id: "claude",
			query: vi.fn(),
			queryStructured: vi.fn().mockResolvedValue({
				data: {
					evaluations: [{ category: "social_risk", severity: 8, reason: "炎上リスク" }],
				},
				usage: { inputTokens: 100, outputTokens: 50 },
				model: "claude-haiku-4-5-20251001",
				provider: "claude",
			}),
			estimateCost: vi.fn().mockReturnValue(0.001),
		};

		const result = await engine.evaluateWithAI(
			"グッズを購入する",
			{ now: new Date("2026-02-16T03:00:00") },
			mockProvider,
		);

		expect(result.verdict).toBe("BLOCK"); // LLM severity 8 → BLOCK
		expect(result.layer2Skipped).toBe(false);
		expect(result.evaluations.length).toBeGreaterThanOrEqual(2); // time-rule + llm
	});
});

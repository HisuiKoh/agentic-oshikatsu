import { describe, expect, it } from "vitest";
import { CreateBudgetEntrySchema, CreateBudgetLimitSchema } from "@/core/budget/types.js";

describe("CreateBudgetEntrySchema", () => {
	it("有効な支出記録をバリデーションできる", () => {
		const result = CreateBudgetEntrySchema.safeParse({
			type: "oshi_activity",
			amount: 3500,
			currency: "JPY",
			description: "グッズ購入",
			date: "2026-02-15",
		});
		expect(result.success).toBe(true);
	});

	it("金額が 0 以下の場合はエラー", () => {
		const result = CreateBudgetEntrySchema.safeParse({
			type: "oshi_activity",
			amount: 0,
			date: "2026-02-15",
		});
		expect(result.success).toBe(false);
	});

	it("不正な type はエラー", () => {
		const result = CreateBudgetEntrySchema.safeParse({
			type: "invalid",
			amount: 1000,
			date: "2026-02-15",
		});
		expect(result.success).toBe(false);
	});
});

describe("CreateBudgetLimitSchema", () => {
	it("有効な予算上限をバリデーションできる", () => {
		const result = CreateBudgetLimitSchema.safeParse({
			type: "oshi_activity",
			period: "monthly",
			limit: 30000,
			currency: "JPY",
		});
		expect(result.success).toBe(true);
	});

	it("limit が 0 以下の場合はエラー", () => {
		const result = CreateBudgetLimitSchema.safeParse({
			type: "ai_api",
			period: "monthly",
			limit: -1,
		});
		expect(result.success).toBe(false);
	});
});

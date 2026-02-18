import { z } from "zod";

/** 支出タイプ */
export const BUDGET_TYPES = ["oshi_activity", "ai_api", "external_api"] as const;
export type BudgetType = (typeof BUDGET_TYPES)[number];

/** 予算期間 */
export const BUDGET_PERIODS = ["monthly", "weekly", "daily"] as const;
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number];

/** 支出タイプの表示名 */
export const BUDGET_TYPE_LABELS: Record<BudgetType, string> = {
	oshi_activity: "推し活",
	ai_api: "AI API",
	external_api: "外部 API",
};

/** 予算期間の表示名 */
export const BUDGET_PERIOD_LABELS: Record<BudgetPeriod, string> = {
	monthly: "月間",
	weekly: "週間",
	daily: "日間",
};

/** 支出記録の入力 */
export const CreateBudgetEntrySchema = z.object({
	oshiId: z.string().nullable().optional(),
	type: z.enum(BUDGET_TYPES),
	category: z.string().nullable().optional(),
	amount: z.number().int().positive("金額は正の整数で入力してください"),
	currency: z.string().default("JPY"),
	description: z.string().nullable().optional(),
	date: z.string(),
});

export type CreateBudgetEntry = z.infer<typeof CreateBudgetEntrySchema>;

/** 予算上限の入力 */
export const CreateBudgetLimitSchema = z.object({
	oshiId: z.string().nullable().optional(),
	type: z.enum(BUDGET_TYPES),
	period: z.enum(BUDGET_PERIODS),
	limit: z.number().int().positive("予算上限は正の整数で入力してください"),
	currency: z.string().default("JPY"),
});

export type CreateBudgetLimit = z.infer<typeof CreateBudgetLimitSchema>;

/** 予算サマリー */
export interface BudgetSummary {
	type: BudgetType;
	period: BudgetPeriod;
	limit: number;
	spent: number;
	remaining: number;
	usageRate: number;
	currency: string;
}

import { and, eq, gte, isNull, sum } from "drizzle-orm";
import type { AppDatabase } from "../../infrastructure/db/connection.js";
import { aiUsage, budgetEntries, budgetLimits } from "../../infrastructure/db/schema.js";
import { generateId } from "../../shared/id.js";
import type {
	BudgetPeriod,
	BudgetSummary,
	BudgetType,
	CreateBudgetEntry,
	CreateBudgetLimit,
} from "./types.js";

/** 期間の開始日を取得 */
function getPeriodStartDate(period: BudgetPeriod, now: Date = new Date()): string {
	const year = now.getFullYear();
	const month = now.getMonth();
	const date = now.getDate();
	const day = now.getDay();

	switch (period) {
		case "daily":
			return new Date(year, month, date).toISOString().split("T")[0];
		case "weekly": {
			// 月曜始まり
			const mondayOffset = day === 0 ? 6 : day - 1;
			const monday = new Date(year, month, date - mondayOffset);
			return monday.toISOString().split("T")[0];
		}
		case "monthly":
			return new Date(year, month, 1).toISOString().split("T")[0];
	}
}

export class BudgetManager {
	constructor(private db: AppDatabase) {}

	/** 支出を記録 */
	addEntry(entry: CreateBudgetEntry): void {
		this.db
			.insert(budgetEntries)
			.values({
				id: generateId(),
				oshiId: entry.oshiId ?? null,
				type: entry.type,
				category: entry.category ?? null,
				amount: entry.amount,
				currency: entry.currency,
				description: entry.description ?? null,
				date: entry.date,
			})
			.run();
	}

	/** 予算上限を設定（既存があれば上書き） */
	setLimit(input: CreateBudgetLimit): void {
		// 同じ type + period + oshiId の既存を削除
		const conditions = [eq(budgetLimits.type, input.type), eq(budgetLimits.period, input.period)];
		if (input.oshiId) {
			conditions.push(eq(budgetLimits.oshiId, input.oshiId));
		} else {
			conditions.push(isNull(budgetLimits.oshiId));
		}

		this.db
			.delete(budgetLimits)
			.where(and(...conditions))
			.run();

		this.db
			.insert(budgetLimits)
			.values({
				id: generateId(),
				oshiId: input.oshiId ?? null,
				type: input.type,
				period: input.period,
				limit: input.limit,
				currency: input.currency,
				createdAt: new Date().toISOString(),
			})
			.run();
	}

	/** 特定の type + period の支出合計を取得 */
	getSpent(type: BudgetType, period: BudgetPeriod, oshiId?: string): number {
		const startDate = getPeriodStartDate(period);

		const conditions = [eq(budgetEntries.type, type), gte(budgetEntries.date, startDate)];
		if (oshiId) {
			conditions.push(eq(budgetEntries.oshiId, oshiId));
		}

		const result = this.db
			.select({ total: sum(budgetEntries.amount) })
			.from(budgetEntries)
			.where(and(...conditions))
			.get();

		return Number(result?.total) || 0;
	}

	/** 予算上限を取得 */
	getLimits(oshiId?: string): Array<{
		type: BudgetType;
		period: BudgetPeriod;
		limit: number;
		currency: string;
	}> {
		const conditions = oshiId ? [eq(budgetLimits.oshiId, oshiId)] : [];

		const query =
			conditions.length > 0
				? this.db
						.select()
						.from(budgetLimits)
						.where(and(...conditions))
				: this.db.select().from(budgetLimits);

		return query.all().map((row) => ({
			type: row.type as BudgetType,
			period: row.period as BudgetPeriod,
			limit: row.limit,
			currency: row.currency,
		}));
	}

	/** 予算サマリーを取得 */
	getSummary(oshiId?: string): BudgetSummary[] {
		const limits = this.getLimits(oshiId);

		return limits.map((lim) => {
			const spent = this.getSpent(lim.type, lim.period, oshiId);
			const remaining = Math.max(lim.limit - spent, 0);
			const usageRate = lim.limit > 0 ? spent / lim.limit : 0;

			return {
				type: lim.type,
				period: lim.period,
				limit: lim.limit,
				spent,
				remaining,
				usageRate,
				currency: lim.currency,
			};
		});
	}

	/** AI API コストを予算に自動反映 */
	syncAiCosts(): number {
		const startDate = getPeriodStartDate("monthly");
		const SYNC_DESCRIPTION = "AI API コスト自動同期";

		// 自動同期分のみの支出合計を取得（手動登録分は除外）
		const syncedResult = this.db
			.select({ total: sum(budgetEntries.amount) })
			.from(budgetEntries)
			.where(
				and(
					eq(budgetEntries.type, "ai_api"),
					gte(budgetEntries.date, startDate),
					eq(budgetEntries.description, SYNC_DESCRIPTION),
				),
			)
			.get();
		const currentSynced = Number(syncedResult?.total) || 0;

		// ai_usage から今月のコスト合計を取得（円換算: $1 = 150円概算）
		const USD_TO_JPY = 150;
		const result = this.db
			.select({ total: sum(aiUsage.cost) })
			.from(aiUsage)
			.where(gte(aiUsage.timestamp, startDate))
			.get();

		const aiCostUsd = Number(result?.total) || 0;
		const aiCostJpy = Math.ceil(aiCostUsd * USD_TO_JPY);

		// 差分がある場合のみ記録
		const diff = aiCostJpy - currentSynced;
		if (diff > 0) {
			this.addEntry({
				type: "ai_api",
				amount: diff,
				currency: "JPY",
				description: SYNC_DESCRIPTION,
				date: new Date().toISOString().split("T")[0],
			});
		}

		return aiCostJpy;
	}
}

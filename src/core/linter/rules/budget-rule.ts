import type { LintContext, LintEvaluation } from "../types.js";
import type { Rule } from "./base.js";

/** 金額パターン: "15,000円", "¥3500", "1万円", "1.5万円" 等 */
const AMOUNT_PATTERNS = [
	// 15,000円 / 15000円
	/([0-9,]+)\s*円/,
	// ¥15,000 / ¥15000
	/¥\s*([0-9,]+)/,
	// 1万円 / 1.5万円 / 15万円
	/([0-9.]+)\s*万\s*円?/,
];

/** 行動テキストから金額（円）を抽出。見つからなければ null */
export function extractAmount(action: string): number | null {
	for (const pattern of AMOUNT_PATTERNS) {
		const match = action.match(pattern);
		if (!match?.[1]) continue;

		if (pattern.source.includes("万")) {
			const num = Number.parseFloat(match[1]);
			if (!Number.isNaN(num)) return Math.round(num * 10000);
		} else {
			const num = Number.parseInt(match[1].replace(/,/g, ""), 10);
			if (!Number.isNaN(num)) return num;
		}
	}
	return null;
}

/** 予算超過チェックルール */
export class BudgetRule implements Rule {
	id = "budget-rule";
	category = "budget_exceeded" as const;
	enabled: boolean;
	/** WARN 閾値: 支出後の残額が予算総額のこの%以下なら WARN（デフォルト 20%） */
	private warnThreshold: number;

	constructor(config?: { enabled?: boolean; warnThreshold?: number }) {
		this.enabled = config?.enabled ?? true;
		this.warnThreshold = config?.warnThreshold ?? 20;
	}

	evaluate(action: string, context: LintContext): LintEvaluation | null {
		if (!this.enabled) return null;

		const amount = extractAmount(action);
		if (amount === null) return null;

		const { budgetRemaining, budgetTotal } = context;
		if (budgetRemaining === undefined) return null;

		// 予算超過 → BLOCK
		if (amount > budgetRemaining) {
			return {
				ruleId: this.id,
				category: this.category,
				verdict: "BLOCK",
				message: `予算超過: ${amount.toLocaleString()}円の支出に対し、残額は${budgetRemaining.toLocaleString()}円です`,
			};
		}

		// 支出後の残額が予算総額の閾値%以下 → WARN
		if (budgetTotal !== undefined && budgetTotal > 0) {
			const remainingAfter = budgetRemaining - amount;
			const remainingRatio = (remainingAfter / budgetTotal) * 100;

			if (remainingRatio < this.warnThreshold) {
				return {
					ruleId: this.id,
					category: this.category,
					verdict: "WARN",
					message: `予算注意: ${amount.toLocaleString()}円の支出で残額が${remainingAfter.toLocaleString()}円（予算の${Math.round(remainingRatio)}%）になります`,
				};
			}
		}

		return null;
	}
}

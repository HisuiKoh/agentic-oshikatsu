import type { LintContext, LintEvaluation } from "../types.js";
import type { Rule } from "./base.js";

/** 購入・注文を示唆するキーワード */
const PURCHASE_KEYWORDS = [
	"購入",
	"買う",
	"買い",
	"注文",
	"ポチ",
	"課金",
	"購読",
	"申込",
	"申し込",
];

/** 深夜時間帯の購入警告ルール */
export class TimeRule implements Rule {
	id = "time-rule";
	category = "late_night" as const;
	enabled: boolean;
	private startHour: number;
	private endHour: number;

	constructor(config?: { enabled?: boolean; startHour?: number; endHour?: number }) {
		this.enabled = config?.enabled ?? true;
		this.startHour = config?.startHour ?? 2;
		this.endHour = config?.endHour ?? 6;
	}

	evaluate(action: string, context: LintContext): LintEvaluation | null {
		if (!this.enabled) return null;

		const now = context.now ?? new Date();
		const hour = now.getHours();

		// 深夜時間帯かチェック
		const isLateNight =
			this.startHour < this.endHour
				? hour >= this.startHour && hour < this.endHour
				: hour >= this.startHour || hour < this.endHour;

		if (!isLateNight) return null;

		// 購入系の行動かチェック
		const isPurchase = PURCHASE_KEYWORDS.some((kw) => action.includes(kw));
		if (!isPurchase) return null;

		return {
			ruleId: this.id,
			category: this.category,
			verdict: "WARN",
			message: `深夜（${this.startHour}時〜${this.endHour}時）の購入行動です。翌朝改めて検討することをおすすめします`,
		};
	}
}

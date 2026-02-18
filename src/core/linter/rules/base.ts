import type { LintContext, LintEvaluation, RiskCategory } from "../types.js";

/** Linter ルールのインターフェース */
export interface Rule {
	id: string;
	category: RiskCategory;
	enabled: boolean;
	/** 行動テキストを評価し、問題があれば LintEvaluation を返す。問題なければ null */
	evaluate(action: string, context: LintContext): LintEvaluation | null;
}

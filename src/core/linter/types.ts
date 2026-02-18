import { z } from "zod";

/** リスクカテゴリ */
export const RISK_CATEGORIES = [
	"budget_exceeded",
	"late_night",
	"inappropriate_keyword",
	"social_risk",
	"legal_risk",
	"oshi_impact",
	"fan_conflict",
] as const;
export type RiskCategory = (typeof RISK_CATEGORIES)[number];

/** 判定結果 */
export const VERDICTS = ["PASS", "WARN", "BLOCK"] as const;
export type Verdict = (typeof VERDICTS)[number];

/** 個別ルールの評価結果 */
export interface LintEvaluation {
	ruleId: string;
	category: RiskCategory;
	verdict: Verdict;
	message: string;
	/** 信頼度 0-100（Layer 2 AI 評価時に使用） */
	confidence?: number;
}

/** Linter の最終結果 */
export interface LintResult {
	action: string;
	verdict: Verdict;
	evaluations: LintEvaluation[];
	timestamp: string;
}

/** ルール評価時のコンテキスト */
export interface LintContext {
	/** 対象の推し ID（任意） */
	oshiId?: string;
	/** 予算残額（budget-rule 用） */
	budgetRemaining?: number;
	/** 予算総額（budget-rule 用） */
	budgetTotal?: number;
	/** 現在時刻（テスト用に注入可能） */
	now?: Date;
}

/** 各ルールのデフォルト設定 */
const BUDGET_RULE_DEFAULTS = { enabled: true, warnThreshold: 20 } as const;
const TIME_RULE_DEFAULTS = { enabled: true, startHour: 2, endHour: 6 } as const;
const KEYWORD_RULE_DEFAULTS = {
	enabled: true,
	blockKeywords: [] as string[],
	warnKeywords: [] as string[],
};
const RULES_DEFAULTS = {
	"budget-rule": { ...BUDGET_RULE_DEFAULTS },
	"time-rule": { ...TIME_RULE_DEFAULTS },
	"keyword-rule": { ...KEYWORD_RULE_DEFAULTS },
};

/** .oshilintrc.yaml の設定スキーマ */
export const LintConfigSchema = z.object({
	rules: z
		.object({
			"budget-rule": z
				.object({
					enabled: z.boolean().default(true),
					/** WARN の閾値（支出後の残額が予算総額のこの%以下になったら警告） */
					warnThreshold: z.number().min(0).max(100).default(20),
				})
				.default(BUDGET_RULE_DEFAULTS),
			"time-rule": z
				.object({
					enabled: z.boolean().default(true),
					/** 警告する時間帯（開始時、この時刻を含む） */
					startHour: z.number().int().min(0).max(23).default(2),
					/** 警告する時間帯（終了時、この時刻は含まない） */
					endHour: z.number().int().min(0).max(23).default(6),
				})
				.default(TIME_RULE_DEFAULTS),
			"keyword-rule": z
				.object({
					enabled: z.boolean().default(true),
					/** BLOCK するキーワード */
					blockKeywords: z.array(z.string()).default([]),
					/** WARN するキーワード */
					warnKeywords: z.array(z.string()).default([]),
				})
				.default(KEYWORD_RULE_DEFAULTS),
		})
		.default(RULES_DEFAULTS),
});

export type LintConfig = z.infer<typeof LintConfigSchema>;

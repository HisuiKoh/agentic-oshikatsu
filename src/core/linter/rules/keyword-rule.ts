import type { LintEvaluation } from "../types.js";
import type { Rule } from "./base.js";

/** ブラックリスト / 注意キーワードによるフィルタリングルール */
export class KeywordRule implements Rule {
	id = "keyword-rule";
	category = "inappropriate_keyword" as const;
	enabled: boolean;
	private blockKeywords: string[];
	private warnKeywords: string[];

	constructor(config?: { enabled?: boolean; blockKeywords?: string[]; warnKeywords?: string[] }) {
		this.enabled = config?.enabled ?? true;
		this.blockKeywords = config?.blockKeywords ?? [];
		this.warnKeywords = config?.warnKeywords ?? [];
	}

	evaluate(action: string): LintEvaluation | null {
		if (!this.enabled) return null;

		const lowerAction = action.toLowerCase();

		// BLOCK キーワードチェック
		const blockedWord = this.blockKeywords.find((kw) => lowerAction.includes(kw.toLowerCase()));
		if (blockedWord) {
			return {
				ruleId: this.id,
				category: this.category,
				verdict: "BLOCK",
				message: `禁止キーワード「${blockedWord}」が含まれています`,
			};
		}

		// WARN キーワードチェック
		const warnedWord = this.warnKeywords.find((kw) => lowerAction.includes(kw.toLowerCase()));
		if (warnedWord) {
			return {
				ruleId: this.id,
				category: this.category,
				verdict: "WARN",
				message: `注意キーワード「${warnedWord}」が含まれています。内容を再確認してください`,
			};
		}

		return null;
	}
}

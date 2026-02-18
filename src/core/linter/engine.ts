import type { AIProvider } from "../../infrastructure/ai/types.js";
import type { AppDatabase } from "../../infrastructure/db/connection.js";
import { lintResults } from "../../infrastructure/db/schema.js";
import { generateId } from "../../shared/id.js";
import { evaluateWithLlmSafe } from "./llm-evaluator.js";
import type { Rule } from "./rules/base.js";
import type { LintContext, LintEvaluation, LintResult, Verdict } from "./types.js";

/** 複数の評価結果から最も厳しい verdict を決定 */
function resolveVerdict(evaluations: LintEvaluation[]): Verdict {
	if (evaluations.some((e) => e.verdict === "BLOCK")) return "BLOCK";
	if (evaluations.some((e) => e.verdict === "WARN")) return "WARN";
	return "PASS";
}

/** 評価結果に Layer 2 の実行状態（BLOCK 確定スキップ or 全リトライ失敗）を含む */
export interface LintResultWithMeta extends LintResult {
	layer2Skipped: boolean;
}

/** Linter エンジン（Layer 1 + Layer 2 統合） */
export class LinterEngine {
	private rules: Rule[] = [];

	constructor(private db: AppDatabase) {}

	/** ルールを登録 */
	addRule(rule: Rule): void {
		this.rules.push(rule);
	}

	/** Layer 1: ルールベース評価を実行 */
	evaluate(action: string, context: LintContext = {}): LintResult {
		const evaluations: LintEvaluation[] = [];

		for (const rule of this.rules) {
			if (!rule.enabled) continue;
			const result = rule.evaluate(action, context);
			if (result) {
				evaluations.push(result);
			}
		}

		const verdict = resolveVerdict(evaluations);
		const timestamp = new Date().toISOString();

		return { action, verdict, evaluations, timestamp };
	}

	/** Layer 1 + Layer 2 統合評価（Layer 2 は常に実行） */
	async evaluateWithAI(
		action: string,
		context: LintContext,
		provider: AIProvider,
	): Promise<LintResultWithMeta> {
		// Layer 1
		const layer1Result = this.evaluate(action, context);

		// Layer 1 で BLOCK → Layer 2 はスキップ（コスト最適化: 既に BLOCK 確定）
		if (layer1Result.verdict === "BLOCK") {
			return { ...layer1Result, layer2Skipped: true };
		}

		// Layer 2: LLM 評価（Layer 1 の結果に関わらず常に実行）
		const { evaluations: llmEvaluations, skipped } = await evaluateWithLlmSafe(provider, action);

		const allEvaluations = [...layer1Result.evaluations, ...llmEvaluations];
		const verdict = resolveVerdict(allEvaluations);

		return {
			action,
			verdict,
			evaluations: allEvaluations,
			// Layer 2 がスキップ（全リトライ失敗）の場合は Layer 1 の timestamp を使用
			timestamp: skipped ? layer1Result.timestamp : new Date().toISOString(),
			layer2Skipped: skipped,
		};
	}

	/** 評価結果を DB に保存 */
	saveResult(result: LintResult, suggestionId?: string): string {
		const id = generateId();
		this.db
			.insert(lintResults)
			.values({
				id,
				suggestionId: suggestionId ?? null,
				action: result.action,
				verdict: result.verdict,
				evaluations: result.evaluations,
				timestamp: result.timestamp,
			})
			.run();
		return id;
	}
}

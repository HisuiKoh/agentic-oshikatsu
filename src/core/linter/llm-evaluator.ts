import { z } from "zod";
import type { AIProvider } from "../../infrastructure/ai/types.js";
import { recordUsage } from "../../infrastructure/ai/usage-tracker.js";
import { logger } from "../../shared/logger.js";
import type { LintEvaluation, RiskCategory } from "./types.js";

/** LLM が返すリスク評価スキーマ */
const LlmRiskEvaluationSchema = z.object({
	evaluations: z
		.array(
			z.object({
				category: z.enum(["social_risk", "legal_risk", "oshi_impact", "fan_conflict"]),
				severity: z.number().min(0).max(10),
				reason: z.string(),
			}),
		)
		.default([]),
});

const SYSTEM_PROMPT = `あなたは推し活のリスク評価アシスタントです。
ユーザーが入力した「推し活の行動」を以下の4つの観点で**すべて**リスク評価してください。

評価カテゴリ（4つすべて必須）:
- social_risk: SNS 炎上リスク（批判的投稿、不適切な発言、プライバシー侵害、下品・卑猥な内容の投稿・行動など）
- legal_risk: 法的リスク（著作権侵害、肖像権侵害、条例違反、ストーカー行為、脅迫、窃盗、不法侵入、薬物、暴力、犯罪行為全般など）
- oshi_impact: 推しへの悪影響（迷惑行為、評判を下げる行動、本人に不快感を与える行動、推しの私生活への侵入、つきまといなど）
- fan_conflict: 同担・他ファンとの軋轢（マウント、排他的行動、コミュニティの雰囲気を壊す行動、他ファンへの攻撃・誹謗中傷など）

各カテゴリについて:
- severity: 0（問題なし）〜 10（非常に危険）
- reason: 理由を日本語で簡潔に説明

**重要なルール:**
- 4つのカテゴリすべてを必ず返してください。省略しないでください。
- 問題がないカテゴリは severity: 0 として返してください。
- 性的・下品な内容、犯罪行為、暴力行為、ハラスメントは severity 8 以上にしてください。
- 行動が明確に倫理・法律に反する場合は severity 9-10 にしてください。
- 「推し活」として不自然な行動（犯罪、迷惑行為）は厳しく評価してください。`;

/** severity を verdict に変換する閾値 */
const BLOCK_THRESHOLD = 7;
const WARN_THRESHOLD = 4;

/** LLM ベースのリスク評価を実行（Layer 2） */
export async function evaluateWithLlm(
	provider: AIProvider,
	action: string,
): Promise<LintEvaluation[]> {
	const prompt = `以下の推し活の行動をリスク評価してください:

「${action}」`;

	const response = await provider.queryStructured(prompt, LlmRiskEvaluationSchema, {
		purpose: "linting",
		systemPrompt: SYSTEM_PROMPT,
		maxTokens: 1024,
		temperature: 0.2,
	});

	// 使用量を記録
	const cost = provider.estimateCost(
		response.usage.inputTokens,
		response.usage.outputTokens,
		response.usage.cacheTokens,
	);
	recordUsage(
		{
			content: "",
			usage: response.usage,
			model: response.model,
			provider: response.provider,
		},
		"linting",
		cost,
	);

	// severity → verdict に変換（全カテゴリを返す）
	return response.data.evaluations.map(
		(e): LintEvaluation => ({
			ruleId: "llm-evaluator",
			category: e.category as RiskCategory,
			verdict:
				e.severity >= BLOCK_THRESHOLD ? "BLOCK" : e.severity >= WARN_THRESHOLD ? "WARN" : "PASS",
			message: e.reason,
			// LLM が正常に評価を返した時点で確信度は高い
			confidence: 85,
		}),
	);
}

/** リトライ付き LLM 評価（最大 maxRetries 回） */
export async function evaluateWithLlmSafe(
	provider: AIProvider,
	action: string,
	maxRetries: number = 3,
): Promise<{ evaluations: LintEvaluation[]; skipped: boolean }> {
	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			const evaluations = await evaluateWithLlm(provider, action);
			return { evaluations, skipped: false };
		} catch (error) {
			logger.debug(
				`LLM 評価 試行 ${attempt}/${maxRetries} 失敗: ${error instanceof Error ? error.message : "unknown"}`,
			);
			if (attempt < maxRetries) {
				// 指数バックオフ: 1s, 2s, 4s
				const delay = 2 ** (attempt - 1) * 1000;
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}
	}

	logger.warn("LLM 評価が全リトライ失敗。Layer 1 の結果のみで返却します");
	return { evaluations: [], skipped: true };
}

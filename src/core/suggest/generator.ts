import { z } from "zod";
import type { AIProvider } from "../../infrastructure/ai/types.js";
import { recordUsage } from "../../infrastructure/ai/usage-tracker.js";
import { logger } from "../../shared/logger.js";

/** 提案カテゴリ */
export type SuggestionCategory = "goods" | "event" | "sns" | "communication" | "creative" | "other";

/** 生成された提案 */
export interface GeneratedSuggestion {
	category: SuggestionCategory;
	content: string;
	reason: string;
}

/** LLM が返す提案スキーマ */
const SuggestionResponseSchema = z.object({
	suggestions: z.array(
		z.object({
			category: z.enum(["goods", "event", "sns", "communication", "creative", "other"]),
			content: z.string(),
			reason: z.string(),
		}),
	),
});

/** 提案生成に渡すコンテキスト */
export interface SuggestContext {
	oshiName: string;
	oshiCategory: string;
	oshiDescription?: string | null;
	attributes?: Array<{ key: string; value: string }>;
	recentInfo?: Array<{
		title: string;
		summary?: string | null;
		publishedAt?: string | null;
		eventDate?: string | null;
	}>;
	budgetRemaining?: number;
	budgetTotal?: number;
}

const SYSTEM_PROMPT = `あなたは推し活アドバイザーです。
ユーザーの推しに関する情報をもとに、具体的で実行可能な推し活の行動を提案してください。

提案カテゴリ:
- goods: グッズ購入（公式グッズ、ファンメイドなど）
- event: イベント参加（ライブ、展示会、聖地巡礼など）
- sns: SNS活動（応援投稿、ファンアート共有、ハッシュタグ参加など）
- communication: コミュニケーション（ファンコミュニティ参加、ファンレターなど）
- creative: クリエイティブ活動（ファンアート制作、考察記事、布教活動など）
- other: その他

各提案には:
- content: 具体的な行動提案（日本語）
- reason: なぜこの提案をするのか（日本語で簡潔に）

推しのカテゴリや属性に合わせた提案をしてください。
予算情報がある場合は予算内で実行可能な提案を優先してください。`;

/** 行動提案を AI で生成 */
export async function generateSuggestions(
	provider: AIProvider,
	context: SuggestContext,
	count: number = 3,
	profilePrompt?: string,
): Promise<GeneratedSuggestion[]> {
	const prompt = buildPrompt(context, count);
	const systemPrompt = profilePrompt ? `${SYSTEM_PROMPT}${profilePrompt}` : SYSTEM_PROMPT;

	const response = await provider.queryStructured(prompt, SuggestionResponseSchema, {
		purpose: "suggestion",
		systemPrompt,
		maxTokens: 2048,
		temperature: 0.7,
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
		"suggestion",
		cost,
	);

	logger.debug(`提案 ${response.data.suggestions.length} 件を生成しました`);

	return response.data.suggestions;
}

/** プロンプトを構築 */
function buildPrompt(context: SuggestContext, count: number): string {
	const parts: string[] = [];

	parts.push(`推し: ${context.oshiName}`);
	parts.push(`カテゴリ: ${context.oshiCategory}`);

	if (context.oshiDescription) {
		parts.push(`説明: ${context.oshiDescription}`);
	}

	if (context.attributes?.length) {
		const attrText = context.attributes.map((a) => `  - ${a.key}: ${a.value}`).join("\n");
		parts.push(`属性情報:\n${attrText}`);
	}

	if (context.recentInfo?.length) {
		const infoText = context.recentInfo
			.slice(0, 5)
			.map((i) => {
				let line = `  - ${i.title}`;
				if (i.publishedAt) line += ` (公開: ${i.publishedAt.slice(0, 10)})`;
				if (i.eventDate) line += ` 【${i.eventDate}】`;
				if (i.summary) line += `（${i.summary}）`;
				return line;
			})
			.join("\n");
		parts.push(`最近の情報:\n${infoText}`);
	}

	if (context.budgetRemaining !== undefined) {
		parts.push(`残り予算: ${context.budgetRemaining.toLocaleString()}円`);
		if (context.budgetTotal !== undefined) {
			parts.push(`予算総額: ${context.budgetTotal.toLocaleString()}円`);
		}
	}

	parts.push(`\n${count}件の推し活の行動を提案してください。`);

	return parts.join("\n");
}

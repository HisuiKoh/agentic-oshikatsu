import { z } from "zod";
import type { AIProvider } from "../../infrastructure/ai/types.js";
import { recordUsage } from "../../infrastructure/ai/usage-tracker.js";
import type { AnalyzedInfo, RawCollectedInfo } from "./types.js";

/** 分析項目のスキーマ */
const InfoAnalysisItemSchema = z.object({
	summary: z.string(),
	category: z.string(),
	importance: z.number().min(0).max(10),
	relevanceScore: z.number().int().min(0).max(100),
	sentiment: z.enum(["positive", "neutral", "negative"]),
	eventDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.refine(
			(val) => {
				const d = new Date(val);
				return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === val;
			},
			{ message: "存在しない日付です" },
		)
		.nullable(),
});

/** AI が返す分析結果のスキーマ（入力と同じ順序・同じ件数の配列） */
const InfoAnalysisSchema = z.preprocess(
	// AI が配列を直接返す場合に { items: [...] } に正規化
	(val) => (Array.isArray(val) ? { items: val } : val),
	z.object({
		items: z.array(InfoAnalysisItemSchema),
	}),
);

/** rawContent からテキスト情報を安全に抽出 */
function extractContent(raw: unknown): string {
	if (!raw || typeof raw !== "object") return "";

	const obj = raw as Record<string, unknown>;

	// Wikipedia: extract（記事本文）優先、なければ snippet
	if (typeof obj.extract === "string" && obj.extract) {
		return obj.extract.slice(0, 1000);
	}
	if (typeof obj.snippet === "string" && obj.snippet) {
		return obj.snippet;
	}
	// Google News: description
	if (typeof obj.description === "string" && obj.description) {
		return obj.description.slice(0, 500);
	}
	return "";
}

/** 収集した情報を AI で一括分析 */
export async function analyzeCollectedInfo(
	provider: AIProvider,
	oshiName: string,
	items: RawCollectedInfo[],
): Promise<AnalyzedInfo[]> {
	if (items.length === 0) return [];

	const itemList = items
		.map((item, i) => {
			const content = extractContent(item.rawContent);
			let entry = `[${i}] タイトル: ${item.title}\nURL: ${item.url}`;
			if (item.publishedAt) entry += `\n公開日: ${item.publishedAt}`;
			if (content) entry += `\n内容: ${content}`;
			return entry;
		})
		.join("\n\n");

	const prompt = `「${oshiName}」に関する収集情報を分析してください。

以下の各項目について:
1. summary: 日本語で 2-3 文の要約（記事の具体的な内容を含む）
2. category: カテゴリ（活動報告, リリース, イベント, コラボ, メディア出演, 話題, その他）
3. importance: 推し活者にとっての重要度（1-10、10が最重要）
4. sentiment: 感情（positive / neutral / negative）
5. eventDate: 記事が言及しているイベント・予定・発売日等の日時（YYYY-MM-DD 形式）。日付が明示されていない場合は null。複数日付がある場合は最も直近の未来の日付を1つだけ返す。「3月15日」のように年が省略されている場合は公開日から推察する。過去のイベント（発売日、放送日等）も対象とする。
6. relevanceScore: 「${oshiName}」への関連性スコア（0-100）
   - 80-100: 推しに直接関連（本人の活動、発言、公式発表）
   - 30-79: 間接的に関連（活動分野の話題、所属グループ等）
   - 0-29: 無関係（名前の偶然一致、別の文脈）

「内容」フィールドがある場合はそれを読んで正確に要約してください。
タイトルのみの場合はタイトルから推察してください。

重要: 入力と同じ順番・同じ件数で結果を返してください。スキップや並べ替えはしないでください。

収集情報:
${itemList}`;

	const response = await provider.queryStructured(prompt, InfoAnalysisSchema, {
		purpose: "info_analysis",
		systemPrompt:
			"あなたは推し活に精通した情報分析アシスタントです。収集された情報の内容を正確に要約し、推し活者にとっての価値を評価します。",
		maxTokens: 2048,
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
		"info_analysis",
		cost,
	);

	// 入力と同じ順序の配列で返されるため、位置でマッピング
	return items.map((_, i) => {
		const analysis = response.data.items[i];
		return {
			summary: analysis?.summary ?? "（分析結果なし）",
			category: analysis?.category ?? "その他",
			importance: analysis?.importance ?? 5,
			sentiment: analysis?.sentiment ?? "neutral",
			eventDate: analysis?.eventDate ?? null,
			relevanceScore: analysis?.relevanceScore ?? 50,
		};
	});
}

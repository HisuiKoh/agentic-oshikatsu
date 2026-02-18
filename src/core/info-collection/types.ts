import { z } from "zod";

/** 収集オプション */
export interface CollectOptions {
	/** 最大取得件数 */
	maxItems?: number;
	/** 言語（デフォルト: ja） */
	language?: string;
	/** 特定プラグインのみ実行（プラグイン ID） */
	sourcePlugin?: string;
}

/** 収集された情報（DB 保存前） */
export interface RawCollectedInfo {
	sourcePlugin: string;
	title: string;
	url: string;
	rawContent?: unknown;
	publishedAt?: string;
}

/** AI 分析済みの情報 */
export interface AnalyzedInfo {
	summary: string;
	category: string;
	importance: number;
	sentiment: "positive" | "neutral" | "negative";
	eventDate: string | null;
	relevanceScore: number;
}

/** DB に保存された情報 */
export const CollectedInfoSchema = z.object({
	id: z.string(),
	oshiId: z.string(),
	sourcePlugin: z.string(),
	title: z.string(),
	url: z.string().nullable().optional(),
	summary: z.string().nullable().optional(),
	category: z.string().nullable().optional(),
	importance: z.number().nullable().optional(),
	sentiment: z.string().nullable().optional(),
	rawContent: z.unknown().nullable().optional(),
	collectedAt: z.string(),
	publishedAt: z.string().nullable().optional(),
	eventDate: z.string().nullable().optional(),
	isRead: z.boolean(),
	relevanceScore: z.number().nullable().optional(),
	approvalStatus: z.enum(["approved", "pending", "rejected"]).optional(),
});

export type CollectedInfo = z.infer<typeof CollectedInfoSchema>;

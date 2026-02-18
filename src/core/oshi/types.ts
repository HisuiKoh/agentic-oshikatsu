import { z } from "zod";

export const OSHI_CATEGORIES = [
	"person",
	"vtuber",
	"character",
	"idol",
	"musician",
	"actor",
	"athlete",
	"creator",
	"animal",
	"place",
	"architecture",
	"food",
	"mineral",
	"concept",
	"academic",
	"other",
] as const;

export type OshiCategory = (typeof OSHI_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<OshiCategory, string> = {
	person: "人物（一般）",
	vtuber: "VTuber",
	character: "キャラクター",
	idol: "アイドル",
	musician: "ミュージシャン",
	actor: "俳優・声優",
	athlete: "スポーツ選手",
	creator: "クリエイター",
	animal: "動物",
	place: "場所",
	architecture: "建築物",
	food: "食べ物・飲み物",
	mineral: "鉱物・宝石",
	concept: "概念・思想",
	academic: "学問・分野",
	other: "その他",
};

export const OshiSchema = z.object({
	id: z.string(),
	name: z.string().min(1, "名前は必須です"),
	category: z.enum(OSHI_CATEGORIES),
	subcategory: z.string().nullable().optional(),
	description: z.string().nullable().optional(),
	imageUrl: z.string().url().nullable().optional(),
	registeredAt: z.string(),
	metadata: z.unknown().nullable().optional(),
});

export type Oshi = z.infer<typeof OshiSchema>;

export const OshiAttributeSchema = z.object({
	id: z.string(),
	oshiId: z.string(),
	key: z.string().min(1),
	value: z.string(),
	source: z.string().nullable().optional(),
	collectedAt: z.string().nullable().optional(),
});

export type OshiAttribute = z.infer<typeof OshiAttributeSchema>;

import { describe, expect, it } from "vitest";
import { z } from "zod";

/**
 * analyzer.ts 内部の InfoAnalysisItemSchema と同じ定義。
 * モジュール内部で export されていないため、テスト用に再定義してバリデーションを検証する。
 */
const InfoAnalysisItemSchema = z.object({
	summary: z.string(),
	category: z.string(),
	importance: z.number().min(0).max(10),
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

describe("InfoAnalysisItemSchema の eventDate バリデーション", () => {
	const baseItem = {
		summary: "テスト要約",
		category: "イベント",
		importance: 8,
		sentiment: "positive" as const,
	};

	it("正常な YYYY-MM-DD 形式の eventDate をパースできる", () => {
		const result = InfoAnalysisItemSchema.safeParse({
			...baseItem,
			eventDate: "2026-03-15",
		});

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.eventDate).toBe("2026-03-15");
		}
	});

	it("eventDate が null の場合に正常に処理される", () => {
		const result = InfoAnalysisItemSchema.safeParse({
			...baseItem,
			eventDate: null,
		});

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.eventDate).toBeNull();
		}
	});

	it("eventDate が不正な形式の場合に Zod バリデーションで弾かれる", () => {
		// 日本語形式
		const result1 = InfoAnalysisItemSchema.safeParse({
			...baseItem,
			eventDate: "2026年3月15日",
		});
		expect(result1.success).toBe(false);

		// スラッシュ区切り
		const result2 = InfoAnalysisItemSchema.safeParse({
			...baseItem,
			eventDate: "2026/03/15",
		});
		expect(result2.success).toBe(false);

		// 日時形式（時刻付き）
		const result3 = InfoAnalysisItemSchema.safeParse({
			...baseItem,
			eventDate: "2026-03-15T10:00:00",
		});
		expect(result3.success).toBe(false);

		// 月日のみ
		const result4 = InfoAnalysisItemSchema.safeParse({
			...baseItem,
			eventDate: "03-15",
		});
		expect(result4.success).toBe(false);
	});

	it("存在しない日付の場合に Zod バリデーションで弾かれる", () => {
		// 存在しない月
		const result1 = InfoAnalysisItemSchema.safeParse({
			...baseItem,
			eventDate: "2026-13-01",
		});
		expect(result1.success).toBe(false);

		// 存在しない日
		const result2 = InfoAnalysisItemSchema.safeParse({
			...baseItem,
			eventDate: "2026-02-30",
		});
		expect(result2.success).toBe(false);

		// ゼロ月
		const result3 = InfoAnalysisItemSchema.safeParse({
			...baseItem,
			eventDate: "2026-00-15",
		});
		expect(result3.success).toBe(false);
	});
});

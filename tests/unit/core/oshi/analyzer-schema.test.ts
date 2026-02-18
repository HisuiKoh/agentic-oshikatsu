import { describe, expect, it, vi } from "vitest";
import { OshiAnalysisSchema } from "@/core/oshi/analyzer.js";

// recordUsage は DB アクセスするためモック
vi.mock("@/infrastructure/ai/usage-tracker.js", () => ({
	recordUsage: vi.fn(),
}));

describe("OshiAnalysisSchema", () => {
	it("正常な分析結果をパースできる", () => {
		const input = {
			category: "vtuber",
			description: "歌とトークが魅力の VTuber",
			attributes: [
				{ key: "debut_date", value: "2023-04-01" },
				{ key: "affiliation", value: "個人" },
			],
		};
		const result = OshiAnalysisSchema.safeParse(input);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.category).toBe("vtuber");
			expect(result.data.attributes).toHaveLength(2);
		}
	});

	it("数値の value を文字列に変換できる（z.coerce.string）", () => {
		const input = {
			category: "vtuber",
			description: "テスト",
			attributes: [
				{ key: "debut_year", value: 2023 },
				{ key: "subscriber_count", value: 150000 },
			],
		};
		const result = OshiAnalysisSchema.safeParse(input);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.attributes[0].value).toBe("2023");
			expect(result.data.attributes[1].value).toBe("150000");
		}
	});

	it("boolean の value を文字列に変換できる", () => {
		const input = {
			category: "character",
			description: "テスト",
			attributes: [{ key: "is_protagonist", value: true }],
		};
		const result = OshiAnalysisSchema.safeParse(input);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.attributes[0].value).toBe("true");
		}
	});

	it("空の attributes 配列を受け付ける", () => {
		const input = {
			category: "other",
			description: "不明な対象",
			attributes: [],
		};
		const result = OshiAnalysisSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	it("無効なカテゴリを拒否する", () => {
		const input = {
			category: "invalid_category",
			description: "テスト",
			attributes: [],
		};
		const result = OshiAnalysisSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	it("description が欠けていると拒否する", () => {
		const input = {
			category: "vtuber",
			attributes: [],
		};
		const result = OshiAnalysisSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	it("attributes が配列でない場合を拒否する", () => {
		const input = {
			category: "vtuber",
			description: "テスト",
			attributes: "not an array",
		};
		const result = OshiAnalysisSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	it("attribute に key が欠けていると拒否する", () => {
		const input = {
			category: "vtuber",
			description: "テスト",
			attributes: [{ value: "test" }],
		};
		const result = OshiAnalysisSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	it("全カテゴリを受け付ける", () => {
		const categories = [
			"person", "vtuber", "character", "idol", "musician",
			"actor", "athlete", "creator", "animal", "place",
			"architecture", "food", "mineral", "concept", "academic", "other",
		];
		for (const category of categories) {
			const result = OshiAnalysisSchema.safeParse({
				category,
				description: "テスト",
				attributes: [],
			});
			expect(result.success, `category "${category}" should be valid`).toBe(true);
		}
	});

	it("AI が返しそうな複合的なレスポンスをパースできる", () => {
		// AI が実際に返す可能性のあるレスポンス例
		const input = {
			category: "vtuber",
			description: "杵月のあは歌とトークが魅力の個人 VTuber。毎週の配信で多くのファンに支持されている。",
			attributes: [
				{ key: "debut_date", value: "2023-04-01" },
				{ key: "affiliation", value: "個人" },
				{ key: "channel_name", value: "杵月のあ ch." },
				{ key: "fan_name", value: "のあぴ" },
				{ key: "fanmark", value: "🌙" },
				{ key: "genre", value: "歌枠, 雑談, ゲーム実況" },
				{ key: "subscriber_count", value: 50000 },  // 数値
				{ key: "is_active", value: true },           // boolean
			],
		};
		const result = OshiAnalysisSchema.safeParse(input);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.attributes).toHaveLength(8);
			// 数値・boolean が文字列に変換されていることを確認
			const subscriberAttr = result.data.attributes.find(a => a.key === "subscriber_count");
			expect(subscriberAttr?.value).toBe("50000");
			const activeAttr = result.data.attributes.find(a => a.key === "is_active");
			expect(activeAttr?.value).toBe("true");
		}
	});
});

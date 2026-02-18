import { describe, expect, it, vi } from "vitest";
import { generateSuggestions, type SuggestContext } from "@/core/suggest/generator.js";
import type { AIProvider } from "@/infrastructure/ai/types.js";

vi.mock("@/infrastructure/ai/usage-tracker.js", () => ({
	recordUsage: vi.fn(),
}));

function createMockProvider(suggestions: unknown[]): AIProvider {
	return {
		id: "claude",
		query: vi.fn(),
		queryStructured: vi.fn().mockResolvedValue({
			data: { suggestions },
			usage: { inputTokens: 200, outputTokens: 100 },
			model: "claude-sonnet-4-5-20250929",
			provider: "claude",
		}),
		estimateCost: vi.fn().mockReturnValue(0.002),
	};
}

const BASE_CONTEXT: SuggestContext = {
	oshiName: "杵月のあ",
	oshiCategory: "vtuber",
	oshiDescription: "歌が得意な VTuber",
};

describe("generateSuggestions", () => {
	it("提案を生成して返す", async () => {
		const mockSuggestions = [
			{ category: "goods", content: "新しいアクリルスタンドを購入する", reason: "最新グッズ" },
			{ category: "event", content: "次回のライブ配信を視聴する", reason: "応援" },
			{ category: "sns", content: "ファンアートをシェアする", reason: "コミュニティ参加" },
		];
		const provider = createMockProvider(mockSuggestions);

		const result = await generateSuggestions(provider, BASE_CONTEXT, 3);

		expect(result).toHaveLength(3);
		expect(result[0].category).toBe("goods");
		expect(result[0].content).toBe("新しいアクリルスタンドを購入する");
		expect(result[0].reason).toBe("最新グッズ");
	});

	it("queryStructured に purpose=suggestion を渡す", async () => {
		const provider = createMockProvider([]);

		await generateSuggestions(provider, BASE_CONTEXT);

		expect(provider.queryStructured).toHaveBeenCalledWith(
			expect.any(String),
			expect.any(Object),
			expect.objectContaining({ purpose: "suggestion" }),
		);
	});

	it("プロンプトに推し情報が含まれる", async () => {
		const provider = createMockProvider([]);

		await generateSuggestions(provider, {
			...BASE_CONTEXT,
			attributes: [{ key: "活動場所", value: "YouTube" }],
			budgetRemaining: 10000,
		});

		const prompt = (provider.queryStructured as ReturnType<typeof vi.fn>).mock.calls[0][0];
		expect(prompt).toContain("杵月のあ");
		expect(prompt).toContain("vtuber");
		expect(prompt).toContain("YouTube");
		expect(prompt).toContain("10,000");
	});

	it("recentInfo がプロンプトに含まれる", async () => {
		const provider = createMockProvider([]);

		await generateSuggestions(provider, {
			...BASE_CONTEXT,
			recentInfo: [{ title: "新曲リリース", summary: "配信開始" }],
		});

		const prompt = (provider.queryStructured as ReturnType<typeof vi.fn>).mock.calls[0][0];
		expect(prompt).toContain("新曲リリース");
		expect(prompt).toContain("配信開始");
	});

	it("使用量を記録する", async () => {
		const provider = createMockProvider([]);
		await generateSuggestions(provider, BASE_CONTEXT);

		expect(provider.estimateCost).toHaveBeenCalledWith(200, 100, undefined);
	});

	it("AI が空の提案配列を返した場合、空配列を返す", async () => {
		const provider = createMockProvider([]);
		const result = await generateSuggestions(provider, BASE_CONTEXT, 3);
		expect(result).toHaveLength(0);
	});

	it("予算情報なしでもプロンプトを構築できる", async () => {
		const provider = createMockProvider([]);
		await generateSuggestions(provider, {
			oshiName: "テスト推し",
			oshiCategory: "character",
		});

		const prompt = (provider.queryStructured as ReturnType<typeof vi.fn>).mock.calls[0][0];
		expect(prompt).toContain("テスト推し");
		expect(prompt).not.toContain("残り予算");
	});
});

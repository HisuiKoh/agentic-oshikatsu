import { describe, expect, it, vi } from "vitest";
import { evaluateWithLlm, evaluateWithLlmSafe } from "@/core/linter/llm-evaluator.js";
import type { AIProvider, StructuredAIResponse } from "@/infrastructure/ai/types.js";

// recordUsage は DB アクセスするためモック
vi.mock("@/infrastructure/ai/usage-tracker.js", () => ({
	recordUsage: vi.fn(),
}));

/** モック AIProvider を作成 */
function createMockProvider(
	response: StructuredAIResponse<{
		evaluations: Array<{ category: string; severity: number; reason: string }>;
	}>,
): AIProvider {
	return {
		id: "claude",
		query: vi.fn(),
		queryStructured: vi.fn().mockResolvedValue(response),
		estimateCost: vi.fn().mockReturnValue(0.001),
	};
}

const mockUsage = { inputTokens: 100, outputTokens: 50 };

describe("evaluateWithLlm", () => {
	it("高 severity で BLOCK を返す", async () => {
		const provider = createMockProvider({
			data: {
				evaluations: [
					{ category: "social_risk", severity: 9, reason: "炎上する可能性が非常に高い" },
				],
			},
			usage: mockUsage,
			model: "claude-haiku-4-5-20251001",
			provider: "claude",
		});

		const results = await evaluateWithLlm(provider, "他推しを批判する投稿");
		expect(results).toHaveLength(1);
		expect(results[0].verdict).toBe("BLOCK");
		expect(results[0].category).toBe("social_risk");
	});

	it("中 severity で WARN を返す", async () => {
		const provider = createMockProvider({
			data: {
				evaluations: [
					{ category: "fan_conflict", severity: 5, reason: "他ファンとの摩擦の可能性" },
				],
			},
			usage: mockUsage,
			model: "claude-haiku-4-5-20251001",
			provider: "claude",
		});

		const results = await evaluateWithLlm(provider, "自分の推しが一番だと主張する");
		expect(results).toHaveLength(1);
		expect(results[0].verdict).toBe("WARN");
	});

	it("低 severity は PASS として返る（フィルタされない）", async () => {
		const provider = createMockProvider({
			data: {
				evaluations: [{ category: "social_risk", severity: 2, reason: "軽微なリスク" }],
			},
			usage: mockUsage,
			model: "claude-haiku-4-5-20251001",
			provider: "claude",
		});

		const results = await evaluateWithLlm(provider, "推しの配信を視聴する");
		expect(results).toHaveLength(1);
		expect(results[0].verdict).toBe("PASS");
		expect(results[0].category).toBe("social_risk");
	});

	it("問題なしの場合は空配列", async () => {
		const provider = createMockProvider({
			data: { evaluations: [] },
			usage: mockUsage,
			model: "claude-haiku-4-5-20251001",
			provider: "claude",
		});

		const results = await evaluateWithLlm(provider, "推しのイベントに参加する");
		expect(results).toHaveLength(0);
	});

	it("複数のリスクを返す", async () => {
		const provider = createMockProvider({
			data: {
				evaluations: [
					{ category: "social_risk", severity: 8, reason: "炎上リスク" },
					{ category: "oshi_impact", severity: 6, reason: "推しへの悪影響" },
				],
			},
			usage: mockUsage,
			model: "claude-haiku-4-5-20251001",
			provider: "claude",
		});

		const results = await evaluateWithLlm(provider, "推しの自宅付近を訪問する");
		expect(results).toHaveLength(2);
		expect(results[0].verdict).toBe("BLOCK");
		expect(results[1].verdict).toBe("WARN");
	});
});

describe("evaluateWithLlmSafe", () => {
	it("成功時は skipped: false", async () => {
		const provider = createMockProvider({
			data: { evaluations: [] },
			usage: mockUsage,
			model: "claude-haiku-4-5-20251001",
			provider: "claude",
		});

		const { evaluations, skipped } = await evaluateWithLlmSafe(provider, "推しを応援する");
		expect(evaluations).toHaveLength(0);
		expect(skipped).toBe(false);
	});

	it("全リトライ失敗時は skipped: true", async () => {
		const provider: AIProvider = {
			id: "claude",
			query: vi.fn(),
			queryStructured: vi.fn().mockRejectedValue(new Error("API error")),
			estimateCost: vi.fn(),
		};

		const { evaluations, skipped } = await evaluateWithLlmSafe(provider, "テスト", 1);
		expect(evaluations).toHaveLength(0);
		expect(skipped).toBe(true);
	});
});

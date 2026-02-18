import { describe, expect, it } from "vitest";
import type {
	AIProvider,
	AIResponse,
	QueryOptions,
	TokenUsage,
} from "@/infrastructure/ai/types.js";

describe("AI 型定義", () => {
	it("AIResponse が正しい構造を持つ", () => {
		const response: AIResponse = {
			content: "テスト応答",
			usage: { inputTokens: 100, outputTokens: 50 },
			model: "claude-sonnet-4-5-20250929",
			provider: "claude",
		};

		expect(response.content).toBe("テスト応答");
		expect(response.usage.inputTokens).toBe(100);
		expect(response.provider).toBe("claude");
	});

	it("TokenUsage の cacheTokens はオプショナル", () => {
		const usage: TokenUsage = { inputTokens: 100, outputTokens: 50 };
		expect(usage.cacheTokens).toBeUndefined();

		const usageWithCache: TokenUsage = { inputTokens: 100, outputTokens: 50, cacheTokens: 30 };
		expect(usageWithCache.cacheTokens).toBe(30);
	});

	it("QueryOptions の全フィールドがオプショナル", () => {
		const opts: QueryOptions = {};
		expect(opts.model).toBeUndefined();
		expect(opts.systemPrompt).toBeUndefined();
		expect(opts.maxTokens).toBeUndefined();
		expect(opts.temperature).toBeUndefined();
		expect(opts.purpose).toBeUndefined();
	});

	it("AIProvider インターフェースが id, query, queryStructured, estimateCost を持つ", () => {
		// TypeScript の型レベルテスト — コンパイルが通ればOK
		const mockProvider: AIProvider = {
			id: "claude",
			query: async () => ({
				content: "",
				usage: { inputTokens: 0, outputTokens: 0 },
				model: "test",
				provider: "claude",
			}),
			queryStructured: async () => ({}) as never,
			estimateCost: () => 0,
		};

		expect(mockProvider.id).toBe("claude");
		expect(typeof mockProvider.query).toBe("function");
		expect(typeof mockProvider.queryStructured).toBe("function");
		expect(typeof mockProvider.estimateCost).toBe("function");
	});
});

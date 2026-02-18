import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginOshiContext } from "@/infrastructure/plugins/base.js";
import { createXApiPlugin } from "@/infrastructure/plugins/x-api.js";

// readConfig をモック
vi.mock("@/infrastructure/config/manager.js", () => ({
	readConfig: vi.fn(),
}));

import { readConfig } from "@/infrastructure/config/manager.js";

const mockReadConfig = vi.mocked(readConfig);

const testOshi: PluginOshiContext = {
	id: "test-oshi-1",
	name: "テスト推し",
	category: "vtuber",
	attributes: [],
};

describe("X API プラグイン", () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		vi.clearAllMocks();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("プラグイン ID と名前が正しい", () => {
		const plugin = createXApiPlugin();
		expect(plugin.id).toBe("x");
		expect(plugin.name).toBe("X (Twitter)");
		expect(plugin.supportedCategories).toBe("*");
	});

	it("Bearer Token が未設定の場合 canHandle が false を返す", () => {
		mockReadConfig.mockReturnValue({
			externalApis: {},
		} as never);

		const plugin = createXApiPlugin();
		expect(plugin.canHandle(testOshi)).toBe(false);
	});

	it("Bearer Token が設定済みの場合 canHandle が true を返す", () => {
		mockReadConfig.mockReturnValue({
			externalApis: { x: "test-bearer-token" },
		} as never);

		const plugin = createXApiPlugin();
		expect(plugin.canHandle(testOshi)).toBe(true);
	});

	it("Bearer Token 未設定時は空配列を返す", async () => {
		mockReadConfig.mockReturnValue({
			externalApis: {},
		} as never);

		const plugin = createXApiPlugin();
		const result = await plugin.collect(testOshi);
		expect(result).toEqual([]);
	});

	it("X API のレスポンスをパースできる", async () => {
		mockReadConfig.mockReturnValue({
			externalApis: { x: "test-bearer-token" },
		} as never);

		const mockResponse = {
			data: [
				{
					id: "12345",
					text: "推しの最新ツイート内容です",
					created_at: "2026-01-15T10:00:00Z",
					author_id: "user1",
					public_metrics: {
						retweet_count: 5,
						reply_count: 2,
						like_count: 100,
						quote_count: 1,
					},
				},
				{
					id: "67890",
					text: "別のツイート",
					author_id: "user2",
				},
			],
			meta: {
				result_count: 2,
			},
		};

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockResponse),
		});

		const plugin = createXApiPlugin();
		const result = await plugin.collect(testOshi);

		expect(result).toHaveLength(2);
		expect(result[0].sourcePlugin).toBe("x");
		expect(result[0].title).toBe("推しの最新ツイート内容です");
		expect(result[0].url).toBe("https://x.com/i/status/12345");
		expect(result[0].publishedAt).toBe("2026-01-15T10:00:00Z");
		expect(result[1].url).toBe("https://x.com/i/status/67890");
		expect(result[1].publishedAt).toBeUndefined();
	});

	it("長いツイートはタイトルが80文字で切り詰められる", async () => {
		mockReadConfig.mockReturnValue({
			externalApis: { x: "test-bearer-token" },
		} as never);

		const longText = "あ".repeat(100);
		const mockResponse = {
			data: [{ id: "1", text: longText, author_id: "u1" }],
		};

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockResponse),
		});

		const plugin = createXApiPlugin();
		const result = await plugin.collect(testOshi);

		expect(result[0].title.length).toBe(80);
		expect(result[0].title).toBe(`${"あ".repeat(77)}...`);
	});

	it("data が空の場合は空配列を返す", async () => {
		mockReadConfig.mockReturnValue({
			externalApis: { x: "test-bearer-token" },
		} as never);

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ meta: { result_count: 0 } }),
		});

		const plugin = createXApiPlugin();
		const result = await plugin.collect(testOshi);

		expect(result).toEqual([]);
	});

	it("HTTP エラー時は空配列を返す", async () => {
		mockReadConfig.mockReturnValue({
			externalApis: { x: "test-bearer-token" },
		} as never);

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 429,
			text: () => Promise.resolve("Rate limit exceeded"),
		});

		const plugin = createXApiPlugin();
		const result = await plugin.collect(testOshi);

		expect(result).toEqual([]);
	});

	it("ネットワークエラー時は空配列を返す", async () => {
		mockReadConfig.mockReturnValue({
			externalApis: { x: "test-bearer-token" },
		} as never);

		globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

		const plugin = createXApiPlugin();
		const result = await plugin.collect(testOshi);

		expect(result).toEqual([]);
	});

	it("Bearer Token がリクエストヘッダーに含まれる", async () => {
		mockReadConfig.mockReturnValue({
			externalApis: { x: "my-secret-token" },
		} as never);

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ data: [] }),
		});

		const plugin = createXApiPlugin();
		await plugin.collect(testOshi);

		const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
		const options = fetchCall[1] as RequestInit;
		expect(options.headers).toEqual(
			expect.objectContaining({
				Authorization: "Bearer my-secret-token",
			}),
		);
	});

	it("max_results が 10 未満の場合は 10 にクランプされる", async () => {
		mockReadConfig.mockReturnValue({
			externalApis: { x: "test-token" },
		} as never);

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ data: [] }),
		});

		const plugin = createXApiPlugin();
		await plugin.collect(testOshi, { maxItems: 3 });

		const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
		const url = fetchCall[0] as string;
		expect(url).toContain("max_results=10");
	});

	it("API エラーレスポンス（errors フィールド）時は空配列を返す", async () => {
		mockReadConfig.mockReturnValue({
			externalApis: { x: "test-token" },
		} as never);

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					errors: [{ message: "Unauthorized" }],
				}),
		});

		const plugin = createXApiPlugin();
		const result = await plugin.collect(testOshi);

		expect(result).toEqual([]);
	});

	it("検索クエリがダブルクォートでエスケープされる", async () => {
		mockReadConfig.mockReturnValue({
			externalApis: { x: "test-token" },
		} as never);

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ data: [] }),
		});

		const plugin = createXApiPlugin();
		await plugin.collect(testOshi);

		const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
		const url = fetchCall[0] as string;
		// URLSearchParams でエンコードされた "テスト推し" がクォートで囲まれている
		expect(url).toContain("query=%22");
	});
});

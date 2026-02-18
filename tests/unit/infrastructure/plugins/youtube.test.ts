import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginOshiContext } from "@/infrastructure/plugins/base.js";
import { createYouTubePlugin } from "@/infrastructure/plugins/youtube.js";

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

describe("YouTube プラグイン", () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		vi.clearAllMocks();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("プラグイン ID と名前が正しい", () => {
		const plugin = createYouTubePlugin();
		expect(plugin.id).toBe("youtube");
		expect(plugin.name).toBe("YouTube");
		expect(plugin.supportedCategories).toBe("*");
	});

	it("API Key が未設定の場合 canHandle が false を返す", () => {
		mockReadConfig.mockReturnValue({
			externalApis: {},
		} as never);

		const plugin = createYouTubePlugin();
		expect(plugin.canHandle(testOshi)).toBe(false);
	});

	it("API Key が設定済みの場合 canHandle が true を返す", () => {
		mockReadConfig.mockReturnValue({
			externalApis: { youtube: "test-api-key" },
		} as never);

		const plugin = createYouTubePlugin();
		expect(plugin.canHandle(testOshi)).toBe(true);
	});

	it("API Key 未設定時は空配列を返す", async () => {
		mockReadConfig.mockReturnValue({
			externalApis: {},
		} as never);

		const plugin = createYouTubePlugin();
		const result = await plugin.collect(testOshi);
		expect(result).toEqual([]);
	});

	it("YouTube API のレスポンスをパースできる", async () => {
		mockReadConfig.mockReturnValue({
			externalApis: { youtube: "test-api-key" },
		} as never);

		const mockResponse = {
			items: [
				{
					id: { videoId: "abc123" },
					snippet: {
						title: "テスト動画",
						publishedAt: "2026-01-15T10:00:00Z",
						description: "テストの説明",
						channelTitle: "テストチャンネル",
						thumbnails: {
							medium: { url: "https://example.com/thumb.jpg" },
						},
					},
				},
				{
					id: { videoId: "def456" },
					snippet: {
						title: "別の動画",
						publishedAt: "2026-01-14T10:00:00Z",
						description: "別の説明",
						channelTitle: "別チャンネル",
					},
				},
			],
		};

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockResponse),
		});

		const plugin = createYouTubePlugin();
		const result = await plugin.collect(testOshi);

		expect(result).toHaveLength(2);
		expect(result[0].sourcePlugin).toBe("youtube");
		expect(result[0].title).toBe("テスト動画");
		expect(result[0].url).toBe("https://www.youtube.com/watch?v=abc123");
		expect(result[0].publishedAt).toBe("2026-01-15T10:00:00Z");
		expect(result[1].url).toBe("https://www.youtube.com/watch?v=def456");
	});

	it("videoId がないアイテムは除外する", async () => {
		mockReadConfig.mockReturnValue({
			externalApis: { youtube: "test-api-key" },
		} as never);

		const mockResponse = {
			items: [
				{ id: {}, snippet: { title: "ID なし" } },
				{
					id: { videoId: "valid123" },
					snippet: { title: "有効な動画" },
				},
			],
		};

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockResponse),
		});

		const plugin = createYouTubePlugin();
		const result = await plugin.collect(testOshi);

		expect(result).toHaveLength(1);
		expect(result[0].title).toBe("有効な動画");
	});

	it("HTTP エラー時は空配列を返す", async () => {
		mockReadConfig.mockReturnValue({
			externalApis: { youtube: "test-api-key" },
		} as never);

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 403,
			text: () => Promise.resolve("Forbidden"),
		});

		const plugin = createYouTubePlugin();
		const result = await plugin.collect(testOshi);

		expect(result).toEqual([]);
	});

	it("ネットワークエラー時は空配列を返す", async () => {
		mockReadConfig.mockReturnValue({
			externalApis: { youtube: "test-api-key" },
		} as never);

		globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

		const plugin = createYouTubePlugin();
		const result = await plugin.collect(testOshi);

		expect(result).toEqual([]);
	});

	it("maxItems オプションが API に渡される", async () => {
		mockReadConfig.mockReturnValue({
			externalApis: { youtube: "test-api-key" },
		} as never);

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ items: [] }),
		});

		const plugin = createYouTubePlugin();
		await plugin.collect(testOshi, { maxItems: 3 });

		const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
		const url = fetchCall[0] as string;
		expect(url).toContain("maxResults=3");
	});
});

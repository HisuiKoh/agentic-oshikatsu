import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginOshiContext } from "@/infrastructure/plugins/base.js";
import { createWikipediaPlugin } from "@/infrastructure/plugins/wikipedia.js";

const testOshi: PluginOshiContext = {
	id: "test-oshi-1",
	name: "テスト推し",
	category: "vtuber",
	attributes: [],
};

describe("Wikipedia プラグイン", () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("プラグイン ID と名前が正しい", () => {
		const plugin = createWikipediaPlugin();
		expect(plugin.id).toBe("wikipedia");
		expect(plugin.name).toBe("Wikipedia");
		expect(plugin.supportedCategories).toBe("*");
	});

	it("canHandle は常に true を返す", () => {
		const plugin = createWikipediaPlugin();
		expect(plugin.canHandle(testOshi)).toBe(true);
	});

	it("タイトル完全一致で記事を取得できる", async () => {
		const mockResponse = {
			query: {
				pages: {
					"12345": {
						pageid: 12345,
						title: "テスト推し",
						extract: "テスト推しは日本のVTuberである。",
					},
				},
			},
		};

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockResponse),
		});

		const plugin = createWikipediaPlugin();
		const result = await plugin.collect(testOshi);

		expect(result).toHaveLength(1);
		expect(result[0].sourcePlugin).toBe("wikipedia");
		expect(result[0].title).toBe("テスト推し");
		expect(result[0].url).toContain("ja.wikipedia.org/wiki/");
		const rawContent = result[0].rawContent as { pageid: number; extract: string };
		expect(rawContent.pageid).toBe(12345);
		expect(rawContent.extract).toBe("テスト推しは日本のVTuberである。");
	});

	it("記事が存在しない場合は空配列を返す", async () => {
		const mockResponse = {
			query: {
				pages: {
					"-1": {
						title: "存在しない記事",
						missing: "",
					},
				},
			},
		};

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockResponse),
		});

		const plugin = createWikipediaPlugin();
		const result = await plugin.collect(testOshi);

		expect(result).toEqual([]);
	});

	it("API URL にタイトルが含まれる", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ query: { pages: {} } }),
		});

		const plugin = createWikipediaPlugin();
		await plugin.collect(testOshi);

		const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
		const url = fetchCall[0] as string;
		expect(url).toContain("titles=");
		expect(url).toContain(encodeURIComponent("テスト推し"));
	});

	it("言語オプションが URL に反映される", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ query: { pages: {} } }),
		});

		const plugin = createWikipediaPlugin();
		await plugin.collect(testOshi, { language: "en" });

		const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
		const url = fetchCall[0] as string;
		expect(url).toContain("en.wikipedia.org");
	});

	it("デフォルト言語は ja", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ query: { pages: {} } }),
		});

		const plugin = createWikipediaPlugin();
		await plugin.collect(testOshi);

		const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
		const url = fetchCall[0] as string;
		expect(url).toContain("ja.wikipedia.org");
	});

	it("HTTP エラー時は空配列を返す", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
			statusText: "Internal Server Error",
		});

		const plugin = createWikipediaPlugin();
		const result = await plugin.collect(testOshi);

		expect(result).toEqual([]);
	});

	it("ネットワークエラー時は空配列を返す", async () => {
		globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

		const plugin = createWikipediaPlugin();
		const result = await plugin.collect(testOshi);

		expect(result).toEqual([]);
	});

	it("記事 URL のスペースがアンダースコアに変換される", async () => {
		const mockResponse = {
			query: {
				pages: {
					"11111": {
						pageid: 11111,
						title: "テスト 推し キャラ",
						extract: "テスト記事",
					},
				},
			},
		};

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockResponse),
		});

		const plugin = createWikipediaPlugin();
		const result = await plugin.collect(testOshi);

		expect(result[0].url).toContain(encodeURIComponent("テスト_推し_キャラ"));
	});

	it("タイトルにスラッシュが含まれる場合も正しい URL が生成される", async () => {
		const mockResponse = {
			query: {
				pages: {
					"22222": {
						pageid: 22222,
						title: "AC/DC",
						extract: "AC/DC はオーストラリアのロックバンド。",
					},
				},
			},
		};

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockResponse),
		});

		const plugin = createWikipediaPlugin();
		const result = await plugin.collect(testOshi);

		expect(result[0].url).toBe("https://ja.wikipedia.org/wiki/AC/DC");
	});

	it("extract が長い場合は切り詰められる", async () => {
		const longExtract = "あ".repeat(2000);
		const mockResponse = {
			query: {
				pages: {
					"33333": {
						pageid: 33333,
						title: "テスト推し",
						extract: longExtract,
					},
				},
			},
		};

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockResponse),
		});

		const plugin = createWikipediaPlugin();
		const result = await plugin.collect(testOshi);

		const rawContent = result[0].rawContent as { extract: string };
		expect(rawContent.extract.length).toBeLessThanOrEqual(1501); // 1500 + "…"
		expect(rawContent.extract).toMatch(/…$/);
	});
});

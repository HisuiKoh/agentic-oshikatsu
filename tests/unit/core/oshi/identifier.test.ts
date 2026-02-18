import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isRelevantCandidate, searchCandidates } from "@/core/oshi/identifier.js";

// DuckDuckGo モジュールをモック
vi.mock("@/infrastructure/search/duckduckgo.js", () => ({
	searchWeb: vi.fn().mockResolvedValue([]),
}));

import { searchWeb } from "@/infrastructure/search/duckduckgo.js";

const mockedSearchWeb = vi.mocked(searchWeb);

describe("isRelevantCandidate", () => {
	it("title に検索名が含まれていれば関連あり", () => {
		expect(
			isRelevantCandidate(
				{ title: "星街すいせい", extract: "ホロライブ所属のVTuber。" },
				"星街すいせい",
			),
		).toBe(true);
	});

	it("extract に検索名が含まれていれば関連あり", () => {
		expect(
			isRelevantCandidate(
				{ title: "ホロライブ", extract: "星街すいせいはホロライブ所属のVTuber。" },
				"星街すいせい",
			),
		).toBe(true);
	});

	it("検索名が title を包含していれば関連あり", () => {
		expect(
			isRelevantCandidate(
				{ title: "杵月のあ", extract: "VTuberです。" },
				"杵月のあ ch",
			),
		).toBe(true);
	});

	it("title にも extract にも検索名が含まれなければ関連なし", () => {
		expect(
			isRelevantCandidate(
				{ title: "餅", extract: "餅（もち）は、日本の伝統的な食品である。もち米を蒸して杵（きね）で搗いた食品。" },
				"杵月のあ",
			),
		).toBe(false);
	});

	it("部分一致する漢字だけでは関連なし（杵月のあ → ニニギ/瓊瓊杵尊）", () => {
		expect(
			isRelevantCandidate(
				{ title: "ニニギ", extract: "ニニギ（瓊瓊杵尊）は日本神話の神である。" },
				"杵月のあ",
			),
		).toBe(false);
	});

	it("空の検索名は関連なし", () => {
		expect(
			isRelevantCandidate(
				{ title: "何か", extract: "何かの説明" },
				"",
			),
		).toBe(false);
	});

	it("title が短すぎる場合は包含判定しない（1文字）", () => {
		expect(
			isRelevantCandidate(
				{ title: "杵", extract: "杵に関する記事" },
				"杵月のあ",
			),
		).toBe(false);
	});
});

describe("searchCandidates", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("DuckDuckGo で候補が見つかる場合", async () => {
		mockedSearchWeb.mockResolvedValueOnce([
			{ title: "杵月のあ - YouTube", url: "https://youtube.com/@kinetsukinoa", snippet: "VTuber 杵月のあ" },
		]);

		const results = await searchCandidates("杵月のあ");

		expect(results).toHaveLength(1);
		expect(results[0].source).toBe("web");
		expect(results[0].title).toBe("杵月のあ - YouTube");
		expect(results[0].extract).toBe("VTuber 杵月のあ");
		// 内部で3倍取得してフィルタ後に絞る
		expect(mockedSearchWeb).toHaveBeenCalledWith("杵月のあ", { maxResults: 15 });
	});

	it("DuckDuckGo で 0 件 → 空配列", async () => {
		mockedSearchWeb.mockResolvedValueOnce([]);

		const results = await searchCandidates("完全に架空の名前12345");

		expect(results).toEqual([]);
	});

	it("DuckDuckGo エラー時 → 空配列", async () => {
		mockedSearchWeb.mockRejectedValueOnce(new Error("Network error"));

		const results = await searchCandidates("テスト");

		expect(results).toEqual([]);
	});

	it("snippet が空の結果は除外される", async () => {
		mockedSearchWeb.mockResolvedValueOnce([
			{ title: "テストの結果", url: "https://example.com/1", snippet: "テストに関する情報" },
			{ title: "空", url: "https://example.com/2", snippet: "" },
		]);

		const results = await searchCandidates("テスト");

		expect(results).toHaveLength(1);
		expect(results[0].title).toBe("テストの結果");
	});

	it("複数候補が返される場合、順序を保って返す", async () => {
		mockedSearchWeb.mockResolvedValueOnce([
			{ title: "杵月のあ - YouTube", url: "https://youtube.com/@kinetsukinoa", snippet: "VTuber 杵月のあのチャンネル" },
			{ title: "杵月のあ - X", url: "https://x.com/kinetsukinoa", snippet: "杵月のあのXアカウント" },
		]);

		const results = await searchCandidates("杵月のあ");

		expect(results).toHaveLength(2);
		expect(results[0].title).toBe("杵月のあ - YouTube");
		expect(results[1].title).toBe("杵月のあ - X");
	});

	it("maxResults オプションが searchWeb に 3 倍で渡される", async () => {
		mockedSearchWeb.mockResolvedValueOnce([]);

		await searchCandidates("テスト", { maxResults: 3 });

		expect(mockedSearchWeb).toHaveBeenCalledWith("テスト", { maxResults: 9 });
	});

	it("低品質ドメイン（EC サイト等）が除外される", async () => {
		mockedSearchWeb.mockResolvedValueOnce([
			{ title: "杵月のあ - Wikipedia", url: "https://ja.wikipedia.org/wiki/杵月のあ", snippet: "杵月のあは VTuber" },
			{ title: "杵月のあ グッズ", url: "https://www.amazon.co.jp/dp/xxx", snippet: "杵月のあのグッズ" },
			{ title: "杵月のあ 関連商品", url: "https://item.rakuten.co.jp/xxx", snippet: "杵月のあ関連商品" },
		]);

		const results = await searchCandidates("杵月のあ");

		expect(results).toHaveLength(1);
		expect(results[0].url).toContain("wikipedia");
	});

	it("広告的なスニペットが除外される", async () => {
		mockedSearchWeb.mockResolvedValueOnce([
			{ title: "杵月のあ 公式", url: "https://example.com/noa", snippet: "杵月のあの公式サイト" },
			{ title: "杵月のあ ショップ", url: "https://example.com/shop", snippet: "送料無料 ポイント10倍 セール中 杵月のあグッズ" },
		]);

		const results = await searchCandidates("杵月のあ");

		expect(results).toHaveLength(1);
		expect(results[0].title).toBe("杵月のあ 公式");
	});

	it("関連性のない結果が除外される", async () => {
		mockedSearchWeb.mockResolvedValueOnce([
			{ title: "杵月のあ - YouTube", url: "https://youtube.com/@kinetsukinoa", snippet: "VTuber 杵月のあ" },
			{ title: "全く無関係な記事", url: "https://example.com/unrelated", snippet: "全く無関係な内容" },
		]);

		const results = await searchCandidates("杵月のあ");

		expect(results).toHaveLength(1);
		expect(results[0].title).toBe("杵月のあ - YouTube");
	});
});

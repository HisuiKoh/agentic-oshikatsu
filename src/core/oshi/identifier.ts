import { searchWeb } from "../../infrastructure/search/duckduckgo.js";
import { logger } from "../../shared/logger.js";

/** 推し候補の情報 */
export interface OshiCandidate {
	source: "web" | "ai";
	title: string;
	/** 説明テキスト（検索スニペット） */
	snippet: string;
	/** 詳細本文（snippet と同じ） */
	extract: string;
	url: string;
}

const DEFAULT_MAX_RESULTS = 5;

/**
 * 推し情報として信頼性が低いドメインパターン。
 * EC サイト・広告・比較サイト・クーポン系など、
 * 検索結果に紛れやすいが推しの情報源として不適切なもの。
 */
const LOW_QUALITY_DOMAIN_PATTERNS = [
	// EC・ショッピング
	/amazon\.(co\.jp|com)/,
	/rakuten\.co\.jp/,
	/shopping\.yahoo\.co\.jp/,
	/mercari\.com/,
	/suruga-ya\.jp/,
	/auctions\.yahoo\.co\.jp/,
	/booth\.pm/,
	// 広告・アフィリエイト・比較サイト
	/a8\.net/,
	/valuecommerce/,
	/ad\./,
	/click\./,
	/track\./,
	/affiliate/,
	// 求人・転職
	/indeed/,
	/doda/,
	/mynavi\.jp/,
	/rikunabi/,
	// クーポン・ポイント
	/coupon/,
	/point-site/,
];

/** URL が低品質ドメインに該当するか判定 */
function isLowQualityUrl(url: string): boolean {
	try {
		const hostname = new URL(url).hostname.toLowerCase();
		return LOW_QUALITY_DOMAIN_PATTERNS.some((pattern) => pattern.test(hostname));
	} catch {
		return false;
	}
}

/**
 * スニペットが広告・宣伝的な内容かを判定。
 * 典型的な広告文句パターンに複数マッチした場合に広告とみなす。
 */
const AD_LIKE_PHRASES = [
	/送料無料/,
	/ポイント\d+倍/,
	/最安値/,
	/クーポン/,
	/セール中/,
	/今なら\d+%/,
	/お買い得/,
	/期間限定/,
	/公式サイトはこちら/,
	/今すぐ(購入|申込|登録)/,
	/無料(体験|登録|お試し)/,
];

function isAdLikeSnippet(snippet: string): boolean {
	const matchCount = AD_LIKE_PHRASES.filter((p) => p.test(snippet)).length;
	return matchCount >= 2;
}

/**
 * 候補が検索名と関連しているかを判定する。
 * title または extract に検索名（の主要部分）が含まれていれば関連ありとみなす。
 */
export function isRelevantCandidate(
	candidate: { title: string; extract: string },
	searchName: string,
): boolean {
	const name = searchName.trim();
	if (!name) return false;

	const titleLower = candidate.title.toLowerCase();
	const extractLower = candidate.extract.toLowerCase();
	const nameLower = name.toLowerCase();

	// 完全一致（検索名が title/extract に含まれる）
	if (titleLower.includes(nameLower) || extractLower.includes(nameLower)) {
		return true;
	}

	// title が検索名に含まれる（例: 検索名「杵月のあ ch」→ title「杵月のあ」）
	// ASCII のみの短い title（"Go", "AI" 等）の誤通過を防ぐため、最小長を分ける
	const isAsciiOnly = /^[a-z0-9\s]+$/.test(titleLower);
	const minLength = isAsciiOnly ? 4 : 2;
	if (nameLower.includes(titleLower) && titleLower.length >= minLength) {
		return true;
	}

	return false;
}

/** Web 検索で推し候補を探す */
export async function searchCandidates(
	name: string,
	options?: { maxResults?: number },
): Promise<OshiCandidate[]> {
	const maxResults = options?.maxResults ?? DEFAULT_MAX_RESULTS;
	return searchWeb_(name, maxResults);
}

/** DuckDuckGo で Web 検索し OshiCandidate に変換（広告・低品質サイトをフィルタ） */
async function searchWeb_(name: string, maxResults: number): Promise<OshiCandidate[]> {
	try {
		// フィルタで減ることを見込んで多めに取得
		const fetchCount = maxResults * 3;
		const webResults = await searchWeb(name, { maxResults: fetchCount });
		return webResults
			.filter((r) => {
				if (!r.snippet) return false;
				if (isLowQualityUrl(r.url)) {
					logger.debug(`低品質ドメインを除外: ${r.url}`);
					return false;
				}
				if (isAdLikeSnippet(r.snippet)) {
					logger.debug(`広告的スニペットを除外: ${r.title}`);
					return false;
				}
				if (!isRelevantCandidate({ title: r.title, extract: r.snippet }, name)) {
					logger.debug(`関連性なしとして除外: ${r.title}`);
					return false;
				}
				return true;
			})
			.slice(0, maxResults)
			.map((r) => ({
				source: "web" as const,
				title: r.title,
				snippet: r.snippet,
				extract: r.snippet,
				url: r.url,
			}));
	} catch (error) {
		logger.warn(`Web 検索エラー: ${error instanceof Error ? error.message : "unknown error"}`);
		return [];
	}
}

import type { CollectOptions, RawCollectedInfo } from "../../core/info-collection/types.js";
import { logger } from "../../shared/logger.js";
import { readConfig } from "../config/manager.js";
import type { InfoCollectorPlugin, PluginOshiContext } from "./base.js";

const DEFAULT_MAX_ITEMS = 10;
const FETCH_TIMEOUT_MS = 15_000;
const X_API_BASE = "https://api.x.com/2";

/** X API v2 のツイートデータ */
interface XTweet {
	id: string;
	text: string;
	created_at?: string;
	author_id?: string;
	public_metrics?: {
		retweet_count?: number;
		reply_count?: number;
		like_count?: number;
		quote_count?: number;
	};
}

/** X API v2 の検索レスポンス */
interface XSearchResponse {
	data?: XTweet[];
	errors?: Array<{ message: string }>;
	meta?: {
		result_count?: number;
		newest_id?: string;
		oldest_id?: string;
	};
}

/** config から X API Bearer Token を取得 */
function getBearerToken(): string | undefined {
	try {
		const config = readConfig();
		return config.externalApis.x;
	} catch {
		return undefined;
	}
}

/** X API 検索クエリのエスケープ（ダブルクォートで囲みオペレータを無効化） */
function escapeQuery(query: string): string {
	return `"${query.replace(/"/g, "")}"`;
}

/** 検索 URL を構築 */
function buildSearchUrl(query: string, maxResults: number): string {
	const params = new URLSearchParams({
		query: escapeQuery(query),
		max_results: String(Math.max(10, Math.min(maxResults, 100))),
		"tweet.fields": "created_at,author_id,public_metrics",
	});
	return `${X_API_BASE}/tweets/search/recent?${params.toString()}`;
}

/** ツイート URL を構築 */
function buildTweetUrl(_authorId: string, tweetId: string): string {
	return `https://x.com/i/status/${tweetId}`;
}

/** ツイート本文からタイトルを生成（先頭80文字） */
function generateTitle(text: string): string {
	const cleaned = text.replace(/\n/g, " ").trim();
	if (cleaned.length <= 80) return cleaned;
	return `${cleaned.slice(0, 77)}...`;
}

export function createXApiPlugin(): InfoCollectorPlugin {
	return {
		id: "x",
		name: "X (Twitter)",
		supportedCategories: "*",

		canHandle(_oshi: PluginOshiContext): boolean {
			return getBearerToken() !== undefined;
		},

		async collect(oshi: PluginOshiContext, options?: CollectOptions): Promise<RawCollectedInfo[]> {
			const token = getBearerToken();
			if (!token) {
				logger.warn(
					"X API Bearer Token が設定されていません。`config.externalApis.x` を確認してください。",
				);
				return [];
			}

			const maxItems = options?.maxItems ?? DEFAULT_MAX_ITEMS;
			const url = buildSearchUrl(oshi.name, maxItems);
			logger.debug(`X API を呼び出し: ${oshi.name}`);

			let data: XSearchResponse;
			try {
				const response = await fetch(url, {
					signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
					headers: {
						Authorization: `Bearer ${token}`,
						"User-Agent": "agentic-oshikatsu/0.1.0",
					},
				});
				if (!response.ok) {
					const errorText = await response.text().catch(() => "");
					throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 200)}`);
				}
				data = (await response.json()) as XSearchResponse;
			} catch (error) {
				logger.warn(
					`X API の取得に失敗: ${error instanceof Error ? error.message : "unknown error"}`,
				);
				return [];
			}

			// API レベルのエラーレスポンスを検出（HTTP 200 でも errors が返る場合）
			if (data.errors && data.errors.length > 0) {
				const errMsg = data.errors.map((e) => e.message).join(", ");
				logger.warn(`X API がエラーを返しました: ${errMsg}`);
				return [];
			}

			const tweets = data.data ?? [];

			return tweets.map((tweet) => ({
				sourcePlugin: "x",
				title: generateTitle(tweet.text),
				url: buildTweetUrl(tweet.author_id ?? "unknown", tweet.id),
				rawContent: {
					text: tweet.text,
					authorId: tweet.author_id ?? "",
					metrics: tweet.public_metrics ?? {},
				},
				publishedAt: tweet.created_at ?? undefined,
			}));
		},
	};
}

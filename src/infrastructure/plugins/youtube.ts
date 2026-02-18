import type { CollectOptions, RawCollectedInfo } from "../../core/info-collection/types.js";
import { logger } from "../../shared/logger.js";
import { readConfig } from "../config/manager.js";
import type { InfoCollectorPlugin, PluginOshiContext } from "./base.js";

const DEFAULT_MAX_ITEMS = 5;
const FETCH_TIMEOUT_MS = 15_000;
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

/** YouTube Data API v3 の検索結果アイテム */
interface YouTubeSearchItem {
	id?: { videoId?: string };
	snippet?: {
		title?: string;
		publishedAt?: string;
		description?: string;
		channelTitle?: string;
		thumbnails?: {
			default?: { url?: string };
			medium?: { url?: string };
		};
	};
}

/** YouTube Data API v3 の検索レスポンス */
interface YouTubeSearchResponse {
	items?: YouTubeSearchItem[];
	pageInfo?: { totalResults?: number };
}

/** config から YouTube API Key を取得 */
function getApiKey(): string | undefined {
	try {
		const config = readConfig();
		return config.externalApis.youtube;
	} catch {
		return undefined;
	}
}

/** YouTube 検索 URL を構築 */
function buildSearchUrl(query: string, apiKey: string, maxResults: number): string {
	const params = new URLSearchParams({
		part: "snippet",
		q: query,
		type: "video",
		maxResults: String(maxResults),
		order: "date",
		key: apiKey,
	});
	return `${YOUTUBE_API_BASE}/search?${params.toString()}`;
}

export function createYouTubePlugin(): InfoCollectorPlugin {
	return {
		id: "youtube",
		name: "YouTube",
		supportedCategories: "*",

		canHandle(_oshi: PluginOshiContext): boolean {
			return getApiKey() !== undefined;
		},

		async collect(oshi: PluginOshiContext, options?: CollectOptions): Promise<RawCollectedInfo[]> {
			const apiKey = getApiKey();
			if (!apiKey) {
				logger.warn(
					"YouTube API Key が設定されていません。`config.externalApis.youtube` を確認してください。",
				);
				return [];
			}

			const maxItems = options?.maxItems ?? DEFAULT_MAX_ITEMS;
			const url = buildSearchUrl(oshi.name, apiKey, maxItems);
			logger.debug(`YouTube API を呼び出し: ${oshi.name}`);

			let data: YouTubeSearchResponse;
			try {
				const response = await fetch(url, {
					signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
					headers: {
						"User-Agent": "agentic-oshikatsu/0.1.0",
					},
				});
				if (!response.ok) {
					const errorText = await response.text().catch(() => "");
					throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 200)}`);
				}
				data = (await response.json()) as YouTubeSearchResponse;
			} catch (error) {
				logger.warn(
					`YouTube の取得に失敗: ${error instanceof Error ? error.message : "unknown error"}`,
				);
				return [];
			}

			const items = data.items ?? [];

			return items
				.filter((item) => item.id?.videoId)
				.map((item) => ({
					sourcePlugin: "youtube",
					title: item.snippet?.title ?? "（タイトルなし）",
					url: `https://www.youtube.com/watch?v=${item.id?.videoId}`,
					rawContent: {
						description: item.snippet?.description ?? "",
						channelTitle: item.snippet?.channelTitle ?? "",
						thumbnail:
							item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? "",
					},
					publishedAt: item.snippet?.publishedAt ?? undefined,
				}));
		},
	};
}

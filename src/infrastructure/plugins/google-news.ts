import { XMLParser } from "fast-xml-parser";
import type { CollectOptions, RawCollectedInfo } from "../../core/info-collection/types.js";
import { logger } from "../../shared/logger.js";
import type { InfoCollectorPlugin, PluginOshiContext } from "./base.js";

const DEFAULT_MAX_ITEMS = 10;
const FETCH_TIMEOUT_MS = 15_000;

/** Google News RSS のアイテム構造 */
interface RssItem {
	title?: string;
	link?: string;
	pubDate?: string;
	description?: string;
	source?: string | { "#text"?: string };
}

/** RSS フィードをパース */
function parseRss(xml: string): RssItem[] {
	const parser = new XMLParser({
		ignoreAttributes: false,
		attributeNamePrefix: "@_",
	});
	const parsed = parser.parse(xml);

	const channel = parsed?.rss?.channel;
	if (!channel) return [];

	const items = channel.item;
	if (!items) return [];

	return Array.isArray(items) ? items : [items];
}

/** Google News RSS の URL を構築 */
function buildGoogleNewsUrl(query: string, language: string): string {
	const encoded = encodeURIComponent(query);
	return `https://news.google.com/rss/search?q=${encoded}&hl=${language}&gl=JP&ceid=JP:${language}`;
}

/** 推しの属性を使って検索クエリを拡張 */
function buildSearchQuery(oshi: PluginOshiContext): string {
	const parts = [oshi.name];

	const enrichKeys = ["group", "affiliation", "agency", "series", "team", "band_name"];
	if (oshi.attributes) {
		for (const attr of oshi.attributes) {
			if (enrichKeys.includes(attr.key) && attr.value) {
				parts.push(attr.value);
				break;
			}
		}
	}

	return parts.join(" ");
}

export function createGoogleNewsPlugin(): InfoCollectorPlugin {
	return {
		id: "google-news",
		name: "Google News",
		supportedCategories: "*",

		canHandle(_oshi: PluginOshiContext): boolean {
			return true;
		},

		async collect(oshi: PluginOshiContext, options?: CollectOptions): Promise<RawCollectedInfo[]> {
			const maxItems = options?.maxItems ?? DEFAULT_MAX_ITEMS;
			const language = options?.language ?? "ja";

			const enrichedQuery = buildSearchQuery(oshi);
			const url = buildGoogleNewsUrl(enrichedQuery, language);
			logger.debug(`Google News RSS を取得: ${url}`);

			let xml: string;
			try {
				const response = await fetch(url, {
					signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
					headers: {
						"User-Agent": "agentic-oshikatsu/0.1.0",
					},
				});
				if (!response.ok) {
					throw new Error(`HTTP ${response.status}: ${response.statusText}`);
				}
				xml = await response.text();
			} catch (error) {
				logger.warn(
					`Google News の取得に失敗: ${error instanceof Error ? error.message : "unknown error"}`,
				);
				return [];
			}

			let items = parseRss(xml);

			// 属性付きクエリで結果 0 件の場合、名前のみで再検索
			if (items.length === 0 && enrichedQuery !== oshi.name) {
				logger.debug("属性付きクエリで結果なし。名前のみで再検索します");
				const fallbackUrl = buildGoogleNewsUrl(oshi.name, language);
				try {
					const fallbackResponse = await fetch(fallbackUrl, {
						signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
						headers: { "User-Agent": "agentic-oshikatsu/0.1.0" },
					});
					if (fallbackResponse.ok) {
						items = parseRss(await fallbackResponse.text());
					}
				} catch (error) {
					logger.warn(
						`Google News フォールバック検索の取得に失敗: ${error instanceof Error ? error.message : "unknown error"}`,
					);
				}
			}

			return items.slice(0, maxItems).map((item) => ({
				sourcePlugin: "google-news",
				title: item.title ?? "（タイトルなし）",
				url: item.link ?? "",
				rawContent: {
					description: item.description ?? "",
					source: typeof item.source === "string" ? item.source : (item.source?.["#text"] ?? ""),
				},
				publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : undefined,
			}));
		},
	};
}

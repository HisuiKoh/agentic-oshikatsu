import type { CollectOptions, RawCollectedInfo } from "../../core/info-collection/types.js";
import { logger } from "../../shared/logger.js";
import type { InfoCollectorPlugin, PluginOshiContext } from "./base.js";

export const FETCH_TIMEOUT_MS = 15_000;

/** MediaWiki titles API のレスポンス（ページ情報 + extract） */
export interface WikiPagesResponse {
	query?: {
		pages?: Record<
			string,
			{
				pageid?: number;
				title: string;
				missing?: string | boolean;
				extract?: string;
			}
		>;
	};
}

const LANGUAGE_CODE_PATTERN = /^[a-z]{2,3}(-[a-z]+)?$/;

/** 言語コードから Wikipedia のベース URL を取得 */
function getWikiBaseUrl(language: string): string {
	if (!LANGUAGE_CODE_PATTERN.test(language)) {
		throw new Error(`無効な言語コード: ${language}`);
	}
	return `https://${language}.wikipedia.org`;
}

/** タイトル完全一致で記事を取得する URL を構築 */
export function buildTitlesUrl(titles: string[], language: string): string {
	const base = getWikiBaseUrl(language);
	// | は MediaWiki の区切り文字のため除去
	const sanitizedTitles = titles.map((t) => t.replace(/\|/g, " "));
	const params = new URLSearchParams({
		action: "query",
		titles: sanitizedTitles.join("|"),
		prop: "extracts",
		exintro: "1",
		explaintext: "1",
		format: "json",
		origin: "*",
	});
	return `${base}/w/api.php?${params.toString()}`;
}

/** 記事 URL を構築 */
export function buildArticleUrl(title: string, language: string): string {
	const base = getWikiBaseUrl(language);
	// スペースをアンダースコアに変換後、スラッシュを保持してセグメント単位でエンコード
	const normalized = title.replace(/ /g, "_");
	const encoded = normalized
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/");
	return `${base}/wiki/${encoded}`;
}

/** HTML タグを除去（snippet のクリーンアップ用） */
export function stripHtml(html: string): string {
	return html.replace(/<[^>]*>/g, "");
}

const EXTRACT_MAX_CHARS = 1500;

export function createWikipediaPlugin(): InfoCollectorPlugin {
	return {
		id: "wikipedia",
		name: "Wikipedia",
		supportedCategories: "*",

		canHandle(_oshi: PluginOshiContext): boolean {
			return true;
		},

		async collect(oshi: PluginOshiContext, options?: CollectOptions): Promise<RawCollectedInfo[]> {
			const language = options?.language ?? "ja";

			// 推し名のタイトル完全一致で記事を直接取得
			const url = buildTitlesUrl([oshi.name], language);
			logger.debug(`Wikipedia API を呼び出し（タイトル完全一致）: ${oshi.name} (${language})`);

			let data: WikiPagesResponse;
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
				data = (await response.json()) as WikiPagesResponse;
			} catch (error) {
				logger.warn(
					`Wikipedia の取得に失敗: ${error instanceof Error ? error.message : "unknown error"}`,
				);
				return [];
			}

			const pages = data.query?.pages;
			if (!pages) return [];

			const results: RawCollectedInfo[] = [];
			for (const page of Object.values(pages)) {
				// missing が存在するページ（記事なし）はスキップ（API は "" や true を返す）
				if (page.missing !== undefined || !page.pageid) continue;

				const extract = page.extract
					? page.extract.length > EXTRACT_MAX_CHARS
						? `${page.extract.slice(0, EXTRACT_MAX_CHARS)}…`
						: page.extract
					: "";

				results.push({
					sourcePlugin: "wikipedia",
					title: page.title,
					url: buildArticleUrl(page.title, language),
					rawContent: {
						pageid: page.pageid,
						extract,
					},
				});
			}

			return results;
		},
	};
}

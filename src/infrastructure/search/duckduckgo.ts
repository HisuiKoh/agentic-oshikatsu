import { logger } from "../../shared/logger.js";

const FETCH_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RESULTS = 5;
const DUCKDUCKGO_LITE_URL = "https://html.duckduckgo.com/html/";

export interface WebSearchResult {
	title: string;
	url: string;
	snippet: string;
}

/** URL が http(s) スキームか検証 */
function sanitizeUrl(raw: string): string | null {
	try {
		const u = new URL(raw);
		if (u.protocol !== "https:" && u.protocol !== "http:") return null;
		return u.href;
	} catch {
		return null;
	}
}

/** DuckDuckGo HTML Lite で結果ブロック単位でパース */
function parseResults(html: string, maxResults: number): WebSearchResult[] {
	const results: WebSearchResult[] = [];

	// 結果ブロック（<div class="result ...">...</div>）を個別に処理
	const blockPattern =
		/<div\s+class="[^"]*result\s[^"]*"[^>]*>([\s\S]*?)(?=<div\s+class="[^"]*result\s|$)/g;
	const linkPattern = /<a\s[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/;
	const snippetPattern = /<a\s[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/;

	let blockMatch = blockPattern.exec(html);
	while (blockMatch && results.length < maxResults) {
		const block = blockMatch[1];
		const linkMatch = linkPattern.exec(block);
		if (linkMatch) {
			const url = sanitizeUrl(linkMatch[1]);
			const title = stripTags(linkMatch[2]).trim();
			if (url && title) {
				const snippetMatch = snippetPattern.exec(block);
				results.push({
					title,
					url,
					snippet: snippetMatch ? stripTags(snippetMatch[1]).trim() : "",
				});
			}
		}
		blockMatch = blockPattern.exec(html);
	}

	return results;
}

/** HTML タグを除去 */
function stripTags(html: string): string {
	return html
		.replace(/<[^>]*>/g, "")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#x27;/g, "'");
}

/** DuckDuckGo で Web 検索し、結果を返す */
export async function searchWeb(
	query: string,
	options?: { maxResults?: number },
): Promise<WebSearchResult[]> {
	const maxResults = options?.maxResults ?? DEFAULT_MAX_RESULTS;

	try {
		const body = new URLSearchParams({ q: query });
		const response = await fetch(DUCKDUCKGO_LITE_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				"User-Agent": "agentic-oshikatsu/0.1.0",
			},
			body: body.toString(),
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});

		if (!response.ok) {
			logger.warn(`DuckDuckGo 検索失敗: HTTP ${response.status}`);
			return [];
		}

		const html = await response.text();
		return parseResults(html, maxResults);
	} catch (error) {
		logger.warn(
			`DuckDuckGo 検索エラー: ${error instanceof Error ? error.message : "unknown error"}`,
		);
		return [];
	}
}

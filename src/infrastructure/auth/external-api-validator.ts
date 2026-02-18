import type { ExternalApiType } from "./types.js";

/** 外部 API トークンの疎通確認結果 */
export interface ExternalApiValidationResult {
	ok: boolean;
	message: string;
}

/** 外部 API トークンの疎通確認 */
export async function validateExternalApiToken(
	api: ExternalApiType,
	token: string,
): Promise<ExternalApiValidationResult> {
	try {
		if (api === "youtube") {
			// ヘッダーで API Key を送信（URL クエリパラメータへの漏洩を防止）
			const res = await fetch(
				"https://www.googleapis.com/youtube/v3/videos?part=id&chart=mostPopular&maxResults=1",
				{
					headers: { "X-Goog-Api-Key": token },
					signal: AbortSignal.timeout(10000),
				},
			);
			// 200 or 400（パラメータエラー）= Key 有効、403 = Key 無効
			if (res.status === 200 || res.status === 400) {
				return { ok: true, message: "YouTube API Key は有効です" };
			}
			return {
				ok: false,
				message: `YouTube API Key が無効です (HTTP ${res.status})`,
			};
		}

		// X (Twitter)
		const res = await fetch(
			"https://api.twitter.com/2/tweets/search/recent?query=test&max_results=10",
			{
				headers: { Authorization: `Bearer ${token}` },
				signal: AbortSignal.timeout(10000),
			},
		);
		// 200 = Token 有効、401/403 = Token 無効
		if (res.status === 200) {
			return { ok: true, message: "X Bearer Token は有効です" };
		}
		return {
			ok: false,
			message: `X Bearer Token が無効です (HTTP ${res.status})`,
		};
	} catch {
		// エラーメッセージにトークンを含む URL が含まれる可能性があるため、汎用メッセージのみ返す
		return {
			ok: false,
			message: "接続エラー: ネットワークに接続できません。インターネット接続を確認してください。",
		};
	}
}

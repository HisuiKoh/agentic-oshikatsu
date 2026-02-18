import { logger } from "../../shared/logger.js";
import { updateConfig } from "../config/manager.js";
import type { Config } from "../config/schema.js";
import { detectClaudeCredentials } from "./detector.js";

/** トークン期限切れ判定の余裕（5分） */
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

/**
 * DD-004: リクエスト駆動方式の OAuth トークンリフレッシュ。
 *
 * トークンが期限切れまたは 5 分以内に切れる場合:
 * - cli_detect: ~/.claude/.credentials.json から最新トークンを再読み込み
 *   （Claude CLI が自動リフレッシュした結果を取得）
 *
 * @returns リフレッシュされたアクセストークン。リフレッシュ不要またはリフレッシュ失敗時は null
 */
export function refreshOAuthTokenIfNeeded(
	claude: NonNullable<Config["providers"]["claude"]>,
): string | null {
	if (!claude.oauth) return null;

	const isExpiredOrSoon = claude.oauth.expiresAt * 1000 < Date.now() + EXPIRY_BUFFER_MS;
	if (!isExpiredOrSoon) return null;

	logger.debug("OAuth トークンが期限切れまたは間もなく期限切れ。リフレッシュを試行します");

	// cli_detect: Claude CLI の認証ファイルから最新トークンを再取得
	if (claude.authMethod === "cli_detect") {
		return refreshFromCliCredentials(claude.oauth.expiresAt);
	}

	logger.warn("OAuth トークンが期限切れです。`oshi auth` で再認証してください。");
	return null;
}

/**
 * ~/.claude/.credentials.json から最新の認証情報を再読み込みし、
 * 現在のトークンより新しければ config を更新して返す。
 */
function refreshFromCliCredentials(currentExpiresAt: number): string | null {
	const credentials = detectClaudeCredentials();

	if (!credentials) {
		logger.warn(
			"Claude CLI の認証情報が見つかりません。`claude` コマンドでログインしてから再試行してください。",
		);
		return null;
	}

	// 現在の config より新しいトークンの場合のみ更新
	if (credentials.expiresAt <= currentExpiresAt) {
		logger.warn(
			"Claude CLI の認証トークンも期限切れです。`claude` コマンドを実行してトークンをリフレッシュしてください。",
		);
		return null;
	}

	// config を更新
	updateConfig({
		providers: {
			claude: {
				authMethod: "cli_detect",
				oauth: {
					accessToken: credentials.accessToken,
					refreshToken: credentials.refreshToken,
					expiresAt: credentials.expiresAt,
				},
			},
		},
	});

	logger.debug("Claude CLI から最新の OAuth トークンを取得しました");
	return credentials.accessToken;
}

import { logger } from "../../shared/logger.js";
import { readConfig } from "../config/manager.js";

const FETCH_TIMEOUT_MS = 10_000;

/** Discord Embed の色定数 */
const COLORS = {
	green: 0x2ecc71,
	yellow: 0xf1c40f,
	red: 0xe74c3c,
	blue: 0x3498db,
} as const;

/** Discord Webhook 設定を取得 */
function getWebhookConfig(): { enabled: boolean; webhookUrl?: string } {
	try {
		const config = readConfig();
		return config.notifications.discord;
	} catch {
		return { enabled: false };
	}
}

/** Discord Webhook で通知を送信 */
export async function sendDiscordNotification(
	title: string,
	description: string,
	color: number = COLORS.blue,
): Promise<void> {
	const { enabled, webhookUrl } = getWebhookConfig();
	if (!enabled || !webhookUrl) return;

	try {
		const response = await fetch(webhookUrl, {
			method: "POST",
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				embeds: [
					{
						title,
						description,
						color,
						footer: { text: "agentic-oshikatsu" },
						timestamp: new Date().toISOString(),
					},
				],
			}),
		});
		if (!response.ok) {
			logger.warn(`Discord 通知の送信に失敗: HTTP ${response.status}`);
		}
	} catch (error) {
		logger.warn(
			`Discord 通知の送信に失敗: ${error instanceof Error ? error.message : "unknown error"}`,
		);
	}
}

/** 新着情報を通知 */
export async function notifyNewInfo(
	oshiName: string,
	newItemCount: number,
	pendingCount?: number,
): Promise<void> {
	if (newItemCount === 0) return;

	let description = `${newItemCount} 件の新しい情報が見つかりました。`;
	if (pendingCount && pendingCount > 0) {
		description += `\nうち ${pendingCount} 件は承認待ちです。\`oshi review ${oshiName}\` で確認してください。`;
	}

	await sendDiscordNotification(`${oshiName} の新着情報`, description, COLORS.blue);
}

/** Linter の WARN/BLOCK を通知 */
export async function notifyLintWarning(
	oshiName: string,
	action: string,
	verdict: "WARN" | "BLOCK",
	evaluations: Array<{ ruleId?: string; message: string }>,
): Promise<void> {
	const color = verdict === "BLOCK" ? COLORS.red : COLORS.yellow;
	const icon = verdict === "BLOCK" ? "🚫" : "⚠️";

	const evalLines = evaluations
		.slice(0, 5)
		.map((e) => `- ${e.message}`)
		.join("\n");
	const evalSummary =
		evaluations.length > 5 ? `${evalLines}\n...他 ${evaluations.length - 5} 件` : evalLines;

	await sendDiscordNotification(
		`${icon} ${oshiName}: ${verdict}`,
		`**行動**: ${action}\n\n**評価**:\n${evalSummary}`,
		color,
	);
}

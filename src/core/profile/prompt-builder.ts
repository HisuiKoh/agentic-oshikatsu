import type { UserProfile } from "./types.js";

/** プロファイルから AI 応答スタイルのシステムプロンプト修飾を生成 */
export function buildProfilePrompt(profile: UserProfile): string {
	const parts: string[] = [];

	// 口調の丁寧さ
	switch (profile.formality) {
		case "casual":
			parts.push("ユーザーにはカジュアルでフレンドリーな口調で話してください。敬語は不要です。");
			break;
		case "formal":
			parts.push("ユーザーには丁寧語・敬語を使い、フォーマルな口調で話してください。");
			break;
		default:
			parts.push("ユーザーには自然で親しみやすい丁寧語で話してください。");
			break;
	}

	// フィードバックスタイル
	switch (profile.feedbackStyle) {
		case "gentle":
			parts.push("フィードバックは優しく、励ましを含めてください。否定的な表現は避けてください。");
			break;
		case "strict":
			parts.push(
				"フィードバックは率直に、改善点を明確に指摘してください。遠回しな表現は不要です。",
			);
			break;
		default:
			parts.push("フィードバックはバランスよく、良い点と改善点の両方を伝えてください。");
			break;
	}

	// 詳細度
	switch (profile.detailLevel) {
		case "brief":
			parts.push("回答は簡潔にまとめてください。要点のみを伝えてください。");
			break;
		case "detailed":
			parts.push("回答は詳細に、背景や理由も含めて丁寧に説明してください。");
			break;
		default:
			break;
	}

	// 装飾
	switch (profile.decoration) {
		case "minimal":
			parts.push("絵文字や装飾は使わず、シンプルなテキストで回答してください。");
			break;
		case "rich":
			parts.push("適度に絵文字を使い、見やすく楽しい回答にしてください。");
			break;
		default:
			break;
	}

	// 推し活の温度感
	switch (profile.oshiIntensity) {
		case "casual":
			parts.push("推し活はライトに楽しむスタンスで、のんびりした提案を心がけてください。");
			break;
		case "intense":
			parts.push("推し活に全力投球するユーザーです。積極的で熱量の高い提案をしてください。");
			break;
		default:
			break;
	}

	if (parts.length === 0) return "";
	return `\n\n## ユーザーの応答スタイル設定\n${parts.join("\n")}`;
}

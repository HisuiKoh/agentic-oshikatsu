import * as p from "@clack/prompts";
import { ProfileRepository } from "../../core/profile/repository.js";
import type { UserProfile } from "../../core/profile/types.js";
import { getDbPath, isInitialized } from "../../infrastructure/config/manager.js";
import { getDb } from "../../infrastructure/db/connection.js";

const FORMALITY_OPTIONS = [
	{ value: "casual", label: "カジュアル", hint: "フレンドリーな口調" },
	{ value: "neutral", label: "ニュートラル", hint: "自然な丁寧語" },
	{ value: "formal", label: "フォーマル", hint: "敬語・丁寧語" },
] as const;

const FEEDBACK_STYLE_OPTIONS = [
	{ value: "gentle", label: "やさしめ", hint: "励まし重視" },
	{ value: "balanced", label: "バランス", hint: "良い点も改善点も" },
	{ value: "strict", label: "きびしめ", hint: "率直な指摘" },
] as const;

const DETAIL_LEVEL_OPTIONS = [
	{ value: "brief", label: "簡潔", hint: "要点のみ" },
	{ value: "normal", label: "ふつう", hint: "適度な説明" },
	{ value: "detailed", label: "詳細", hint: "背景や理由も含む" },
] as const;

const DECORATION_OPTIONS = [
	{ value: "minimal", label: "シンプル", hint: "絵文字なし" },
	{ value: "moderate", label: "ふつう", hint: "適度な装飾" },
	{ value: "rich", label: "にぎやか", hint: "絵文字あり" },
] as const;

const INTENSITY_OPTIONS = [
	{ value: "casual", label: "ライト", hint: "のんびり推し活" },
	{ value: "moderate", label: "ふつう", hint: "適度に楽しむ" },
	{ value: "intense", label: "ガチ", hint: "全力投球！" },
] as const;

/** プロファイルの表示ラベル */
const LABELS: Record<string, Record<string, string>> = {
	formality: { casual: "カジュアル", neutral: "ニュートラル", formal: "フォーマル" },
	feedbackStyle: { gentle: "やさしめ", balanced: "バランス", strict: "きびしめ" },
	detailLevel: { brief: "簡潔", normal: "ふつう", detailed: "詳細" },
	decoration: { minimal: "シンプル", moderate: "ふつう", rich: "にぎやか" },
	oshiIntensity: { casual: "ライト", moderate: "ふつう", intense: "ガチ" },
};

function displayProfile(profile: UserProfile): void {
	p.log.info(`口調:       ${LABELS.formality[profile.formality]}`);
	p.log.info(`フィードバック: ${LABELS.feedbackStyle[profile.feedbackStyle]}`);
	p.log.info(`詳細度:     ${LABELS.detailLevel[profile.detailLevel]}`);
	p.log.info(`装飾:       ${LABELS.decoration[profile.decoration]}`);
	p.log.info(`推し活温度:   ${LABELS.oshiIntensity[profile.oshiIntensity]}`);
	p.log.info(`ロケール:    ${profile.locale}`);
	p.log.info(`更新日時:    ${profile.updatedAt.slice(0, 10)}`);
}

/** デフォルトのプロファイル設定 */
const DEFAULT_PROFILE = {
	formality: "neutral" as const,
	feedbackStyle: "balanced" as const,
	detailLevel: "normal" as const,
	decoration: "moderate" as const,
	oshiIntensity: "moderate" as const,
	locale: "ja",
};

/** カスタムモードで各パラメータを対話形式で設定 */
async function runCustomSetup(
	existing: UserProfile | undefined,
): Promise<Omit<UserProfile, "id" | "updatedAt"> | undefined> {
	const formality = await p.select({
		message: "AI の口調は？",
		options: [...FORMALITY_OPTIONS],
		initialValue: existing?.formality ?? "neutral",
	});
	if (p.isCancel(formality)) return undefined;

	const feedbackStyle = await p.select({
		message: "フィードバックのスタイルは？",
		options: [...FEEDBACK_STYLE_OPTIONS],
		initialValue: existing?.feedbackStyle ?? "balanced",
	});
	if (p.isCancel(feedbackStyle)) return undefined;

	const detailLevel = await p.select({
		message: "回答の詳細度は？",
		options: [...DETAIL_LEVEL_OPTIONS],
		initialValue: existing?.detailLevel ?? "normal",
	});
	if (p.isCancel(detailLevel)) return undefined;

	const decoration = await p.select({
		message: "装飾（絵文字など）は？",
		options: [...DECORATION_OPTIONS],
		initialValue: existing?.decoration ?? "moderate",
	});
	if (p.isCancel(decoration)) return undefined;

	const oshiIntensity = await p.select({
		message: "推し活の温度感は？",
		options: [...INTENSITY_OPTIONS],
		initialValue: existing?.oshiIntensity ?? "moderate",
	});
	if (p.isCancel(oshiIntensity)) return undefined;

	return {
		formality: formality as UserProfile["formality"],
		feedbackStyle: feedbackStyle as UserProfile["feedbackStyle"],
		detailLevel: detailLevel as UserProfile["detailLevel"],
		decoration: decoration as UserProfile["decoration"],
		oshiIntensity: oshiIntensity as UserProfile["oshiIntensity"],
		locale: existing?.locale ?? "ja",
	};
}

/** プロファイル設定の対話フロー（おすすめ/カスタム選択付き） */
export async function runProfileSetup(
	db: ReturnType<typeof getDb>,
): Promise<UserProfile | undefined> {
	const repo = new ProfileRepository(db);
	const existing = repo.get();

	const mode = await p.select({
		message: "AI の応答スタイルを設定します",
		options: [
			{
				value: "recommended" as const,
				label: "おすすめ設定（推奨）",
				hint: "ニュートラル・バランス・ふつう",
			},
			{
				value: "custom" as const,
				label: "カスタム設定",
				hint: "各項目を自分で選ぶ",
			},
		],
	});

	if (p.isCancel(mode)) return undefined;

	if (mode === "recommended") {
		const profile = repo.upsert({
			...DEFAULT_PROFILE,
			locale: existing?.locale ?? "ja",
		});
		p.log.success("おすすめ設定を適用しました");
		return profile;
	}

	const values = await runCustomSetup(existing);
	if (!values) return undefined;

	return repo.upsert(values);
}

export async function execute(args: string[]): Promise<void> {
	p.intro("oshi profile — パーソナリティ設定");

	if (!isInitialized()) {
		p.log.error("初期化されていません。`oshi init` を実行してください。");
		return;
	}

	const subcommand = args[0];
	const db = getDb(getDbPath());
	const repo = new ProfileRepository(db);

	if (subcommand === "show" || !subcommand) {
		const profile = repo.get();
		if (!profile) {
			p.log.info("プロファイルが未設定です。`oshi profile edit` で設定してください。");
		} else {
			displayProfile(profile);
		}
		p.outro("");
		return;
	}

	if (subcommand === "edit") {
		const result = await runProfileSetup(db);
		if (!result) {
			p.outro("キャンセルしました");
			return;
		}
		p.log.success("プロファイルを更新しました");
		displayProfile(result);
		p.outro("");
		return;
	}

	p.log.error(`不明なサブコマンド: ${subcommand}`);
	p.log.info("使い方: oshi profile [show|edit]");
	p.outro("");
}

import { describe, expect, it } from "vitest";
import { buildProfilePrompt } from "@/core/profile/prompt-builder.js";
import type { UserProfile } from "@/core/profile/types.js";

const DEFAULT_PROFILE: UserProfile = {
	id: "test-1",
	formality: "neutral",
	feedbackStyle: "balanced",
	detailLevel: "normal",
	decoration: "moderate",
	oshiIntensity: "moderate",
	locale: "ja",
	updatedAt: "2026-01-01T00:00:00Z",
};

describe("buildProfilePrompt", () => {
	it("デフォルトプロファイルでプロンプトが生成される", () => {
		const result = buildProfilePrompt(DEFAULT_PROFILE);
		expect(result).toContain("ユーザーの応答スタイル設定");
		expect(result).toContain("丁寧語");
	});

	it("カジュアルな口調が反映される", () => {
		const profile = { ...DEFAULT_PROFILE, formality: "casual" as const };
		const result = buildProfilePrompt(profile);
		expect(result).toContain("カジュアル");
		expect(result).toContain("フレンドリー");
	});

	it("フォーマルな口調が反映される", () => {
		const profile = { ...DEFAULT_PROFILE, formality: "formal" as const };
		const result = buildProfilePrompt(profile);
		expect(result).toContain("フォーマル");
	});

	it("やさしめフィードバックが反映される", () => {
		const profile = { ...DEFAULT_PROFILE, feedbackStyle: "gentle" as const };
		const result = buildProfilePrompt(profile);
		expect(result).toContain("優しく");
		expect(result).toContain("励まし");
	});

	it("きびしめフィードバックが反映される", () => {
		const profile = { ...DEFAULT_PROFILE, feedbackStyle: "strict" as const };
		const result = buildProfilePrompt(profile);
		expect(result).toContain("率直");
	});

	it("簡潔な詳細度が反映される", () => {
		const profile = { ...DEFAULT_PROFILE, detailLevel: "brief" as const };
		const result = buildProfilePrompt(profile);
		expect(result).toContain("簡潔");
	});

	it("詳細な詳細度が反映される", () => {
		const profile = { ...DEFAULT_PROFILE, detailLevel: "detailed" as const };
		const result = buildProfilePrompt(profile);
		expect(result).toContain("詳細");
	});

	it("シンプルな装飾が反映される", () => {
		const profile = { ...DEFAULT_PROFILE, decoration: "minimal" as const };
		const result = buildProfilePrompt(profile);
		expect(result).toContain("シンプル");
	});

	it("にぎやかな装飾が反映される", () => {
		const profile = { ...DEFAULT_PROFILE, decoration: "rich" as const };
		const result = buildProfilePrompt(profile);
		expect(result).toContain("絵文字");
	});

	it("ガチ推し活が反映される", () => {
		const profile = { ...DEFAULT_PROFILE, oshiIntensity: "intense" as const };
		const result = buildProfilePrompt(profile);
		expect(result).toContain("全力投球");
	});

	it("ライト推し活が反映される", () => {
		const profile = { ...DEFAULT_PROFILE, oshiIntensity: "casual" as const };
		const result = buildProfilePrompt(profile);
		expect(result).toContain("ライト");
	});
});

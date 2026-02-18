import { describe, expect, it } from "vitest";
import { CollectedInfoSchema } from "@/core/info-collection/types.js";

describe("CollectedInfoSchema", () => {
	it("有効なデータをバリデーションできる", () => {
		const result = CollectedInfoSchema.safeParse({
			id: "test-1",
			oshiId: "oshi-1",
			sourcePlugin: "google-news",
			title: "テスト記事",
			url: "https://example.com/article",
			summary: "テスト要約",
			category: "活動報告",
			importance: 7,
			sentiment: "positive",
			rawContent: null,
			collectedAt: "2026-02-15T00:00:00.000Z",
			publishedAt: "2026-02-14T00:00:00.000Z",
			isRead: false,
		});

		expect(result.success).toBe(true);
	});

	it("必須フィールドが欠けている場合はエラー", () => {
		const result = CollectedInfoSchema.safeParse({
			id: "test-1",
			// oshiId missing
			sourcePlugin: "google-news",
			title: "テスト記事",
			collectedAt: "2026-02-15T00:00:00.000Z",
			isRead: false,
		});

		expect(result.success).toBe(false);
	});

	it("nullable フィールドは null を許容する", () => {
		const result = CollectedInfoSchema.safeParse({
			id: "test-1",
			oshiId: "oshi-1",
			sourcePlugin: "google-news",
			title: "テスト記事",
			url: null,
			summary: null,
			category: null,
			importance: null,
			sentiment: null,
			rawContent: null,
			collectedAt: "2026-02-15T00:00:00.000Z",
			publishedAt: null,
			isRead: true,
		});

		expect(result.success).toBe(true);
	});
});

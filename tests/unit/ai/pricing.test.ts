import { describe, expect, it } from "vitest";
import { loadPricing } from "@/infrastructure/ai/pricing.js";

describe("loadPricing", () => {
	it("pricing.json を読み込める", () => {
		const pricing = loadPricing();
		expect(pricing).toBeDefined();
		expect(pricing.claude).toBeDefined();
	});

	it("Claude のモデル料金が定義されている", () => {
		const pricing = loadPricing();
		const sonnet = pricing.claude["claude-sonnet-4-5-20250929"];
		expect(sonnet).toBeDefined();
		expect(sonnet.inputPerMToken).toBeGreaterThan(0);
		expect(sonnet.outputPerMToken).toBeGreaterThan(0);
		expect(sonnet.cacheReadPerMToken).toBeGreaterThan(0);
	});

	it("Haiku の料金が Sonnet より安い", () => {
		const pricing = loadPricing();
		const sonnet = pricing.claude["claude-sonnet-4-5-20250929"];
		const haiku = pricing.claude["claude-haiku-4-5-20251001"];
		expect(haiku.inputPerMToken).toBeLessThan(sonnet.inputPerMToken);
		expect(haiku.outputPerMToken).toBeLessThan(sonnet.outputPerMToken);
	});

	it("キャッシュされた結果を返す（2回目は同一参照）", () => {
		const first = loadPricing();
		const second = loadPricing();
		expect(first).toBe(second);
	});
});

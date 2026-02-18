import { describe, expect, it } from "vitest";
import type { PluginOshiContext } from "@/infrastructure/plugins/base.js";
import { createGoogleNewsPlugin } from "@/infrastructure/plugins/google-news.js";

const testOshi: PluginOshiContext = {
	id: "test-oshi-1",
	name: "テスト推し",
	category: "person",
	attributes: [],
};

describe("Google News プラグイン", () => {
	it("プラグインの基本プロパティが正しい", () => {
		const plugin = createGoogleNewsPlugin();

		expect(plugin.id).toBe("google-news");
		expect(plugin.name).toBe("Google News");
		expect(plugin.supportedCategories).toBe("*");
	});

	it("canHandle は常に true を返す", () => {
		const plugin = createGoogleNewsPlugin();

		expect(plugin.canHandle(testOshi)).toBe(true);
		expect(plugin.canHandle({ ...testOshi, category: "mineral" })).toBe(true);
	});

	it("collect メソッドが存在し、Promise を返す", () => {
		const plugin = createGoogleNewsPlugin();
		const result = plugin.collect(testOshi, { maxItems: 1 });

		expect(result).toBeInstanceOf(Promise);
	});
});

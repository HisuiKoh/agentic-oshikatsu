import { describe, expect, it } from "vitest";
import { LintConfigSchema } from "@/core/linter/types.js";

describe("LintConfigSchema", () => {
	it("空オブジェクトでデフォルト値が設定される", () => {
		const config = LintConfigSchema.parse({});
		expect(config.rules["budget-rule"].enabled).toBe(true);
		expect(config.rules["budget-rule"].warnThreshold).toBe(20);
		expect(config.rules["time-rule"].enabled).toBe(true);
		expect(config.rules["time-rule"].startHour).toBe(2);
		expect(config.rules["time-rule"].endHour).toBe(6);
		expect(config.rules["keyword-rule"].enabled).toBe(true);
		expect(config.rules["keyword-rule"].blockKeywords).toEqual([]);
	});

	it("カスタム値を設定できる", () => {
		const config = LintConfigSchema.parse({
			rules: {
				"budget-rule": { warnThreshold: 50 },
				"keyword-rule": { blockKeywords: ["転売"], warnKeywords: ["限定"] },
			},
		});
		expect(config.rules["budget-rule"].warnThreshold).toBe(50);
		expect(config.rules["keyword-rule"].blockKeywords).toEqual(["転売"]);
		expect(config.rules["keyword-rule"].warnKeywords).toEqual(["限定"]);
	});

	it("不正な warnThreshold はエラー", () => {
		const result = LintConfigSchema.safeParse({
			rules: { "budget-rule": { warnThreshold: 150 } },
		});
		expect(result.success).toBe(false);
	});
});

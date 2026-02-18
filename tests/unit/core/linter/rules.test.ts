import { describe, expect, it } from "vitest";
import { BudgetRule, extractAmount } from "@/core/linter/rules/budget-rule.js";
import { KeywordRule } from "@/core/linter/rules/keyword-rule.js";
import { TimeRule } from "@/core/linter/rules/time-rule.js";

describe("extractAmount", () => {
	it("「15,000円」形式を抽出", () => {
		expect(extractAmount("15,000円のグッズを購入")).toBe(15000);
	});

	it("「3500円」形式を抽出", () => {
		expect(extractAmount("3500円のチケット")).toBe(3500);
	});

	it("「¥15,000」形式を抽出", () => {
		expect(extractAmount("¥15,000のフィギュア")).toBe(15000);
	});

	it("「1万円」形式を抽出", () => {
		expect(extractAmount("1万円のグッズ")).toBe(10000);
	});

	it("「1.5万円」形式を抽出", () => {
		expect(extractAmount("1.5万円の限定セット")).toBe(15000);
	});

	it("金額がない場合は null", () => {
		expect(extractAmount("イベントに参加する")).toBeNull();
	});
});

describe("BudgetRule", () => {
	it("予算超過で BLOCK", () => {
		const rule = new BudgetRule();
		const result = rule.evaluate("15,000円のグッズ購入", { budgetRemaining: 10000 });
		expect(result?.verdict).toBe("BLOCK");
	});

	it("支出後の残額が予算総額の閾値%以下で WARN", () => {
		const rule = new BudgetRule({ warnThreshold: 20 });
		// 予算30000、残額10000、支出8500 → 残額1500 = 5% → WARN
		const result = rule.evaluate("8,500円のグッズ購入", {
			budgetRemaining: 10000,
			budgetTotal: 30000,
		});
		expect(result?.verdict).toBe("WARN");
	});

	it("余裕がある場合は null（PASS）", () => {
		const rule = new BudgetRule();
		const result = rule.evaluate("1,000円のグッズ購入", {
			budgetRemaining: 50000,
			budgetTotal: 100000,
		});
		expect(result).toBeNull();
	});

	it("金額が含まれない場合はスキップ", () => {
		const rule = new BudgetRule();
		const result = rule.evaluate("イベントに参加する", { budgetRemaining: 10000 });
		expect(result).toBeNull();
	});

	it("予算情報がない場合はスキップ", () => {
		const rule = new BudgetRule();
		const result = rule.evaluate("15,000円のグッズ購入", {});
		expect(result).toBeNull();
	});

	it("無効化されている場合はスキップ", () => {
		const rule = new BudgetRule({ enabled: false });
		const result = rule.evaluate("15,000円のグッズ購入", { budgetRemaining: 1000 });
		expect(result).toBeNull();
	});
});

describe("TimeRule", () => {
	it("深夜の購入行動で WARN", () => {
		const rule = new TimeRule();
		const now = new Date("2026-02-16T03:30:00");
		const result = rule.evaluate("グッズを購入する", { now });
		expect(result?.verdict).toBe("WARN");
	});

	it("日中の購入行動は null", () => {
		const rule = new TimeRule();
		const now = new Date("2026-02-16T14:00:00");
		const result = rule.evaluate("グッズを購入する", { now });
		expect(result).toBeNull();
	});

	it("深夜でも購入以外は null", () => {
		const rule = new TimeRule();
		const now = new Date("2026-02-16T03:30:00");
		const result = rule.evaluate("推しの情報を確認する", { now });
		expect(result).toBeNull();
	});

	it("カスタム時間帯を設定できる", () => {
		const rule = new TimeRule({ startHour: 0, endHour: 5 });
		const now = new Date("2026-02-16T01:00:00");
		const result = rule.evaluate("ポチる", { now });
		expect(result?.verdict).toBe("WARN");
	});

	it("無効化されている場合はスキップ", () => {
		const rule = new TimeRule({ enabled: false });
		const now = new Date("2026-02-16T03:30:00");
		const result = rule.evaluate("グッズを購入する", { now });
		expect(result).toBeNull();
	});
});

describe("KeywordRule", () => {
	it("BLOCK キーワードで BLOCK", () => {
		const rule = new KeywordRule({ blockKeywords: ["転売"] });
		const result = rule.evaluate("転売で利益を得る");
		expect(result?.verdict).toBe("BLOCK");
	});

	it("WARN キーワードで WARN", () => {
		const rule = new KeywordRule({ warnKeywords: ["限定"] });
		const result = rule.evaluate("限定グッズを購入する");
		expect(result?.verdict).toBe("WARN");
	});

	it("キーワードに該当しない場合は null", () => {
		const rule = new KeywordRule({ blockKeywords: ["転売"], warnKeywords: ["限定"] });
		const result = rule.evaluate("推しのイベントに参加する");
		expect(result).toBeNull();
	});

	it("大文字小文字を無視する", () => {
		const rule = new KeywordRule({ blockKeywords: ["spam"] });
		const result = rule.evaluate("SPAM投稿をする");
		expect(result?.verdict).toBe("BLOCK");
	});

	it("キーワードが空の場合は null", () => {
		const rule = new KeywordRule();
		const result = rule.evaluate("何でもOK");
		expect(result).toBeNull();
	});
});

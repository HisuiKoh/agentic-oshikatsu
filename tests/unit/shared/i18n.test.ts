import { beforeEach, describe, expect, it } from "vitest";
import { detectLocale, getLocale, setLocale, t } from "@/shared/i18n/i18n.js";

beforeEach(() => {
	setLocale("ja");
});

describe("t()", () => {
	it("ドット区切りのキーで日本語メッセージを取得", () => {
		expect(t("common.error")).toBe("エラー");
		expect(t("common.cancel")).toBe("キャンセルしました");
	});

	it("英語ロケールでメッセージを取得", () => {
		setLocale("en");
		expect(t("common.error")).toBe("Error");
		expect(t("common.cancel")).toBe("Cancelled");
	});

	it("パラメータ置換ができる", () => {
		expect(t("collect.newItems", { count: "5" })).toBe("新規: 5 件");
	});

	it("英語ロケールでパラメータ置換", () => {
		setLocale("en");
		expect(t("collect.newItems", { count: "5" })).toBe("New: 5 items");
	});

	it("存在しないキーはキー文字列を返す", () => {
		expect(t("nonexistent.key")).toBe("nonexistent.key");
	});

	it("中間パスが存在しないキーはキー文字列を返す", () => {
		expect(t("common.nonexistent.deep")).toBe("common.nonexistent.deep");
	});

	it("未定義のパラメータはプレースホルダーのまま", () => {
		expect(t("collect.newItems")).toBe("新規: {{count}} 件");
	});

	it("ネストされたキーを取得できる", () => {
		expect(t("init.title")).toBe("oshi init — 初期セットアップ");
		setLocale("en");
		expect(t("init.title")).toBe("oshi init — Initial Setup");
	});
});

describe("setLocale / getLocale", () => {
	it("デフォルトは ja", () => {
		expect(getLocale()).toBe("ja");
	});

	it("ロケールを切り替えられる", () => {
		setLocale("en");
		expect(getLocale()).toBe("en");
	});
});

describe("detectLocale()", () => {
	it("LANG=en_US.UTF-8 なら en を返す", () => {
		const orig = process.env.LANG;
		process.env.LANG = "en_US.UTF-8";
		expect(detectLocale()).toBe("en");
		process.env.LANG = orig;
	});

	it("LANG=ja_JP.UTF-8 なら ja を返す", () => {
		const orig = process.env.LANG;
		process.env.LANG = "ja_JP.UTF-8";
		expect(detectLocale()).toBe("ja");
		process.env.LANG = orig;
	});

	it("LANG 未設定なら ja を返す", () => {
		const origLang = process.env.LANG;
		const origLc = process.env.LC_ALL;
		delete process.env.LANG;
		delete process.env.LC_ALL;
		expect(detectLocale()).toBe("ja");
		process.env.LANG = origLang;
		process.env.LC_ALL = origLc;
	});
});

import en from "./locales/en.json" with { type: "json" };
import ja from "./locales/ja.json" with { type: "json" };

export type Locale = "ja" | "en";

type Messages = typeof ja;

const locales: Record<Locale, Messages> = { ja, en };

let currentLocale: Locale = "ja";

/** 現在のロケールを設定 */
export function setLocale(locale: Locale): void {
	currentLocale = locale;
}

/** 現在のロケールを取得 */
export function getLocale(): Locale {
	return currentLocale;
}

/** 環境変数からロケールを自動検出 */
export function detectLocale(): Locale {
	const lang = process.env.LANG ?? process.env.LC_ALL ?? "";
	if (lang.startsWith("en")) return "en";
	return "ja";
}

/**
 * メッセージを取得（ドット区切りのキーパス）
 *
 * @example t("common.error") // "エラー"
 * @example t("collect.newItems", { count: "5" }) // "新規: 5 件"
 */
export function t(key: string, params?: Record<string, string>): string {
	const parts = key.split(".");
	let current: unknown = locales[currentLocale];

	for (const part of parts) {
		if (current === null || current === undefined || typeof current !== "object") {
			return key;
		}
		current = (current as Record<string, unknown>)[part];
	}

	if (typeof current !== "string") return key;

	if (!params) return current;

	// {{key}} を置換
	return current.replace(/\{\{(\w+)\}\}/g, (_, k: string) => params[k] ?? `{{${k}}}`);
}

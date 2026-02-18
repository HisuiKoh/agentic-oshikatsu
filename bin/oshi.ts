#!/usr/bin/env node
import { routeCommand } from "../src/cli/router.js";
import { detectLocale, type Locale, setLocale } from "../src/shared/i18n/i18n.js";

// --lang オプションを処理
const args = process.argv.slice(2);
const langIdx = args.indexOf("--lang");
if (langIdx !== -1 && args[langIdx + 1]) {
	const lang = args[langIdx + 1];
	if (lang === "ja" || lang === "en") {
		setLocale(lang as Locale);
		args.splice(langIdx, 2);
	} else {
		console.error(`Invalid language: ${lang}. Supported: ja, en`);
		process.exit(1);
	}
} else {
	setLocale(detectLocale());
}

routeCommand(args);

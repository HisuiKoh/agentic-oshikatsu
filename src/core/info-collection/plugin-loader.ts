import type { InfoCollectorPlugin, PluginOshiContext } from "../../infrastructure/plugins/base.js";
import { createGoogleNewsPlugin } from "../../infrastructure/plugins/google-news.js";
import { createWikipediaPlugin } from "../../infrastructure/plugins/wikipedia.js";
import { createXApiPlugin } from "../../infrastructure/plugins/x-api.js";
import { createYouTubePlugin } from "../../infrastructure/plugins/youtube.js";

/** 組み込みプラグインのレジストリ */
const builtinPlugins: InfoCollectorPlugin[] = [
	createGoogleNewsPlugin(),
	createYouTubePlugin(),
	createWikipediaPlugin(),
	createXApiPlugin(),
];

/** 指定された推しに対応可能なプラグインを取得 */
export function getAvailablePlugins(oshi: PluginOshiContext): InfoCollectorPlugin[] {
	return builtinPlugins.filter((plugin) => {
		if (plugin.supportedCategories !== "*") {
			const category = oshi.category;
			if (!plugin.supportedCategories.includes(category)) return false;
		}
		return plugin.canHandle(oshi);
	});
}

/** プラグイン ID で取得 */
export function getPluginById(pluginId: string): InfoCollectorPlugin | undefined {
	return builtinPlugins.find((p) => p.id === pluginId);
}

/**
 * カテゴリ上は対応可能だが、API Key 未設定等で利用できないプラグインを取得。
 * add フローで「API 連携を設定しませんか？」の促しに使用。
 */
export function getUnavailableButRelevantPlugins(oshi: PluginOshiContext): InfoCollectorPlugin[] {
	return builtinPlugins.filter((plugin) => {
		// カテゴリが対応しているか
		if (plugin.supportedCategories !== "*") {
			if (!plugin.supportedCategories.includes(oshi.category)) return false;
		}
		// canHandle が false = API Key 未設定等で利用不可
		return !plugin.canHandle(oshi);
	});
}

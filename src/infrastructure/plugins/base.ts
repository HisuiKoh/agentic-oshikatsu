import type { CollectOptions, RawCollectedInfo } from "../../core/info-collection/types.js";
import type { OshiCategory } from "../../core/oshi/types.js";

/** 推しの基本情報（プラグインに渡す最小限の情報） */
export interface PluginOshiContext {
	id: string;
	name: string;
	category: OshiCategory;
	attributes?: Array<{ key: string; value: string }>;
}

/** 情報収集プラグインのインターフェース */
export interface InfoCollectorPlugin {
	/** プラグイン識別子 */
	id: string;
	/** 表示名 */
	name: string;
	/** 対応カテゴリ（"*" で全カテゴリ対応） */
	supportedCategories: OshiCategory[] | "*";
	/** この推しに対して情報収集可能か判定 */
	canHandle(oshi: PluginOshiContext): boolean;
	/** 情報を収集 */
	collect(oshi: PluginOshiContext, options?: CollectOptions): Promise<RawCollectedInfo[]>;
}

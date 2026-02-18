import { and, eq, inArray, sql } from "drizzle-orm";
import type { AIProvider } from "../../infrastructure/ai/types.js";
import type { AppDatabase } from "../../infrastructure/db/connection.js";
import { collectedInfo } from "../../infrastructure/db/schema.js";
import type { InfoCollectorPlugin, PluginOshiContext } from "../../infrastructure/plugins/base.js";
import { generateId } from "../../shared/id.js";
import { logger } from "../../shared/logger.js";
import { analyzeCollectedInfo } from "./analyzer.js";
import { getAvailablePlugins, getPluginById } from "./plugin-loader.js";
import type { CollectedInfo, CollectOptions, RawCollectedInfo } from "./types.js";

/** 関連性スコアの閾値 */
const RELEVANCE_THRESHOLDS = {
	AUTO_APPROVE: 80,
	AUTO_REJECT: 30,
} as const;

function determineApprovalStatus(relevanceScore: number): "approved" | "pending" | "rejected" {
	if (relevanceScore >= RELEVANCE_THRESHOLDS.AUTO_APPROVE) return "approved";
	if (relevanceScore < RELEVANCE_THRESHOLDS.AUTO_REJECT) return "rejected";
	return "pending";
}

/** 情報収集の結果 */
export interface CollectResult {
	newItems: number;
	skippedDuplicates: number;
	totalCollected: number;
	approvedItems: number;
	pendingItems: number;
	rejectedItems: number;
	error?: string;
}

const EMPTY_RESULT: Omit<CollectResult, "error"> = {
	newItems: 0,
	skippedDuplicates: 0,
	totalCollected: 0,
	approvedItems: 0,
	pendingItems: 0,
	rejectedItems: 0,
};

/** 既存 URL を取得（重複チェック用） */
function getExistingUrls(db: AppDatabase, oshiId: string): Set<string> {
	const rows = db
		.select({ url: collectedInfo.url })
		.from(collectedInfo)
		.where(eq(collectedInfo.oshiId, oshiId))
		.all();

	return new Set(rows.map((r) => r.url).filter((u): u is string => u !== null));
}

/** 情報を収集・分析・保存 */
export async function collectInfo(
	db: AppDatabase,
	provider: AIProvider,
	oshi: PluginOshiContext,
	options?: CollectOptions,
): Promise<CollectResult> {
	let plugins: InfoCollectorPlugin[];
	if (options?.sourcePlugin) {
		const plugin = getPluginById(options.sourcePlugin);
		if (!plugin) {
			logger.warn(`プラグインが見つかりません: ${options.sourcePlugin}`);
			return {
				...EMPTY_RESULT,
				error: `プラグインが見つかりません: ${options.sourcePlugin}`,
			};
		}
		if (!plugin.canHandle(oshi)) {
			logger.warn(`${plugin.name} は ${oshi.name} に対応していません`);
			return {
				...EMPTY_RESULT,
				error: `${plugin.name} は ${oshi.name} に対応していません`,
			};
		}
		plugins = [plugin];
	} else {
		plugins = getAvailablePlugins(oshi);
	}
	if (plugins.length === 0) {
		logger.warn(`${oshi.name} に対応するプラグインが見つかりません`);
		return { ...EMPTY_RESULT };
	}

	// 全プラグインで情報収集
	const allRawItems: RawCollectedInfo[] = [];
	for (const plugin of plugins) {
		try {
			const items = await plugin.collect(oshi, options);
			allRawItems.push(...items);
			logger.debug(`${plugin.name}: ${items.length} 件取得`);
		} catch (error) {
			logger.warn(
				`${plugin.name} の収集に失敗: ${error instanceof Error ? error.message : "unknown"}`,
			);
		}
	}

	if (allRawItems.length === 0) {
		return { ...EMPTY_RESULT };
	}

	// URL ベースの重複チェック（URL なしは重複チェック不可のため除外）
	const existingUrls = getExistingUrls(db, oshi.id);
	const validItems = allRawItems.filter((item) => item.url && item.url !== "");
	const newRawItems = validItems.filter((item) => !existingUrls.has(item.url));
	const skippedDuplicates = validItems.length - newRawItems.length;

	if (newRawItems.length === 0) {
		return { ...EMPTY_RESULT, skippedDuplicates, totalCollected: allRawItems.length };
	}

	// AI で分析
	const analyses = await analyzeCollectedInfo(provider, oshi.name, newRawItems);

	// DB に保存（関連性スコアに基づく振り分け付き）
	const now = new Date().toISOString();
	let approvedItems = 0;
	let pendingItems = 0;
	let rejectedItems = 0;

	const values = newRawItems.map((item, i) => {
		const score = analyses[i]?.relevanceScore ?? 50;
		const status = determineApprovalStatus(score);
		if (status === "approved") approvedItems++;
		else if (status === "pending") pendingItems++;
		else rejectedItems++;

		return {
			id: generateId(),
			oshiId: oshi.id,
			sourcePlugin: item.sourcePlugin,
			title: item.title,
			url: item.url || null,
			summary: analyses[i]?.summary ?? null,
			category: analyses[i]?.category ?? null,
			importance: analyses[i]?.importance ?? null,
			sentiment: analyses[i]?.sentiment ?? null,
			rawContent: item.rawContent ?? null,
			collectedAt: now,
			publishedAt: item.publishedAt ?? null,
			eventDate: analyses[i]?.eventDate ?? null,
			isRead: false,
			relevanceScore: score,
			approvalStatus: status,
		};
	});

	db.insert(collectedInfo).values(values).run();

	return {
		newItems: newRawItems.length,
		skippedDuplicates,
		totalCollected: allRawItems.length,
		approvedItems,
		pendingItems,
		rejectedItems,
	};
}

/** 収集済み情報を取得 */
export function getCollectedInfo(
	db: AppDatabase,
	oshiId: string,
	options?: {
		unreadOnly?: boolean;
		limit?: number;
		approvalStatuses?: Array<"approved" | "pending" | "rejected">;
	},
): CollectedInfo[] {
	const statuses = options?.approvalStatuses ?? ["approved"];
	if (statuses.length === 0) return [];
	const conditions = [
		eq(collectedInfo.oshiId, oshiId),
		inArray(collectedInfo.approvalStatus, statuses),
	];
	if (options?.unreadOnly) {
		conditions.push(eq(collectedInfo.isRead, false));
	}

	let query = db
		.select()
		.from(collectedInfo)
		.where(and(...conditions))
		.orderBy(sql`COALESCE(${collectedInfo.publishedAt}, ${collectedInfo.collectedAt}) DESC`)
		.$dynamic();

	if (options?.limit) {
		query = query.limit(options.limit);
	}

	return query.all();
}

/** 承認ステータスを更新 */
export function updateApprovalStatus(
	db: AppDatabase,
	infoId: string,
	status: "approved" | "pending" | "rejected",
): void {
	db.update(collectedInfo)
		.set({ approvalStatus: status })
		.where(eq(collectedInfo.id, infoId))
		.run();
}

/** 情報を既読にする */
export function markAsRead(db: AppDatabase, infoId: string): void {
	db.update(collectedInfo).set({ isRead: true }).where(eq(collectedInfo.id, infoId)).run();
}

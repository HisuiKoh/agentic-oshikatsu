import { count, sum } from "drizzle-orm";
import { generateId } from "../../shared/id.js";
import { getDbPath } from "../config/manager.js";
import { getDb } from "../db/connection.js";
import * as schema from "../db/schema.js";
import type { AIProviderId, AIPurpose, AIResponse } from "./types.js";

/** AI 使用量を記録 */
export function recordUsage(response: AIResponse, purpose: AIPurpose, cost: number): void {
	const db = getDb(getDbPath());
	db.insert(schema.aiUsage)
		.values({
			id: generateId(),
			provider: response.provider,
			model: response.model,
			inputTokens: response.usage.inputTokens,
			outputTokens: response.usage.outputTokens,
			cacheTokens: response.usage.cacheTokens ?? 0,
			cost,
			purpose,
			timestamp: new Date().toISOString(),
		})
		.run();
}

/** AI 使用量サマリーを取得 */
export function getUsageSummary(): Array<{
	provider: AIProviderId;
	totalInputTokens: number;
	totalOutputTokens: number;
	totalCost: number;
	count: number;
}> {
	const db = getDb(getDbPath());
	const rows = db
		.select({
			provider: schema.aiUsage.provider,
			totalInputTokens: sum(schema.aiUsage.inputTokens),
			totalOutputTokens: sum(schema.aiUsage.outputTokens),
			totalCost: sum(schema.aiUsage.cost),
			count: count(),
		})
		.from(schema.aiUsage)
		.groupBy(schema.aiUsage.provider)
		.all();

	return rows.map((row) => ({
		provider: row.provider as AIProviderId,
		totalInputTokens: Number(row.totalInputTokens) || 0,
		totalOutputTokens: Number(row.totalOutputTokens) || 0,
		totalCost: Number(row.totalCost) || 0,
		count: row.count,
	}));
}

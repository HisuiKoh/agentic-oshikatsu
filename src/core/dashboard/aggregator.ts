import { and, count, desc, eq, sql, sum } from "drizzle-orm";
import type { AppDatabase } from "../../infrastructure/db/connection.js";
import * as schema from "../../infrastructure/db/schema.js";
import type { BudgetSummary } from "../budget/types.js";
import type { Oshi } from "../oshi/types.js";

/** ダッシュボード用の推し情報サマリー */
export interface OshiSummary {
	id: string;
	name: string;
	category: string;
	description: string | null;
	registeredAt: string;
	attributeCount: number;
	infoCount: number;
}

/** 収集情報の概要 */
export interface InfoSummary {
	title: string;
	category: string | null;
	summary: string | null;
	collectedAt: string;
	publishedAt: string | null;
	eventDate: string | null;
}

/** Linter 結果の概要 */
export interface LintSummary {
	action: string;
	verdict: string;
	timestamp: string;
}

/** 提案の概要 */
export interface SuggestionSummary {
	category: string | null;
	content: string;
	createdAt: string;
}

/** AI 使用量サマリー */
export interface AiUsageSummary {
	provider: string;
	totalInputTokens: number;
	totalOutputTokens: number;
	totalCost: number;
	callCount: number;
}

/** ダッシュボード全体のデータ */
export interface DashboardData {
	oshi: OshiSummary;
	recentInfo: InfoSummary[];
	budgetSummaries: BudgetSummary[];
	recentLintResults: LintSummary[];
	recentSuggestions: SuggestionSummary[];
	aiUsage: AiUsageSummary[];
}

/** 全推しの概要一覧データ */
export interface DashboardOverview {
	oshis: OshiSummary[];
	aiUsage: AiUsageSummary[];
	totalBudgetSummaries: BudgetSummary[];
}

/** 推しのサマリー情報を取得 */
function getOshiSummary(db: AppDatabase, oshi: Oshi): OshiSummary {
	const attrCount =
		db
			.select({ count: count() })
			.from(schema.oshiAttributes)
			.where(eq(schema.oshiAttributes.oshiId, oshi.id))
			.get()?.count ?? 0;

	const infoCount =
		db
			.select({ count: count() })
			.from(schema.collectedInfo)
			.where(
				and(
					eq(schema.collectedInfo.oshiId, oshi.id),
					eq(schema.collectedInfo.approvalStatus, "approved"),
				),
			)
			.get()?.count ?? 0;

	return {
		id: oshi.id,
		name: oshi.name,
		category: oshi.category,
		description: oshi.description ?? null,
		registeredAt: oshi.registeredAt,
		attributeCount: attrCount,
		infoCount,
	};
}

/** 直近の収集情報を取得 */
function getRecentInfo(db: AppDatabase, oshiId: string, limit: number = 5): InfoSummary[] {
	return db
		.select({
			title: schema.collectedInfo.title,
			category: schema.collectedInfo.category,
			summary: schema.collectedInfo.summary,
			collectedAt: schema.collectedInfo.collectedAt,
			publishedAt: schema.collectedInfo.publishedAt,
			eventDate: schema.collectedInfo.eventDate,
		})
		.from(schema.collectedInfo)
		.where(
			and(
				eq(schema.collectedInfo.oshiId, oshiId),
				eq(schema.collectedInfo.approvalStatus, "approved"),
			),
		)
		.orderBy(
			sql`COALESCE(${schema.collectedInfo.publishedAt}, ${schema.collectedInfo.collectedAt}) DESC`,
		)
		.limit(limit)
		.all();
}

/** 直近の Linter 結果を取得（推し指定時は suggestions 経由でフィルタ） */
function getRecentLintResults(
	db: AppDatabase,
	oshiId: string | null,
	limit: number = 3,
): LintSummary[] {
	if (oshiId === null) {
		return db
			.select({
				action: schema.lintResults.action,
				verdict: schema.lintResults.verdict,
				timestamp: schema.lintResults.timestamp,
			})
			.from(schema.lintResults)
			.orderBy(desc(schema.lintResults.timestamp))
			.limit(limit)
			.all();
	}

	// 推し固有: suggestions と JOIN してフィルタ
	// ※ oshi lint で直接実行した結果（suggestionId=null）は含まれない
	return db
		.select({
			action: schema.lintResults.action,
			verdict: schema.lintResults.verdict,
			timestamp: schema.lintResults.timestamp,
		})
		.from(schema.lintResults)
		.innerJoin(schema.suggestions, eq(schema.lintResults.suggestionId, schema.suggestions.id))
		.where(eq(schema.suggestions.oshiId, oshiId))
		.orderBy(desc(schema.lintResults.timestamp))
		.limit(limit)
		.all();
}

/** 直近の提案を取得 */
function getRecentSuggestions(
	db: AppDatabase,
	oshiId: string,
	limit: number = 3,
): SuggestionSummary[] {
	return db
		.select({
			category: schema.suggestions.category,
			content: schema.suggestions.content,
			createdAt: schema.suggestions.createdAt,
		})
		.from(schema.suggestions)
		.where(eq(schema.suggestions.oshiId, oshiId))
		.orderBy(desc(schema.suggestions.createdAt))
		.limit(limit)
		.all();
}

/** AI 使用量サマリーを取得 */
function getAiUsageSummary(db: AppDatabase): AiUsageSummary[] {
	const rows = db
		.select({
			provider: schema.aiUsage.provider,
			totalInputTokens: sum(schema.aiUsage.inputTokens),
			totalOutputTokens: sum(schema.aiUsage.outputTokens),
			totalCost: sum(schema.aiUsage.cost),
			callCount: count(),
		})
		.from(schema.aiUsage)
		.groupBy(schema.aiUsage.provider)
		.all();

	return rows.map((r) => ({
		provider: r.provider,
		totalInputTokens: Number(r.totalInputTokens ?? 0),
		totalOutputTokens: Number(r.totalOutputTokens ?? 0),
		totalCost: Number(r.totalCost ?? 0),
		callCount: r.callCount,
	}));
}

/** 特定推しのダッシュボードデータを集約 */
export function aggregateDashboard(
	db: AppDatabase,
	oshi: Oshi,
	budgetSummaries: BudgetSummary[],
): DashboardData {
	return {
		oshi: getOshiSummary(db, oshi),
		recentInfo: getRecentInfo(db, oshi.id),
		budgetSummaries,
		recentLintResults: getRecentLintResults(db, oshi.id),
		recentSuggestions: getRecentSuggestions(db, oshi.id),
		aiUsage: getAiUsageSummary(db),
	};
}

/** 全推しの概要を集約 */
export function aggregateOverview(
	db: AppDatabase,
	oshis: Oshi[],
	budgetSummaries: BudgetSummary[],
): DashboardOverview {
	return {
		oshis: oshis.map((o) => getOshiSummary(db, o)),
		aiUsage: getAiUsageSummary(db),
		totalBudgetSummaries: budgetSummaries,
	};
}

import * as p from "@clack/prompts";
import { BudgetManager } from "../../core/budget/manager.js";
import type { BudgetSummary } from "../../core/budget/types.js";
import {
	aggregateDashboard,
	aggregateOverview,
	type DashboardData,
	type DashboardOverview,
} from "../../core/dashboard/aggregator.js";
import { OshiRepository } from "../../core/oshi/repository.js";
import { getDbPath, isInitialized } from "../../infrastructure/config/manager.js";
import { getDb } from "../../infrastructure/db/connection.js";

const VERDICT_ICONS: Record<string, string> = {
	PASS: "\u2705",
	WARN: "\u26a0\ufe0f",
	BLOCK: "\ud83d\udeab",
};

const CATEGORY_LABELS: Record<string, string> = {
	goods: "\ud83d\uded2 \u30b0\u30c3\u30ba",
	event: "\ud83c\udfab \u30a4\u30d9\u30f3\u30c8",
	sns: "\ud83d\udcf1 SNS",
	communication: "\ud83d\udcac \u30b3\u30df\u30e5\u30cb\u30b1\u30fc\u30b7\u30e7\u30f3",
	creative: "\ud83c\udfa8 \u30af\u30ea\u30a8\u30a4\u30c6\u30a3\u30d6",
	other: "\ud83d\udccc \u305d\u306e\u4ed6",
};

/** プログレスバーを生成 */
function progressBar(ratio: number, width: number = 20): string {
	const clamped = Math.max(0, Math.min(1, ratio));
	const filled = Math.round(clamped * width);
	const empty = width - filled;
	const bar = "\u2588".repeat(filled) + "\u2591".repeat(empty);

	if (clamped >= 0.9) return `\x1b[31m${bar}\x1b[0m`;
	if (clamped >= 0.7) return `\x1b[33m${bar}\x1b[0m`;
	return `\x1b[32m${bar}\x1b[0m`;
}

/** セクションヘッダーを表示 */
function sectionHeader(title: string): void {
	p.log.info(`\n\x1b[1m\x1b[36m--- ${title} ---\x1b[0m`);
}

/** 推し情報セクション */
function renderOshiInfo(data: DashboardData): void {
	sectionHeader("\u63a8\u3057\u60c5\u5831");
	p.log.info(`  \u540d\u524d: ${data.oshi.name}`);
	p.log.info(`  \u30ab\u30c6\u30b4\u30ea: ${data.oshi.category}`);
	if (data.oshi.description) {
		p.log.info(`  \u8aac\u660e: ${data.oshi.description}`);
	}
	p.log.info(`  \u767b\u9332\u65e5: ${data.oshi.registeredAt.slice(0, 10)}`);
	p.log.info(
		`  \u5c5e\u6027: ${data.oshi.attributeCount}\u4ef6 / \u53ce\u96c6\u60c5\u5831: ${data.oshi.infoCount}\u4ef6`,
	);
}

/** 収集情報セクション */
function renderRecentInfo(data: DashboardData): void {
	sectionHeader("\u6700\u65b0\u306e\u53ce\u96c6\u60c5\u5831");
	if (data.recentInfo.length === 0) {
		p.log.info("  \u53ce\u96c6\u60c5\u5831\u306f\u3042\u308a\u307e\u305b\u3093");
		return;
	}
	for (const info of data.recentInfo) {
		const date = info.collectedAt.slice(0, 10);
		const cat = info.category ? `[${info.category}]` : "";
		p.log.info(`  [${date}] ${cat} ${info.title}`);
		if (info.summary) {
			p.log.info(`    ${info.summary}`);
		}
	}
}

/** 予算セクション */
function renderBudget(summaries: BudgetSummary[]): void {
	sectionHeader("\u4e88\u7b97\u72b6\u6cc1");
	if (summaries.length === 0) {
		p.log.info("  \u4e88\u7b97\u304c\u8a2d\u5b9a\u3055\u308c\u3066\u3044\u307e\u305b\u3093");
		return;
	}
	for (const s of summaries) {
		const bar = progressBar(s.usageRate);
		const pct = Math.round(s.usageRate * 100);
		p.log.info(
			`  [${s.type}/${s.period}] ${bar} ${pct}% \u4f7f\u7528 (\u6b8b: ${s.remaining.toLocaleString()}\u5186 / ${s.limit.toLocaleString()}\u5186)`,
		);
	}
}

/** Linter 結果セクション */
function renderLintResults(data: DashboardData): void {
	sectionHeader("\u6700\u8fd1\u306e Linter \u7d50\u679c");
	if (data.recentLintResults.length === 0) {
		p.log.info("  Linter \u5c65\u6b74\u306f\u3042\u308a\u307e\u305b\u3093");
		return;
	}
	for (const r of data.recentLintResults) {
		const icon = VERDICT_ICONS[r.verdict] ?? "";
		const date = r.timestamp.slice(0, 10);
		const actionPreview = r.action.length > 40 ? `${r.action.slice(0, 40)}...` : r.action;
		p.log.info(`  [${date}] ${icon} ${r.verdict} - ${actionPreview}`);
	}
}

/** 提案セクション */
function renderSuggestions(data: DashboardData): void {
	sectionHeader("\u6700\u8fd1\u306e\u63d0\u6848");
	if (data.recentSuggestions.length === 0) {
		p.log.info("  \u63d0\u6848\u5c65\u6b74\u306f\u3042\u308a\u307e\u305b\u3093");
		return;
	}
	for (const s of data.recentSuggestions) {
		const catLabel = CATEGORY_LABELS[s.category ?? "other"] ?? s.category;
		const date = s.createdAt.slice(0, 10);
		p.log.info(`  [${date}] [${catLabel}] ${s.content}`);
	}
}

/** AI 使用量セクション */
function renderAiUsage(
	usage: {
		provider: string;
		totalInputTokens: number;
		totalOutputTokens: number;
		totalCost: number;
		callCount: number;
	}[],
): void {
	sectionHeader("AI \u4f7f\u7528\u91cf");
	if (usage.length === 0) {
		p.log.info("  AI \u4f7f\u7528\u5c65\u6b74\u306f\u3042\u308a\u307e\u305b\u3093");
		return;
	}
	for (const u of usage) {
		const totalTokens = (u.totalInputTokens + u.totalOutputTokens).toLocaleString();
		const cost = u.totalCost.toFixed(4);
		p.log.info(`  [${u.provider}] ${u.callCount}\u56de / ${totalTokens} tokens / $${cost}`);
	}
}

/** 特定推しのダッシュボードを表示 */
function displayDashboard(data: DashboardData): void {
	renderOshiInfo(data);
	renderRecentInfo(data);
	renderBudget(data.budgetSummaries);
	renderLintResults(data);
	renderSuggestions(data);
	renderAiUsage(data.aiUsage);
}

/** 全推しの概要一覧を表示 */
function displayOverview(overview: DashboardOverview): void {
	sectionHeader("\u767b\u9332\u6e08\u307f\u306e\u63a8\u3057");
	if (overview.oshis.length === 0) {
		p.log.info(
			"  \u63a8\u3057\u304c\u767b\u9332\u3055\u308c\u3066\u3044\u307e\u305b\u3093\u3002`oshi add` \u3067\u767b\u9332\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
		);
	} else {
		for (const o of overview.oshis) {
			p.log.info(
				`  ${o.name} (${o.category}) - \u5c5e\u6027:${o.attributeCount}\u4ef6 / \u60c5\u5831:${o.infoCount}\u4ef6`,
			);
		}
	}

	renderBudget(overview.totalBudgetSummaries);
	renderAiUsage(overview.aiUsage);
}

export async function execute(args: string[]): Promise<void> {
	const isStatic = args.includes("--static");
	const filteredArgs = args.filter((a) => a !== "--static");

	// --static フラグなし + 名前指定なし + TTY → TUI 起動
	if (!isStatic && filteredArgs.length === 0 && process.stdout.isTTY) {
		const { renderTui } = await import("../tui/App.js");
		await renderTui();
		return;
	}

	// 従来の静的表示
	p.intro("oshi dashboard \u2014 \u63a8\u3057\u6d3b\u30c0\u30c3\u30b7\u30e5\u30dc\u30fc\u30c9");

	if (!isInitialized()) {
		p.log.error(
			"\u521d\u671f\u5316\u3055\u308c\u3066\u3044\u307e\u305b\u3093\u3002`oshi init` \u3092\u5b9f\u884c\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
		);
		return;
	}

	const db = getDb(getDbPath());
	const repo = new OshiRepository(db);
	const manager = new BudgetManager(db);

	const name = filteredArgs.join(" ").trim();

	if (name) {
		// 特定推しのダッシュボード
		const matches = repo.findByName(name);
		const oshi = matches.find((o) => o.name === name) ?? matches[0];

		if (!oshi) {
			p.log.error(`\u63a8\u3057\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093: ${name}`);
			p.log.info(
				"`oshi list` \u3067\u767b\u9332\u6e08\u307f\u306e\u63a8\u3057\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044",
			);
			return;
		}

		const budgetSummaries = manager.getSummary(oshi.id);
		const data = aggregateDashboard(db, oshi, budgetSummaries);
		displayDashboard(data);
	} else {
		// 全推しの概要
		const allOshis = repo.findAll();
		const budgetSummaries = manager.getSummary();
		const overview = aggregateOverview(db, allOshis, budgetSummaries);
		displayOverview(overview);
	}

	p.outro("");
}

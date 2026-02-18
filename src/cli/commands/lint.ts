import * as p from "@clack/prompts";
import { BudgetManager } from "../../core/budget/manager.js";
import { loadLintConfig } from "../../core/linter/config-loader.js";
import { LinterEngine, type LintResultWithMeta } from "../../core/linter/engine.js";
import { BudgetRule } from "../../core/linter/rules/budget-rule.js";
import { KeywordRule } from "../../core/linter/rules/keyword-rule.js";
import { TimeRule } from "../../core/linter/rules/time-rule.js";
import type { LintContext, LintResult, Verdict } from "../../core/linter/types.js";
import { createProvider } from "../../infrastructure/ai/provider-factory.js";
import type { AIProvider } from "../../infrastructure/ai/types.js";
import { getDbPath, isInitialized } from "../../infrastructure/config/manager.js";
import { getDb } from "../../infrastructure/db/connection.js";
import { logger } from "../../shared/logger.js";

const VERDICT_ICONS: Record<Verdict, string> = {
	PASS: "\u2705",
	WARN: "\u26a0\ufe0f",
	BLOCK: "\ud83d\udeab",
};

const VERDICT_COLORS: Record<Verdict, (s: string) => string> = {
	PASS: (s) => `\x1b[32m${s}\x1b[0m`,
	WARN: (s) => `\x1b[33m${s}\x1b[0m`,
	BLOCK: (s) => `\x1b[31m${s}\x1b[0m`,
};

/** カテゴリの表示名 */
const CATEGORY_LABELS: Record<string, string> = {
	social_risk: "SNS炎上リスク",
	legal_risk: "法的リスク",
	oshi_impact: "推しへの悪影響",
	fan_conflict: "ファン間の軋轢",
	budget_exceeded: "予算超過",
	late_night: "深夜購入",
	inappropriate_keyword: "キーワード",
};

/** LinterEngine を設定付きで構築 */
function createEngine(db: ReturnType<typeof getDb>): LinterEngine {
	const config = loadLintConfig();
	const engine = new LinterEngine(db);

	engine.addRule(new BudgetRule(config.rules["budget-rule"]));
	engine.addRule(new TimeRule(config.rules["time-rule"]));
	engine.addRule(new KeywordRule(config.rules["keyword-rule"]));

	return engine;
}

/** 予算情報を取得 */
function getBudgetInfo(db: ReturnType<typeof getDb>): {
	remaining?: number;
	total?: number;
} {
	const manager = new BudgetManager(db);
	const summaries = manager.getSummary();

	if (summaries.length === 0) return {};

	const oshiMonthly = summaries.find((s) => s.type === "oshi_activity" && s.period === "monthly");
	if (oshiMonthly) return { remaining: oshiMonthly.remaining, total: oshiMonthly.limit };

	return { remaining: summaries[0].remaining, total: summaries[0].limit };
}

/** AI プロバイダーを取得（認証未設定なら null） */
function tryCreateProvider(): AIProvider | null {
	try {
		return createProvider();
	} catch {
		return null;
	}
}

/** 結果を表示 */
function displayResult(result: LintResult, meta?: { layer2Skipped?: boolean }): void {
	const icon = VERDICT_ICONS[result.verdict];
	const color = VERDICT_COLORS[result.verdict];

	p.log.info(`対象: ${result.action}`);
	p.log.info("");

	// 各項目の判定を表示
	if (result.evaluations.length > 0) {
		p.log.info("\x1b[1m--- 項目別判定 ---\x1b[0m");
		for (const evaluation of result.evaluations) {
			const evalIcon = VERDICT_ICONS[evaluation.verdict];
			const evalColor = VERDICT_COLORS[evaluation.verdict];
			const label = CATEGORY_LABELS[evaluation.category] ?? evaluation.category;
			const verdictText = evalColor(evaluation.verdict);
			p.log.info(`  ${evalIcon} ${label}: ${verdictText}`);
			if (evaluation.verdict !== "PASS") {
				p.log.info(`     ${evaluation.message}`);
			}
		}
	} else {
		p.log.info("  チェック項目なし");
	}

	if (meta?.layer2Skipped) {
		p.log.info("");
		p.log.info("  \x1b[2m(AI 評価はスキップされました)\x1b[0m");
	}

	// 総合判定
	p.log.info("");
	p.log.info(`\x1b[1m--- 総合判定 ---\x1b[0m`);
	p.log.info(`  ${icon} ${color(result.verdict)}`);

	if (result.verdict === "BLOCK") {
		p.log.info("  この行動は推奨されません。再検討してください。");
	} else if (result.verdict === "WARN") {
		p.log.info("  注意が必要な点があります。内容を確認してください。");
	} else {
		p.log.info("  問題は検出されませんでした。");
	}
}

export async function execute(args: string[]): Promise<void> {
	p.intro("oshi lint — 推し活 Linter");

	if (!isInitialized()) {
		p.log.error("初期化されていません。`oshi init` を実行してください。");
		return;
	}

	// 引数またはプロンプトから行動テキストを取得
	let action = args.join(" ").trim();
	if (!action) {
		const input = await p.text({
			message: "チェックする行動を入力してください",
			placeholder: "15,000円のグッズを購入する",
			validate: (v) => (v?.trim() === "" ? "行動を入力してください" : undefined),
		});
		if (p.isCancel(input)) {
			p.outro("キャンセルしました");
			return;
		}
		action = input;
	}

	const db = getDb(getDbPath());
	const engine = createEngine(db);

	// コンテキスト構築
	const budgetInfo = getBudgetInfo(db);
	const context: LintContext = {
		budgetRemaining: budgetInfo.remaining,
		budgetTotal: budgetInfo.total,
		now: new Date(),
	};

	// AI プロバイダーを試行
	const provider = tryCreateProvider();

	let result: LintResult;
	let layer2Skipped = false;

	if (provider) {
		// Layer 1 + Layer 2
		const s = p.spinner();
		s.start("AI でリスク評価中...");

		const fullResult: LintResultWithMeta = await engine.evaluateWithAI(action, context, provider);
		layer2Skipped = fullResult.layer2Skipped;
		result = fullResult;

		s.stop("リスク評価完了");
	} else {
		// Layer 1 のみ（AI プロバイダー未設定）
		logger.debug("AI プロバイダーが利用できないため、Layer 1 のみで評価します");
		result = engine.evaluate(action, context);
		layer2Skipped = true;
	}

	// 結果を DB に保存
	engine.saveResult(result);

	// 結果を表示
	displayResult(result, { layer2Skipped });

	p.outro("");
}

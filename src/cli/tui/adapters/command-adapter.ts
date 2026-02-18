import { BudgetManager } from "../../../core/budget/manager.js";
import { collectInfo, getCollectedInfo } from "../../../core/info-collection/collector.js";
import { loadLintConfig } from "../../../core/linter/config-loader.js";
import { LinterEngine } from "../../../core/linter/engine.js";
import { BudgetRule } from "../../../core/linter/rules/budget-rule.js";
import { KeywordRule } from "../../../core/linter/rules/keyword-rule.js";
import { TimeRule } from "../../../core/linter/rules/time-rule.js";
import type { LintContext } from "../../../core/linter/types.js";
import { OshiRepository } from "../../../core/oshi/repository.js";
import type { Oshi } from "../../../core/oshi/types.js";
import { buildProfilePrompt } from "../../../core/profile/prompt-builder.js";
import { ProfileRepository } from "../../../core/profile/repository.js";
import { generateSuggestions, type SuggestContext } from "../../../core/suggest/generator.js";
import { SuggestionRepository } from "../../../core/suggest/repository.js";
import { createProvider } from "../../../infrastructure/ai/provider-factory.js";
import type { AIProvider } from "../../../infrastructure/ai/types.js";
import { getUsageSummary } from "../../../infrastructure/ai/usage-tracker.js";
import { getDbPath } from "../../../infrastructure/config/manager.js";
import { getDb } from "../../../infrastructure/db/connection.js";
import type { PluginOshiContext } from "../../../infrastructure/plugins/base.js";
import { TUI_COMMANDS } from "../commands.js";
import type { CommandResult } from "../types.js";

/** TUI 外専用の対話的コマンド */
const INTERACTIVE_COMMANDS = new Set(["profile edit", "auth"]);

/** TUI 外専用の破壊的コマンド */
const DESTRUCTIVE_COMMANDS = new Set(["init", "reset", "backup restore"]);

/** コマンドを解析して実行（`/` プレフィックス付き入力を想定） */
export async function executeCommand(
	input: string,
	selectedOshi: Oshi | undefined,
): Promise<CommandResult> {
	const trimmed = input.trim();
	if (!trimmed) {
		return { message: "", status: "info" };
	}

	// `/` プレフィックスがない場合はガイダンスを返す
	// （通常は useCommandRunner 側でインテント解析を行うため、ここに来るのはフォールバック）
	if (!trimmed.startsWith("/")) {
		return {
			message: `コマンドは「/」で始めてください。例: /help\n「/help」でコマンド一覧を表示`,
			status: "error",
		};
	}

	// `/` を除去してパース
	const withoutSlash = trimmed.slice(1);
	const parts = withoutSlash.split(/\s+/);
	const cmd = parts[0];
	const args = parts.slice(1);
	const normalized = parts.join(" ");

	// 破壊的コマンドの拒否
	if (DESTRUCTIVE_COMMANDS.has(normalized) || DESTRUCTIVE_COMMANDS.has(cmd)) {
		return {
			message: `「/${cmd}」はTUI内で実行できません。TUIを終了してから「oshi ${normalized}」を実行してください。`,
			status: "info",
		};
	}

	// 対話的コマンドの拒否
	if (INTERACTIVE_COMMANDS.has(normalized) || INTERACTIVE_COMMANDS.has(`${cmd} ${args[0]}`)) {
		return {
			message: `「/${normalized}」は対話的な操作が必要です。Ctrl+C で TUI を終了してから「oshi ${normalized}」を実行してください。`,
			status: "info",
		};
	}

	try {
		switch (cmd) {
			case "collect":
				return await runCollect(selectedOshi, args);
			case "suggest":
				return await runSuggest(selectedOshi, args);
			case "lint":
				return await runLint(args);
			case "budget":
				return runBudgetStatus(selectedOshi);
			case "cost":
				return runCost();
			case "info":
				return runInfo(selectedOshi);
			case "list":
				return runList();
			case "refresh":
			case "r":
				return { message: "データを更新しました", status: "success" };
			case "help":
			case "?":
				return runHelp();
			default:
				return {
					message: `不明なコマンド: /${cmd}\n「/help」でコマンド一覧を表示`,
					status: "error",
				};
		}
	} catch (error) {
		return {
			message: error instanceof Error ? error.message : "予期しないエラーが発生しました",
			status: "error",
		};
	}
}

async function runCollect(selectedOshi: Oshi | undefined, args: string[]): Promise<CommandResult> {
	const db = getDb(getDbPath());
	const repo = new OshiRepository(db);

	// 名前指定があればそちらを使う、なければ選択中の推しを使う
	let oshi = selectedOshi;
	if (args.length > 0) {
		const name = args.filter((a) => !a.startsWith("--")).join(" ");
		if (name) {
			const matches = repo.findByName(name);
			oshi = matches.find((o) => o.name === name) ?? matches[0];
		}
	}

	// 推しが未選択の場合、DB から最初の推しを取得（単一推し運用のフォールバック）
	if (!oshi) {
		const allOshis = repo.findAll();
		oshi = allOshis[0];
	}

	if (!oshi) {
		return { message: "推しが登録されていません。`/add` で登録してください。", status: "error" };
	}

	let provider: AIProvider;
	try {
		provider = createProvider();
	} catch {
		return {
			message: "AI プロバイダーが未設定です。「oshi auth」で認証設定を行ってください。",
			status: "error",
		};
	}

	const attributes = repo.getAttributes(oshi.id);
	const oshiContext: PluginOshiContext = {
		id: oshi.id,
		name: oshi.name,
		category: oshi.category as PluginOshiContext["category"],
		attributes: attributes.map((a) => ({ key: a.key, value: a.value })),
	};

	// --source オプション解析
	let sourcePlugin: string | undefined;
	const sourceIdx = args.indexOf("--source");
	if (sourceIdx !== -1 && args[sourceIdx + 1]) {
		sourcePlugin = args[sourceIdx + 1];
	}

	const result = await collectInfo(db, provider, oshiContext, { maxItems: 10, sourcePlugin });

	if (result.error) {
		return { message: result.error, status: "error" };
	}

	if (result.newItems === 0) {
		return { message: "新しい情報は見つかりませんでした。", status: "info" };
	}

	const details = [
		`自動承認: ${result.approvedItems}件`,
		result.pendingItems > 0 ? `承認待ち: ${result.pendingItems}件` : "",
		result.rejectedItems > 0 ? `自動却下: ${result.rejectedItems}件` : "",
	]
		.filter(Boolean)
		.join("、");

	let message = `${result.newItems} 件の新しい情報を収集しました（${details}）`;
	if (result.skippedDuplicates > 0) {
		message += `\n重複スキップ: ${result.skippedDuplicates}件`;
	}
	if (result.pendingItems > 0) {
		message += "\n承認待ちの情報があります。「oshi review」で確認してください。";
	}

	return { message, status: "success" };
}

async function runSuggest(selectedOshi: Oshi | undefined, args: string[]): Promise<CommandResult> {
	const db = getDb(getDbPath());
	const repo = new OshiRepository(db);

	let oshi = selectedOshi;
	if (args.length > 0) {
		const name = args.filter((a) => !a.startsWith("--")).join(" ");
		if (name) {
			const matches = repo.findByName(name);
			oshi = matches.find((o) => o.name === name) ?? matches[0];
		}
	}

	// 推しが未選択の場合、DB から最初の推しを取得（単一推し運用のフォールバック）
	if (!oshi) {
		const allOshis = repo.findAll();
		oshi = allOshis[0];
	}

	if (!oshi) {
		return { message: "推しが登録されていません。`/add` で登録してください。", status: "error" };
	}

	let provider: AIProvider;
	try {
		provider = createProvider();
	} catch {
		return {
			message: "AI プロバイダーが未設定です。「oshi auth」で認証設定を行ってください。",
			status: "error",
		};
	}

	// 予算情報
	const manager = new BudgetManager(db);
	const summaries = manager.getSummary();
	const oshiMonthly = summaries.find((s) => s.type === "oshi_activity" && s.period === "monthly");
	const budgetRemaining = oshiMonthly?.remaining;
	const budgetTotal = oshiMonthly?.limit;

	// コンテキスト構築
	const attributes = repo.getAttributes(oshi.id);
	const recentInfo = getCollectedInfo(db, oshi.id, { limit: 5 });
	const suggestContext: SuggestContext = {
		oshiName: oshi.name,
		oshiCategory: oshi.category,
		oshiDescription: oshi.description,
		attributes: attributes.map((a) => ({ key: a.key, value: a.value })),
		recentInfo: recentInfo.map((i) => ({
			title: i.title,
			summary: i.summary,
			publishedAt: i.publishedAt ?? null,
			eventDate: i.eventDate ?? null,
		})),
		budgetRemaining,
		budgetTotal,
	};

	const profileRepo = new ProfileRepository(db);
	const userProfile = profileRepo.get();
	const profilePrompt = userProfile ? buildProfilePrompt(userProfile) : undefined;

	const generated = await generateSuggestions(provider, suggestContext, 3, profilePrompt);

	if (generated.length === 0) {
		return { message: "提案を生成できませんでした。", status: "info" };
	}

	// Linter で検証 + DB 保存
	const engine = createLinterEngine(db);
	const lintContext: LintContext = {
		budgetRemaining,
		budgetTotal,
		now: new Date(),
	};
	const suggestionRepo = new SuggestionRepository(db);

	const lines: string[] = [];
	for (const suggestion of generated) {
		const suggestionId = suggestionRepo.save(oshi.id, suggestion, suggestContext);
		const lintResult = await engine.evaluateWithAI(suggestion.content, lintContext, provider);
		engine.saveResult(lintResult, suggestionId);

		const verdictIcon =
			lintResult.verdict === "PASS"
				? "\u2705"
				: lintResult.verdict === "WARN"
					? "\u26a0\ufe0f"
					: "\ud83d\udeab";
		lines.push(`${verdictIcon} [${suggestion.category}] ${suggestion.content}`);
	}

	return { message: lines.join("\n"), status: "success" };
}

async function runLint(args: string[]): Promise<CommandResult> {
	const action = args.join(" ").trim();
	if (!action) {
		return {
			message: "チェックする行動を引数で指定してください。例: /lint グッズを購入する",
			status: "info",
		};
	}

	const db = getDb(getDbPath());
	const engine = createLinterEngine(db);

	const manager = new BudgetManager(db);
	const summaries = manager.getSummary();
	const oshiMonthly = summaries.find((s) => s.type === "oshi_activity" && s.period === "monthly");

	const context: LintContext = {
		budgetRemaining: oshiMonthly?.remaining,
		budgetTotal: oshiMonthly?.limit,
		now: new Date(),
	};

	let provider: AIProvider | null;
	try {
		provider = createProvider();
	} catch {
		provider = null;
	}

	const result = provider
		? await engine.evaluateWithAI(action, context, provider)
		: engine.evaluate(action, context);

	engine.saveResult(result);

	const categoryLabels: Record<string, string> = {
		social_risk: "SNS炎上リスク",
		legal_risk: "法的リスク",
		oshi_impact: "推しへの悪影響",
		fan_conflict: "ファン間の軋轢",
		budget_exceeded: "予算超過",
		late_night: "深夜購入",
		inappropriate_keyword: "キーワード",
	};

	const verdictIcon =
		result.verdict === "PASS"
			? "\u2705"
			: result.verdict === "WARN"
				? "\u26a0\ufe0f"
				: "\ud83d\udeab";

	const lines: string[] = [];
	lines.push("--- 項目別判定 ---");
	if (result.evaluations.length > 0) {
		for (const ev of result.evaluations) {
			const evalIcon =
				ev.verdict === "PASS" ? "\u2705" : ev.verdict === "WARN" ? "\u26a0\ufe0f" : "\ud83d\udeab";
			const label = categoryLabels[ev.category] ?? ev.category;
			lines.push(`  ${evalIcon} ${label}: ${ev.verdict}`);
			if (ev.verdict !== "PASS") {
				lines.push(`     ${ev.message}`);
			}
		}
	} else {
		lines.push("  チェック項目なし");
	}
	lines.push("");
	lines.push("--- 総合判定 ---");
	lines.push(`  ${verdictIcon} ${result.verdict}: ${action}`);

	return { message: lines.join("\n"), status: result.verdict === "PASS" ? "success" : "info" };
}

function runBudgetStatus(selectedOshi: Oshi | undefined): CommandResult {
	const db = getDb(getDbPath());

	// 推しが未選択の場合、DB から最初の推しを取得
	let oshi = selectedOshi;
	if (!oshi) {
		const repo = new OshiRepository(db);
		const allOshis = repo.findAll();
		oshi = allOshis[0];
	}

	const manager = new BudgetManager(db);
	const summaries = manager.getSummary(oshi?.id);

	if (summaries.length === 0) {
		return { message: "「/budget set」で月間予算を設定できます。", status: "info" };
	}

	const lines = summaries.map((s) => {
		const pct = Math.round(s.usageRate * 100);
		return `[${s.type}/${s.period}] ${pct}% 使用 (残: ${s.remaining.toLocaleString()}円 / ${s.limit.toLocaleString()}円)`;
	});

	return { message: lines.join("\n"), status: "success" };
}

function runCost(): CommandResult {
	const summaries = getUsageSummary();

	if (summaries.length === 0) {
		return {
			message: "/collect や /suggest を実行すると AI 使用履歴が記録されます。",
			status: "info",
		};
	}

	const lines = summaries.map((s) => {
		const totalTokens = (s.totalInputTokens + s.totalOutputTokens).toLocaleString();
		return `[${s.provider}] ${s.count}回 / ${totalTokens} tokens / $${s.totalCost.toFixed(4)}`;
	});

	return { message: lines.join("\n"), status: "success" };
}

function runInfo(selectedOshi: Oshi | undefined): CommandResult {
	const db = getDb(getDbPath());

	// 推しが未選択の場合、DB から最初の推しを取得
	let oshi = selectedOshi;
	if (!oshi) {
		const repo = new OshiRepository(db);
		const allOshis = repo.findAll();
		oshi = allOshis[0];
	}

	if (!oshi) {
		return { message: "推しが登録されていません。`/add` で登録してください。", status: "error" };
	}

	const items = getCollectedInfo(db, oshi.id, { limit: 10 });

	if (items.length === 0) {
		const pendingItems = getCollectedInfo(db, oshi.id, {
			limit: 1,
			approvalStatuses: ["pending"],
		});
		if (pendingItems.length > 0) {
			return {
				message:
					"承認済みの情報はありません。承認待ちの情報があります。「oshi review」で確認してください。",
				status: "info",
			};
		}
		return { message: "/collect で推しの最新情報を収集できます。", status: "info" };
	}

	const lines = items.map((info) => {
		const date = (info.publishedAt ?? info.collectedAt).slice(0, 10);
		const eventMark = info.eventDate ? ` [${info.eventDate}]` : "";
		return `[${date}] ${info.title}${eventMark}${info.summary ? `\n  ${info.summary}` : ""}`;
	});

	return { message: lines.join("\n"), status: "success" };
}

function runList(): CommandResult {
	const db = getDb(getDbPath());
	const repo = new OshiRepository(db);
	const allOshis = repo.findAll();

	if (allOshis.length === 0) {
		return { message: "/add で推しを登録できます。", status: "info" };
	}

	const lines = allOshis.map((o, i) => `${i + 1}. ${o.name} (${o.category})`);
	return { message: lines.join("\n"), status: "success" };
}

function runHelp(): CommandResult {
	const lines = ["利用可能なコマンド:"];
	for (const cmd of TUI_COMMANDS) {
		const nameWithArgs = cmd.args ? `${cmd.name} ${cmd.args}` : cmd.name;
		lines.push(`  ${nameWithArgs.padEnd(22)} — ${cmd.description}`);
	}
	lines.push("", "キーバインド:");
	lines.push("  Tab                  — 推し切替（複数登録時）");
	lines.push("  Ctrl+C               — TUI を終了");
	return { message: lines.join("\n"), status: "info" };
}

function createLinterEngine(db: ReturnType<typeof getDb>): LinterEngine {
	const config = loadLintConfig();
	const engine = new LinterEngine(db);
	engine.addRule(new BudgetRule(config.rules["budget-rule"]));
	engine.addRule(new TimeRule(config.rules["time-rule"]));
	engine.addRule(new KeywordRule(config.rules["keyword-rule"]));
	return engine;
}

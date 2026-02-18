import * as p from "@clack/prompts";
import { BudgetManager } from "../../core/budget/manager.js";
import { getCollectedInfo } from "../../core/info-collection/collector.js";
import { loadLintConfig } from "../../core/linter/config-loader.js";
import { LinterEngine } from "../../core/linter/engine.js";
import { BudgetRule } from "../../core/linter/rules/budget-rule.js";
import { KeywordRule } from "../../core/linter/rules/keyword-rule.js";
import { TimeRule } from "../../core/linter/rules/time-rule.js";
import type { LintContext, Verdict } from "../../core/linter/types.js";
import { OshiRepository } from "../../core/oshi/repository.js";
import type { Oshi } from "../../core/oshi/types.js";
import { buildProfilePrompt } from "../../core/profile/prompt-builder.js";
import { ProfileRepository } from "../../core/profile/repository.js";
import {
	type GeneratedSuggestion,
	generateSuggestions,
	type SuggestContext,
} from "../../core/suggest/generator.js";
import { SuggestionRepository } from "../../core/suggest/repository.js";
import { createProvider } from "../../infrastructure/ai/provider-factory.js";
import type { AIProvider } from "../../infrastructure/ai/types.js";
import { getDbPath, isInitialized } from "../../infrastructure/config/manager.js";
import { getDb } from "../../infrastructure/db/connection.js";
import { notifyLintWarning } from "../../infrastructure/notifications/discord.js";

const VERDICT_ICONS: Record<Verdict, string> = {
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

/** 推しを名前で解決（完全一致優先、複数候補時は undefined） */
function resolveOshi(db: ReturnType<typeof getDb>, name: string): Oshi | undefined {
	const repo = new OshiRepository(db);
	const matches = repo.findByName(name);

	// 完全一致を優先
	const exactMatch = matches.find((o) => o.name === name);
	if (exactMatch) return exactMatch;

	// 部分一致が複数ある場合は曖昧なため undefined
	if (matches.length !== 1) return undefined;

	return matches[0];
}

/** 予算情報を取得 */
function getBudgetInfo(db: ReturnType<typeof getDb>): {
	remaining?: number;
	total?: number;
} {
	const manager = new BudgetManager(db);
	const summaries = manager.getSummary();
	if (summaries.length === 0) return {};

	// 推し活月次予算を最優先
	const oshiMonthly = summaries.find((s) => s.type === "oshi_activity" && s.period === "monthly");
	if (oshiMonthly) return { remaining: oshiMonthly.remaining, total: oshiMonthly.limit };

	// 推し活予算があれば任意の期間を使う
	const anyOshi = summaries.find((s) => s.type === "oshi_activity");
	if (anyOshi) return { remaining: anyOshi.remaining, total: anyOshi.limit };

	// 推し活予算が未設定なら予算なしとして扱う
	return {};
}

/** LinterEngine を構築 */
function createEngine(db: ReturnType<typeof getDb>): LinterEngine {
	const config = loadLintConfig();
	const engine = new LinterEngine(db);
	engine.addRule(new BudgetRule(config.rules["budget-rule"]));
	engine.addRule(new TimeRule(config.rules["time-rule"]));
	engine.addRule(new KeywordRule(config.rules["keyword-rule"]));
	return engine;
}

/** 提案コンテキストを構築 */
function buildSuggestContext(
	db: ReturnType<typeof getDb>,
	oshi: Oshi,
	budgetInfo: { remaining?: number; total?: number },
): SuggestContext {
	const repo = new OshiRepository(db);
	const attributes = repo.getAttributes(oshi.id);
	const recentInfo = getCollectedInfo(db, oshi.id, { limit: 5 });

	return {
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
		budgetRemaining: budgetInfo.remaining,
		budgetTotal: budgetInfo.total,
	};
}

/** 提案を表示 */
function displaySuggestion(index: number, suggestion: GeneratedSuggestion, verdict: Verdict): void {
	const catLabel = CATEGORY_LABELS[suggestion.category] ?? suggestion.category;
	const verdictIcon = VERDICT_ICONS[verdict];

	p.log.info(`\n${index + 1}. [${catLabel}] ${verdictIcon} ${verdict}`);
	p.log.info(`   ${suggestion.content}`);
	p.log.info(`   \u2192 ${suggestion.reason}`);
}

/** --history: 過去の提案履歴を表示 */
function showHistory(db: ReturnType<typeof getDb>, oshiId: string): void {
	const repo = new SuggestionRepository(db);
	const history = repo.findByOshiId(oshiId, { limit: 10 });

	if (history.length === 0) {
		p.log.info("過去の提案はありません");
		return;
	}

	for (const item of history) {
		const catLabel = CATEGORY_LABELS[item.category ?? "other"] ?? item.category;
		const date = item.createdAt.slice(0, 10);
		p.log.info(`[${date}] [${catLabel}] ${item.content}`);
	}
}

export async function execute(args: string[]): Promise<void> {
	p.intro("oshi suggest \u2014 \u63a8\u3057\u6d3b\u884c\u52d5\u63d0\u6848");

	if (!isInitialized()) {
		p.log.error(
			"\u521d\u671f\u5316\u3055\u308c\u3066\u3044\u307e\u305b\u3093\u3002`oshi init` \u3092\u5b9f\u884c\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
		);
		return;
	}

	const isHistory = args.includes("--history");
	const nameArgs = args.filter((a) => a !== "--history");
	let name = nameArgs.join(" ").trim();

	if (!name) {
		const input = await p.text({
			message:
				"\u63a8\u3057\u306e\u540d\u524d\u3092\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044",
			validate: (v) =>
				v?.trim() === ""
					? "\u540d\u524d\u3092\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044"
					: undefined,
		});
		if (p.isCancel(input)) {
			p.outro("\u30ad\u30e3\u30f3\u30bb\u30eb\u3057\u307e\u3057\u305f");
			return;
		}
		name = input;
	}

	const db = getDb(getDbPath());
	const oshi = resolveOshi(db, name);

	if (!oshi) {
		p.log.error(`\u63a8\u3057\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093: ${name}`);
		p.log.info(
			"`oshi list` \u3067\u767b\u9332\u6e08\u307f\u306e\u63a8\u3057\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044",
		);
		return;
	}

	// --history モード
	if (isHistory) {
		p.log.info(`${oshi.name} \u306e\u63d0\u6848\u5c65\u6b74:`);
		showHistory(db, oshi.id);
		p.outro("");
		return;
	}

	// AI プロバイダーを取得
	let provider: AIProvider;
	try {
		provider = createProvider();
	} catch {
		p.log.error(
			"AI \u30d7\u30ed\u30d0\u30a4\u30c0\u30fc\u304c\u8a2d\u5b9a\u3055\u308c\u3066\u3044\u307e\u305b\u3093\u3002`oshi auth` \u3067\u8a8d\u8a3c\u3092\u8a2d\u5b9a\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
		);
		return;
	}

	// コンテキスト構築
	const budgetInfo = getBudgetInfo(db);
	const suggestContext = buildSuggestContext(db, oshi, budgetInfo);

	// プロファイルプロンプトの取得
	const profileRepo = new ProfileRepository(db);
	const userProfile = profileRepo.get();
	const profilePrompt = userProfile ? buildProfilePrompt(userProfile) : undefined;

	// 提案生成
	const s = p.spinner();
	s.start(`${oshi.name} \u306e\u884c\u52d5\u63d0\u6848\u3092\u751f\u6210\u4e2d...`);

	let generatedSuggestions: GeneratedSuggestion[];
	try {
		generatedSuggestions = await generateSuggestions(provider, suggestContext, 3, profilePrompt);
	} catch (error) {
		s.stop("\u63d0\u6848\u751f\u6210\u306b\u5931\u6557\u3057\u307e\u3057\u305f");
		p.log.error(
			error instanceof Error ? error.message : "\u4e88\u671f\u3057\u306a\u3044\u30a8\u30e9\u30fc",
		);
		return;
	}

	s.stop(
		`${generatedSuggestions.length} \u4ef6\u306e\u63d0\u6848\u3092\u751f\u6210\u3057\u307e\u3057\u305f`,
	);

	if (generatedSuggestions.length === 0) {
		p.log.info(
			"\u63d0\u6848\u3092\u751f\u6210\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f\u3002\u5225\u306e\u6761\u4ef6\u3067\u518d\u5ea6\u304a\u8a66\u3057\u304f\u3060\u3055\u3044\u3002",
		);
		p.outro("");
		return;
	}

	// Linter で自動検証 + DB 保存
	const engine = createEngine(db);
	const lintContext: LintContext = {
		budgetRemaining: budgetInfo.remaining,
		budgetTotal: budgetInfo.total,
		now: new Date(),
	};

	const suggestionRepo = new SuggestionRepository(db);
	const notificationPromises: Promise<void>[] = [];

	p.log.info(`\n${oshi.name} \u3078\u306e\u884c\u52d5\u63d0\u6848:`);

	for (let i = 0; i < generatedSuggestions.length; i++) {
		const suggestion = generatedSuggestions[i];

		// DB に提案を保存
		const suggestionId = suggestionRepo.save(oshi.id, suggestion, suggestContext);

		// Linter で検証
		const lintResult = await engine.evaluateWithAI(suggestion.content, lintContext, provider);

		// Linter 結果を DB に保存（提案と紐付け）
		engine.saveResult(lintResult, suggestionId);

		// 表示
		displaySuggestion(i, suggestion, lintResult.verdict);

		if (lintResult.evaluations.length > 0) {
			for (const evaluation of lintResult.evaluations) {
				const evalIcon = VERDICT_ICONS[evaluation.verdict];
				const ruleLabel =
					evaluation.ruleId === "llm-evaluator" ? `AI:${evaluation.category}` : evaluation.ruleId;
				p.log.info(`     ${evalIcon} [${ruleLabel}] ${evaluation.message}`);
			}
		}

		// WARN/BLOCK の場合は Discord 通知（並列実行用に収集）
		if (lintResult.verdict === "WARN" || lintResult.verdict === "BLOCK") {
			notificationPromises.push(
				notifyLintWarning(
					oshi.name,
					suggestion.content,
					lintResult.verdict,
					lintResult.evaluations.map((e) => ({ ruleId: e.ruleId, message: e.message })),
				),
			);
		}
	}

	// 通知をまとめて並列送信
	await Promise.allSettled(notificationPromises);

	p.outro("");
}

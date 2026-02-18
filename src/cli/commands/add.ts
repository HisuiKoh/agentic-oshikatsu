import * as p from "@clack/prompts";
import { collectInfo } from "../../core/info-collection/collector.js";
import { getUnavailableButRelevantPlugins } from "../../core/info-collection/plugin-loader.js";
import {
	analyzeOshi,
	analyzeOshiWithContext,
	identifyOshiCandidates,
	isAIAvailable,
	type OshiAnalysis,
	type OshiCandidateAI,
} from "../../core/oshi/analyzer.js";
import { type OshiCandidate, searchCandidates } from "../../core/oshi/identifier.js";
import { type CreateOshiInput, OshiRepository } from "../../core/oshi/repository.js";
import type { Oshi } from "../../core/oshi/types.js";
import { CATEGORY_LABELS, OSHI_CATEGORIES, type OshiCategory } from "../../core/oshi/types.js";
import { createProvider } from "../../infrastructure/ai/provider-factory.js";
import type { AIProvider } from "../../infrastructure/ai/types.js";
import { getDbPath, isInitialized } from "../../infrastructure/config/manager.js";
import type { AppDatabase } from "../../infrastructure/db/connection.js";
import { getDb } from "../../infrastructure/db/connection.js";
import type { PluginOshiContext } from "../../infrastructure/plugins/base.js";
import { setupExternalApiFlow } from "./auth.js";

const NONE_VALUE = "__none__" as const;
type AiSelectValue = OshiCandidateAI | typeof NONE_VALUE;

/** AI 候補選択の結果 */
interface IdentifyCandidateResult {
	candidates: OshiCandidate[];
	/** AI 候補選択時に追加されるコンテキスト */
	additionalContext?: string;
}

/** Phase 1: 外部検索で推し候補を特定 */
async function identifyCandidate(
	name: string,
	provider: AIProvider | null,
	userContext: string,
): Promise<IdentifyCandidateResult> {
	const s = p.spinner();
	s.start("推しを特定中...");

	const candidates = await searchCandidates(name);
	s.stop(
		candidates.length > 0
			? `${candidates.length} 件の候補が見つかりました`
			: "外部情報が見つかりませんでした",
	);

	if (candidates.length === 0) {
		// AI 候補生成
		if (provider) {
			const aiResult = await tryAiCandidates(provider, name, userContext);
			if (aiResult) return aiResult;
		}
		return { candidates: [] };
	}

	if (candidates.length === 1) {
		const candidate = candidates[0];
		p.note(
			`${candidate.title}\n${candidate.snippet.slice(0, 200)}${candidate.snippet.length > 200 ? "..." : ""}\nソース: Web 検索`,
			"見つかった情報",
		);

		const accept = await p.confirm({
			message: "この情報を分析に使用しますか？",
			initialValue: true,
		});

		if (p.isCancel(accept)) return { candidates: [] };
		return { candidates: accept ? [candidate] : [] };
	}

	// 複数候補 → p.multiselect（複数選択で情報をマージ）
	const options: Array<{ value: OshiCandidate; label: string; hint: string }> = candidates.map(
		(c) => ({
			value: c,
			label: c.title,
			hint: `${c.snippet.slice(0, 60)}...`,
		}),
	);

	const selected = await p.multiselect({
		message: "推しに該当する候補を選んでください（複数選択可、スペースで選択）",
		options,
		required: false,
	});

	if (p.isCancel(selected)) return { candidates: [] };

	return { candidates: selected as OshiCandidate[] };
}

/** AI による候補生成と選択 */
async function tryAiCandidates(
	provider: AIProvider,
	name: string,
	userContext: string,
): Promise<IdentifyCandidateResult | null> {
	const s = p.spinner();
	s.start("AI が候補を推測中...");

	try {
		const result = await identifyOshiCandidates(provider, name, userContext);
		s.stop(`AI が ${result.candidates.length} 件の候補を生成しました`);

		if (result.confident && result.candidates.length === 1) {
			// AI が確信 → 確認
			const c = result.candidates[0];
			p.note(`${c.interpretation}\n${c.brief}\nソース: AI 推測`, "AI が特定した候補");

			const accept = await p.confirm({
				message: "この候補で合っていますか？",
				initialValue: true,
			});

			if (p.isCancel(accept)) return { candidates: [] };
			if (accept) {
				return {
					candidates: [],
					additionalContext: `[AI特定] ${c.interpretation}: ${c.brief}`,
				};
			}
			// 拒否 → 手動モードに委ねる
			return null;
		}

		// 複数候補 or 確信なし → 選択
		const aiOptions: Array<{ value: AiSelectValue; label: string; hint: string }> = [
			...result.candidates.map((c) => ({
				value: c as AiSelectValue,
				label: c.interpretation,
				hint: c.brief,
			})),
			{ value: NONE_VALUE, label: "該当なし（手動で登録する）", hint: "" },
		];

		const selected = await p.select({
			message: "AI が推測した候補から選んでください",
			options: aiOptions,
		});

		if (p.isCancel(selected)) return { candidates: [] };
		if (selected === NONE_VALUE) return null;

		const selectedCandidate = selected as OshiCandidateAI;
		return {
			candidates: [],
			additionalContext: `[AI特定] ${selectedCandidate.interpretation}: ${selectedCandidate.brief}`,
		};
	} catch {
		s.stop("AI 候補生成に失敗しました");
		return null;
	}
}

/** AI モードで推しを登録 */
async function addWithAI(
	provider: AIProvider,
	prefillName?: string,
): Promise<CreateOshiInput | null> {
	let name: string;
	let userContext = "";

	if (prefillName) {
		name = prefillName;
		p.log.info(`推し: ${name}`);
	} else {
		const nameInput = await p.text({
			message: "推しの名前は？",
			placeholder: "例: 杵月のあ",
			validate: (value) => {
				if (!value?.trim()) return "名前を入力してください";
				if (value.trim().length > 100) return "名前は100文字以内で入力してください";
			},
		});

		if (p.isCancel(nameInput)) return null;
		name = nameInput.trim();

		const context = await p.text({
			message: "推しについて何か教えてください（任意）",
			placeholder: "例: 歌がうまい VTuber、毎週配信を見てる",
			defaultValue: "",
			validate: (value) => {
				if (value && value.trim().length > 500) return "コメントは500文字以内で入力してください";
			},
		});

		if (p.isCancel(context)) return null;
		userContext = context?.trim() ?? "";
	}

	// Phase 1: 外部検索で推し候補を特定
	const identifyResult = await identifyCandidate(name, provider, userContext);

	// AI 候補で追加コンテキストがある場合はマージ
	const effectiveContext = identifyResult.additionalContext
		? [userContext, identifyResult.additionalContext].filter(Boolean).join("\n")
		: userContext;

	// Phase 2: AI 分析
	const s = p.spinner();
	s.start("AI が推しを分析中...");

	let analysis: OshiAnalysis;
	try {
		if (identifyResult.candidates.length > 0) {
			// 複数候補の extract をマージして渡す
			const mergedExtract = identifyResult.candidates
				.map((c, i) =>
					identifyResult.candidates.length > 1
						? `[情報源${i + 1}: ${c.title}]\n${c.extract}`
						: c.extract,
				)
				.join("\n\n");
			analysis = await analyzeOshiWithContext(provider, name, effectiveContext, mergedExtract);
		} else {
			analysis = await analyzeOshi(provider, name, effectiveContext);
		}
		s.stop("分析完了");
	} catch (error) {
		s.stop("AI 分析に失敗しました");
		p.log.warn(error instanceof Error ? error.message : "AI からの応答を処理できませんでした");
		p.log.info("手動モードに切り替えます");
		return addManual(name, userContext || undefined);
	}

	// AI の分析結果を確認
	p.note(
		[
			`カテゴリ: ${CATEGORY_LABELS[analysis.category]}`,
			`説明: ${analysis.description}`,
			analysis.attributes.length > 0
				? `属性: ${analysis.attributes.map((a) => `${a.key}=${a.value}`).join(", ")}`
				: "",
		]
			.filter(Boolean)
			.join("\n"),
		"AI の分析結果",
	);

	const accept = await p.confirm({
		message: "この内容で登録しますか？",
		initialValue: true,
	});

	if (p.isCancel(accept)) return null;

	if (!accept) {
		p.log.info("手動モードに切り替えます");
		return addManual(name, userContext || undefined);
	}

	return {
		name,
		category: analysis.category,
		description: analysis.description,
		attributes: analysis.attributes.length > 0 ? analysis.attributes : undefined,
	};
}

/** 手動モードで推しを登録（M1 のフォールバック） */
async function addManual(
	prefillName?: string,
	prefillDescription?: string,
): Promise<CreateOshiInput | null> {
	let name = prefillName;
	if (!name) {
		const input = await p.text({
			message: "推しの名前は？",
			placeholder: "例: 杵月のあ",
			validate: (value) => {
				if (!value?.trim()) return "名前を入力してください";
			},
		});
		if (p.isCancel(input)) return null;
		name = input.trim();
	}

	const categoryOptions = OSHI_CATEGORIES.map((cat) => ({
		value: cat,
		label: CATEGORY_LABELS[cat],
	}));

	const categoryResult = await p.select({
		message: "カテゴリを選択してください",
		options: categoryOptions,
	});

	if (p.isCancel(categoryResult)) return null;
	const category = categoryResult;

	const description = await p.text({
		message: "推しの説明（任意）",
		placeholder: "例: 歌とトークが魅力の VTuber",
		defaultValue: prefillDescription ?? "",
	});

	if (p.isCancel(description)) return null;

	const attributes: Array<{ key: string; value: string }> = [];
	const wantAttributes = await p.confirm({
		message: "追加の属性を登録しますか？（誕生日、グループ名など）",
		initialValue: false,
	});

	if (p.isCancel(wantAttributes)) return null;

	if (wantAttributes) {
		let addMore = true;
		while (addMore) {
			const key = await p.text({
				message: "属性名",
				placeholder: "例: birthday, group, agency",
			});
			if (p.isCancel(key)) break;

			const value = await p.text({
				message: `${key} の値`,
			});
			if (p.isCancel(value)) break;

			attributes.push({ key: key.trim(), value: value.trim() });

			const more = await p.confirm({
				message: "さらに属性を追加しますか？",
				initialValue: false,
			});
			if (p.isCancel(more) || !more) {
				addMore = false;
			}
		}
	}

	return {
		name,
		category,
		description: description.trim() || undefined,
		attributes: attributes.length > 0 ? attributes : undefined,
	};
}

/** DB 保存後に未設定の外部 API を検出し、設定を促す */
async function checkAndPromptApiSetup(oshi: Oshi): Promise<void> {
	const oshiContext: PluginOshiContext = {
		id: oshi.id,
		name: oshi.name,
		category: oshi.category as PluginOshiContext["category"],
		attributes: [],
	};

	const unavailable = getUnavailableButRelevantPlugins(oshiContext);
	if (unavailable.length === 0) return;

	const names = unavailable.map((plugin) => plugin.name).join("、");
	p.log.warn(`${names} の API Key が未設定のため、情報収集が限定されます。`);

	const setup = await p.confirm({
		message: "今すぐ API 連携を設定しますか？（後から `oshi auth` でも設定できます）",
		initialValue: false,
	});

	if (p.isCancel(setup) || !setup) return;

	// 未設定が 1 種類ならその API を直接指定（冗長な選択画面を省く）
	const pluginIdToApiType: Record<string, "youtube" | "x"> = {
		youtube: "youtube",
		x: "x",
	};
	const targetApi = unavailable.length === 1 ? pluginIdToApiType[unavailable[0].id] : undefined;
	await setupExternalApiFlow(targetApi);
}

/** 登録直後の初期情報収集 */
async function runInitialCollect(
	db: AppDatabase,
	repo: OshiRepository,
	oshi: Oshi,
	provider: AIProvider,
): Promise<void> {
	const shouldCollect = await p.confirm({
		message: `${oshi.name} の最新情報を今すぐ収集しますか？（Wikipedia・YouTube・ニュース等）`,
		initialValue: true,
	});

	if (p.isCancel(shouldCollect) || !shouldCollect) return;

	const attributes = repo.getAttributes(oshi.id);
	const oshiContext: PluginOshiContext = {
		id: oshi.id,
		name: oshi.name,
		category: oshi.category as PluginOshiContext["category"],
		attributes: attributes.map((a) => ({ key: a.key, value: a.value })),
	};

	const s = p.spinner();
	s.start(`${oshi.name} の情報を収集中...`);

	try {
		const result = await collectInfo(db, provider, oshiContext, { maxItems: 10 });
		s.stop("初期情報収集完了");

		if (result.error) {
			p.log.warn(result.error);
		} else if (result.newItems === 0) {
			p.log.info("情報源が見つかりませんでした。");
			if (!oshi.description) {
				const desc = await p.text({
					message: `${oshi.name} について簡単に教えてください（後から追加も可）`,
					placeholder: "例: 歌がうまい VTuber、毎週配信を見てる",
					defaultValue: "",
				});
				if (!p.isCancel(desc) && desc?.trim()) {
					repo.update(oshi.id, { description: desc.trim() });
					p.log.success("説明を追加しました");
				}
			}
			p.log.info("後から `oshi collect` で再試行できます。");
		} else {
			p.log.success(`${result.newItems} 件の情報を収集しました`);
		}
	} catch (error) {
		s.stop("情報収集に失敗しました");
		p.log.warn(error instanceof Error ? error.message : "情報収集中にエラーが発生しました");
		p.log.info("後から `oshi collect` で再試行できます。");
	}
}

export async function execute(args: string[]): Promise<void> {
	p.intro("oshi add — 推しを登録");

	if (!isInitialized()) {
		p.log.error("初期化されていません。先に `oshi init` を実行してください。");
		return;
	}

	const nameTokens = args.filter((a) => !a.startsWith("-"));
	const nameArg = nameTokens.length > 0 ? nameTokens.join(" ").trim() : undefined;
	let input: CreateOshiInput | null;

	if (isAIAvailable()) {
		const provider = createProvider();
		input = await addWithAI(provider, nameArg);
	} else {
		p.log.info("AI が利用できません。手動モードで登録します。（`oshi auth` で AI を設定できます）");
		input = await addManual(nameArg);
	}

	if (!input) {
		p.outro("キャンセルしました");
		return;
	}

	const db = getDb(getDbPath());
	const repo = new OshiRepository(db);

	const oshi = repo.create(input);

	p.note(
		[
			`名前: ${oshi.name}`,
			`カテゴリ: ${CATEGORY_LABELS[oshi.category as OshiCategory]}`,
			oshi.description ? `説明: ${oshi.description}` : "",
			input.attributes && input.attributes.length > 0
				? `属性: ${input.attributes.map((a) => `${a.key}=${a.value}`).join(", ")}`
				: "",
		]
			.filter(Boolean)
			.join("\n"),
		"登録完了",
	);

	// API 連携チェック
	await checkAndPromptApiSetup(oshi);

	// AI が使える場合は初期情報収集を提案
	if (isAIAvailable()) {
		await runInitialCollect(db, repo, oshi, createProvider());
	}

	p.log.info("");
	p.log.info("次にできること:");
	p.log.info(`  oshi collect ${oshi.name}    — ${oshi.name} の最新情報を収集`);
	p.log.info(`  oshi info ${oshi.name}       — 収集した情報を確認`);
	p.log.info(`  oshi suggest ${oshi.name}    — AI が推し活の行動を提案`);
	p.log.info(`  oshi dashboard ${oshi.name}  — 推し活ダッシュボード`);
	p.log.info(`  oshi budget set              — 推し活予算を設定`);
	p.log.info(`  oshi lint "行動"              — 行動のリスクをチェック`);

	p.outro(`${oshi.name} を登録しました！`);
}

import { Select, TextInput } from "@inkjs/ui";
import { Box, Text, useInput } from "ink";
import { useEffect, useRef, useState } from "react";
import { getUnavailableButRelevantPlugins } from "../../../core/info-collection/plugin-loader.js";
import {
	analyzeOshi,
	analyzeOshiWithContext,
	identifyOshiCandidates,
	type OshiAnalysis,
	type OshiCandidateAI,
} from "../../../core/oshi/analyzer.js";
import { type OshiCandidate, searchCandidates } from "../../../core/oshi/identifier.js";
import { type CreateOshiInput, OshiRepository } from "../../../core/oshi/repository.js";
import type { Oshi } from "../../../core/oshi/types.js";
import { CATEGORY_LABELS, OSHI_CATEGORIES, type OshiCategory } from "../../../core/oshi/types.js";
import { createProvider } from "../../../infrastructure/ai/provider-factory.js";
import type { AIProvider } from "../../../infrastructure/ai/types.js";
import { getDbPath } from "../../../infrastructure/config/manager.js";
import { getDb } from "../../../infrastructure/db/connection.js";
import type { InfoCollectorPlugin } from "../../../infrastructure/plugins/base.js";
import { useOshiriSpinner } from "../hooks/useOshiriSpinner.js";
import { MultiCheckSelect } from "./MultiCheckSelect.js";
import { SetupExternalApiFlow } from "./SetupExternalApiFlow.js";

type FlowStep =
	| "name"
	| "context"
	| "identifying"
	| "candidate-select"
	| "candidate-selected"
	| "candidate-confirm"
	| "ai-candidate-select"
	| "analyzing"
	| "confirm"
	| "manual-category"
	| "manual-description"
	| "manual-attr-ask"
	| "manual-attr-key"
	| "manual-attr-value"
	| "saving"
	| "api-check"
	| "api-setup"
	| "done";

const NONE_VALUE = "__none__" as const;

interface AddOshiFlowProps {
	onComplete: (oshi: Oshi) => void;
	onCancel: () => void;
	prefillName?: string;
}

export function AddOshiFlow({ onComplete, onCancel, prefillName }: AddOshiFlowProps) {
	const [step, setStep] = useState<FlowStep>(prefillName ? "identifying" : "name");
	const [name, setName] = useState(prefillName ?? "");
	const [context, setContext] = useState("");
	const [analysis, setAnalysis] = useState<OshiAnalysis | null>(null);
	const [error, setError] = useState("");

	// Phase 1: 候補
	const [candidates, setCandidates] = useState<OshiCandidate[]>([]);
	const [selectedCandidate, setSelectedCandidate] = useState<OshiCandidate | null>(null);
	const [selectedCandidates, setSelectedCandidates] = useState<OshiCandidate[]>([]);

	// AI 候補
	const [aiCandidates, setAiCandidates] = useState<OshiCandidateAI[]>([]);

	// ローディング進捗メッセージ
	const [loadingMessage, setLoadingMessage] = useState("");

	// 手動モード用
	const [category, setCategory] = useState<OshiCategory>("other");
	const [description, setDescription] = useState("");
	const [attributes, setAttributes] = useState<Array<{ key: string; value: string }>>([]);
	const [currentAttrKey, setCurrentAttrKey] = useState("");

	// AI プロバイダー（useRef で保持し、setState の非同期性によるバグを防ぐ）
	const aiProviderRef = useRef<AIProvider | null>(null);

	// 結果
	const [registeredOshi, setRegisteredOshi] = useState<Oshi | null>(null);

	// API 連携チェック
	const [unavailablePlugins, setUnavailablePlugins] = useState<InfoCollectorPlugin[]>([]);

	// おしりスピナー
	const spinner = useOshiriSpinner();

	// Esc 無効のステップ（保存中・完了後のみ）
	const escDisabledSteps = new Set<FlowStep>(["saving", "done"]);

	// 処理中断用フラグ
	const cancelledRef = useRef(false);

	// Esc キーでキャンセル（保存中・完了後以外）
	useInput((_input, key) => {
		if (key.escape && !escDisabledSteps.has(step)) {
			cancelledRef.current = true;
			onCancel();
		}
	});

	// candidate-selected → analyzing への自動遷移
	// biome-ignore lint/correctness/useExhaustiveDependencies: step の変化時のみ発火。関数を deps に入れると無限ループする
	useEffect(() => {
		if (step !== "candidate-selected") return;

		const selected = selectedCandidates;
		if (selected.length > 0) {
			const titles = selected.map((c) => c.title).join("、");
			const msg =
				selected.length > 1
					? `${selected.length} 件の情報を統合して分析中... (${titles})`
					: `「${titles}」の情報をもとに分析中...`;
			runAnalysis(selected, undefined, msg);
		} else {
			runAnalysis(null);
		}
	}, [step]);

	// prefillName が渡された場合、マウント時に即座に Phase 1 開始
	// biome-ignore lint/correctness/useExhaustiveDependencies: マウント時のみ発火
	useEffect(() => {
		if (!prefillName) return;

		let provider: AIProvider;
		try {
			provider = createProvider();
		} catch {
			setStep("manual-category");
			return;
		}
		aiProviderRef.current = provider;

		runIdentification(prefillName);
	}, [prefillName]);

	/** Phase 1: 外部検索で候補を特定 */
	const runIdentification = async (searchName: string) => {
		setStep("identifying");
		setError("");
		setLoadingMessage(`「${searchName}」を Web で検索中...`);

		const results = await searchCandidates(searchName);
		if (cancelledRef.current) return;
		setCandidates(results);

		if (results.length === 0) {
			// 候補なし → AI 候補生成
			const provider = aiProviderRef.current;
			if (!provider) {
				setStep("manual-category");
				return;
			}
			try {
				setLoadingMessage("Web で見つからなかったため、AI が候補を推測中...");
				const result = await identifyOshiCandidates(provider, searchName, context);
				if (cancelledRef.current) return;
				setAiCandidates(result.candidates);
				if (result.confident && result.candidates.length === 1) {
					// AI が確信 → 確認ステップ（AI 候補を Web 候補と同じ形式で表示）
					const c = result.candidates[0];
					setSelectedCandidate({
						source: "ai",
						title: c.interpretation,
						snippet: c.brief,
						extract: c.brief,
						url: "",
					});
					setStep("candidate-confirm");
				} else {
					// 複数候補 or 確信なし → AI 候補選択
					setStep("ai-candidate-select");
				}
			} catch {
				// AI 候補生成失敗 → 従来通り AI フォールバック
				runAnalysis(null);
			}
		} else if (results.length === 1) {
			// 1 件 → 確認ステップ
			setSelectedCandidate(results[0]);
			setStep("candidate-confirm");
		} else {
			// 複数 → 選択ステップ
			setStep("candidate-select");
		}
	};

	/** Phase 2: AI 分析（複数候補のマージ対応） */
	const runAnalysis = async (
		candidateOrCandidates: OshiCandidate | OshiCandidate[] | null,
		overrideContext?: string,
		customLoadingMessage?: string,
	) => {
		setStep("analyzing");
		setError("");
		setLoadingMessage(customLoadingMessage ?? `「${name}」を AI が分析中...`);

		const selected = Array.isArray(candidateOrCandidates)
			? candidateOrCandidates
			: candidateOrCandidates
				? [candidateOrCandidates]
				: [];
		setSelectedCandidate(selected[0] ?? null);

		const provider = aiProviderRef.current;
		if (!provider) {
			setError("AI プロバイダーが初期化されていません");
			setStep("manual-category");
			return;
		}

		const effectiveContext = overrideContext ?? context;

		try {
			let result: OshiAnalysis;
			const webCandidates = selected.filter((c) => c.source === "web");
			if (webCandidates.length > 0) {
				const mergedExtract = webCandidates
					.map((c, i) =>
						webCandidates.length > 1 ? `[情報源${i + 1}: ${c.title}]\n${c.extract}` : c.extract,
					)
					.join("\n\n");
				result = await analyzeOshiWithContext(provider, name, effectiveContext, mergedExtract);
			} else {
				result = await analyzeOshi(provider, name, effectiveContext);
			}
			if (cancelledRef.current) return;
			setAnalysis(result);
			setStep("confirm");
		} catch (e) {
			setError(e instanceof Error ? e.message : "AI 分析に失敗しました");
			setStep("manual-category");
		}
	};

	const handleNameSubmit = (value: string) => {
		const trimmed = value.trim();
		if (!trimmed) return;
		if (trimmed.length > 100) return;
		setName(trimmed);

		try {
			const provider = createProvider();
			aiProviderRef.current = provider;
			setStep("context");
		} catch {
			setStep("manual-category");
		}
	};

	const handleContextSubmit = async (value: string) => {
		const trimmed = value.trim();
		setContext(trimmed);
		runIdentification(name);
	};

	/** 候補 1 件の確認 */
	const handleCandidateConfirm = (value: string) => {
		if (value === "yes") {
			const msg = selectedCandidate
				? `「${selectedCandidate.title}」の情報をもとに分析中...`
				: undefined;
			runAnalysis(selectedCandidate, undefined, msg);
		} else {
			// 拒否 → AI フォールバック
			runAnalysis(null);
		}
	};

	/** 複数候補の選択（MultiSelect の onSubmit） */
	const handleCandidateSelect = (values: string[]) => {
		// 「該当なし」が含まれていたら排他的に扱う
		if (values.length === 0 || values.includes(NONE_VALUE)) {
			setSelectedCandidates([]);
			setStep("candidate-selected");
			return;
		}
		const selected = values.map((v) => candidates[Number.parseInt(v, 10)]).filter(Boolean);
		setSelectedCandidates(selected);
		setStep("candidate-selected");
	};

	/** AI 候補の選択 */
	const handleAiCandidateSelect = (value: string) => {
		if (value === NONE_VALUE) {
			setStep("manual-category");
			return;
		}
		const idx = Number.parseInt(value, 10);
		const candidate = aiCandidates[idx];
		if (candidate) {
			// 選択された AI 候補の情報を context に追加して analyzeOshi に渡す
			const enrichedContext = [context, `[AI特定] ${candidate.interpretation}: ${candidate.brief}`]
				.filter(Boolean)
				.join("\n");
			setContext(enrichedContext);
			runAnalysis(null, enrichedContext);
		} else {
			setStep("manual-category");
		}
	};

	const handleConfirm = (value: string) => {
		if (!analysis) {
			onCancel();
			return;
		}
		if (value === "accept") {
			saveOshi({
				name,
				category: analysis.category,
				description: analysis.description,
				attributes: analysis.attributes.length > 0 ? analysis.attributes : undefined,
			});
		} else if (value === "manual") {
			setCategory(analysis.category);
			setDescription(analysis.description);
			setAttributes(analysis.attributes);
			setStep("manual-category");
		} else {
			onCancel();
		}
	};

	const handleCategorySelect = (value: string) => {
		setCategory(value as OshiCategory);
		setStep("manual-description");
	};

	const handleDescriptionSubmit = (value: string) => {
		setDescription(value.trim());
		setStep("manual-attr-ask");
	};

	const handleAttrAsk = (value: string) => {
		if (value === "yes") {
			setStep("manual-attr-key");
		} else {
			saveOshi({
				name,
				category,
				description: description || undefined,
				attributes: attributes.length > 0 ? attributes : undefined,
			});
		}
	};

	const handleAttrKeySubmit = (value: string) => {
		const trimmed = value.trim();
		if (!trimmed) {
			saveOshi({
				name,
				category,
				description: description || undefined,
				attributes: attributes.length > 0 ? attributes : undefined,
			});
			return;
		}
		setCurrentAttrKey(trimmed);
		setStep("manual-attr-value");
	};

	const handleAttrValueSubmit = (value: string) => {
		const trimmed = value.trim();
		if (!trimmed) return;
		setAttributes((prev) => [...prev, { key: currentAttrKey, value: trimmed }]);
		setCurrentAttrKey("");
		setStep("manual-attr-key");
	};

	const saveOshi = (input: CreateOshiInput) => {
		setStep("saving");
		try {
			const db = getDb(getDbPath());
			const repo = new OshiRepository(db);
			const oshi = repo.create(input);
			setRegisteredOshi(oshi);

			// API 連携チェック
			const unavailable = getUnavailableButRelevantPlugins({
				id: oshi.id,
				name: oshi.name,
				category: oshi.category as OshiCategory,
				attributes: [],
			});

			if (unavailable.length > 0) {
				setUnavailablePlugins(unavailable);
				setStep("api-check");
			} else {
				setStep("done");
				onComplete(oshi);
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : "登録に失敗しました");
			setStep("manual-category");
		}
	};

	const handleApiCheckSelect = (value: string) => {
		if (value === "setup") {
			setStep("api-setup");
		} else if (registeredOshi) {
			setStep("done");
			onComplete(registeredOshi);
		}
	};

	const handleApiSetupComplete = () => {
		if (!registeredOshi) return;
		setStep("done");
		onComplete(registeredOshi);
	};

	const handleApiSetupCancel = () => {
		if (!registeredOshi) return;
		setStep("done");
		onComplete(registeredOshi);
	};

	const categoryOptions = OSHI_CATEGORIES.map((cat) => ({
		value: cat,
		label: CATEGORY_LABELS[cat],
	}));

	return (
		<Box flexDirection="column" paddingX={1} gap={1}>
			<Box>
				<Text bold color="cyan">
					推しを登録
				</Text>
				<Text dimColor> (Esc でキャンセル)</Text>
			</Box>

			{error && (
				<Box>
					<Text color="red">{error}</Text>
				</Box>
			)}

			{/* Step: 名前入力 */}
			{step === "name" && (
				<Box flexDirection="column">
					<Box marginBottom={1}>
						<Text>推しの名前は？</Text>
					</Box>
					<Box>
						<Text color="cyan">{">"} </Text>
						<TextInput placeholder="例: 杵月のあ" onSubmit={handleNameSubmit} />
					</Box>
				</Box>
			)}

			{/* Step: コンテキスト入力 (AI モード) */}
			{step === "context" && (
				<Box flexDirection="column">
					<Box marginBottom={1}>
						<Text>
							<Text bold>{name}</Text> について何か教えてください（任意、Enter でスキップ）
						</Text>
					</Box>
					<Box>
						<Text color="cyan">{">"} </Text>
						<TextInput
							placeholder="例: 歌がうまい VTuber、毎週配信を見てる"
							onSubmit={handleContextSubmit}
						/>
					</Box>
				</Box>
			)}

			{/* Step: Phase 1 — 推し特定中 */}
			{step === "identifying" && (
				<Box flexDirection="column">
					<Box>
						<Text color="yellow">
							{spinner} {loadingMessage || "推しを特定中..."}
						</Text>
					</Box>
				</Box>
			)}

			{/* Step: 候補 1 件の確認 */}
			{step === "candidate-confirm" && selectedCandidate && (
				<Box flexDirection="column">
					<Box flexDirection="column" borderStyle="round" borderColor="blue" paddingX={1}>
						<Text bold>見つかった情報</Text>
						<Text>{selectedCandidate.title}</Text>
						<Text dimColor>
							{selectedCandidate.snippet.slice(0, 200)}
							{selectedCandidate.snippet.length > 200 ? "..." : ""}
						</Text>
						<Text dimColor>
							ソース: {selectedCandidate.source === "web" ? "Web 検索" : "AI 推測"}
						</Text>
					</Box>
					<Box marginTop={1}>
						<Select
							options={[
								{ label: "この情報を分析に使用する", value: "yes" },
								{ label: "使用しない（AI に分析を任せる）", value: "no" },
							]}
							onChange={handleCandidateConfirm}
						/>
					</Box>
				</Box>
			)}

			{/* Step: 複数候補の選択 */}
			{step === "candidate-select" && candidates.length > 0 && (
				<Box flexDirection="column">
					<Box marginBottom={1}>
						<Text>
							{candidates.length} 件の候補が見つかりました。推しに該当するものを選んでください
						</Text>
					</Box>
					<MultiCheckSelect
						hint="スペースで選択/解除、Enter で確定（複数選択可）"
						options={[
							...candidates.map((c, i) => ({
								label: `${c.title} — ${c.snippet.slice(0, 50)}...`,
								value: String(i),
							})),
							{ label: "該当なし（AI に分析を任せる）", value: NONE_VALUE },
						]}
						onSubmit={handleCandidateSelect}
					/>
				</Box>
			)}

			{/* Step: 候補選択確定 → 分析開始の中間表示 */}
			{step === "candidate-selected" && (
				<Box flexDirection="column">
					{selectedCandidates.length > 0 ? (
						<Box flexDirection="column">
							{selectedCandidates.map((c) => (
								<Text key={c.title} color="green">
									✔ {c.title}
								</Text>
							))}
						</Box>
					) : (
						<Text dimColor>✔ 該当なし（AI に分析を任せる）</Text>
					)}
					<Box marginTop={1}>
						<Text color="yellow">
							{spinner}{" "}
							{selectedCandidates.length > 1
								? `${selectedCandidates.length} 件の情報を統合して分析を開始します...`
								: "分析を開始します..."}
						</Text>
					</Box>
				</Box>
			)}

			{/* Step: AI 候補の選択 */}
			{step === "ai-candidate-select" && aiCandidates.length > 0 && (
				<Box flexDirection="column">
					<Box marginBottom={1}>
						<Text>
							Web で情報が見つかりませんでした。AI が候補を推測しました。どれが該当しますか？
						</Text>
					</Box>
					<Select
						options={[
							...aiCandidates.map((c, i) => ({
								label: `${c.interpretation} — ${c.brief}`,
								value: String(i),
							})),
							{ label: "該当なし（手動で登録する）", value: NONE_VALUE },
						]}
						onChange={handleAiCandidateSelect}
					/>
				</Box>
			)}

			{/* Step: AI 分析中 */}
			{step === "analyzing" && (
				<Box flexDirection="column">
					{selectedCandidates.length > 1 && (
						<Box flexDirection="column" marginBottom={1}>
							<Text dimColor>選択した情報源:</Text>
							{selectedCandidates.map((c) => (
								<Text key={c.title} dimColor>
									{" "}
									- {c.title}
								</Text>
							))}
						</Box>
					)}
					<Box>
						<Text color="yellow">
							{spinner} {loadingMessage || "AI が推しを分析中..."}
						</Text>
					</Box>
				</Box>
			)}

			{/* Step: AI 分析結果確認 */}
			{step === "confirm" && analysis && (
				<Box flexDirection="column">
					<Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={1}>
						<Text bold>AI の分析結果</Text>
						<Text>カテゴリ: {CATEGORY_LABELS[analysis.category]}</Text>
						<Text>説明: {analysis.description}</Text>
						{analysis.attributes.length > 0 && (
							<Text>属性: {analysis.attributes.map((a) => `${a.key}=${a.value}`).join(", ")}</Text>
						)}
					</Box>
					<Box marginTop={1}>
						<Select
							options={[
								{ label: "この内容で登録する", value: "accept" },
								{ label: "手動で修正する", value: "manual" },
								{ label: "キャンセル", value: "cancel" },
							]}
							onChange={handleConfirm}
						/>
					</Box>
				</Box>
			)}

			{/* Step: カテゴリ選択 (手動モード) */}
			{step === "manual-category" && (
				<Box flexDirection="column">
					<Box marginBottom={1}>
						<Text>
							<Text bold>{name}</Text> のカテゴリを選択してください:
						</Text>
					</Box>
					<Select options={categoryOptions} onChange={handleCategorySelect} />
				</Box>
			)}

			{/* Step: 説明入力 (手動モード) */}
			{step === "manual-description" && (
				<Box flexDirection="column">
					<Box marginBottom={1}>
						<Text>推しの説明（任意、Enter でスキップ）</Text>
					</Box>
					<Box>
						<Text color="cyan">{">"} </Text>
						<TextInput
							placeholder="例: 歌とトークが魅力の VTuber"
							defaultValue={description}
							onSubmit={handleDescriptionSubmit}
						/>
					</Box>
				</Box>
			)}

			{/* Step: 属性追加確認 */}
			{step === "manual-attr-ask" && (
				<Box flexDirection="column">
					{attributes.length > 0 && (
						<Box marginBottom={1}>
							<Text dimColor>
								登録済み属性: {attributes.map((a) => `${a.key}=${a.value}`).join(", ")}
							</Text>
						</Box>
					)}
					<Box marginBottom={1}>
						<Text>属性を追加しますか？（誕生日、グループ名など）</Text>
					</Box>
					<Select
						options={[
							{ label: "追加する", value: "yes" },
							{ label: "追加しない（登録に進む）", value: "no" },
						]}
						onChange={handleAttrAsk}
					/>
				</Box>
			)}

			{/* Step: 属性キー入力 */}
			{step === "manual-attr-key" && (
				<Box flexDirection="column">
					{attributes.length > 0 && (
						<Box marginBottom={1}>
							<Text dimColor>
								登録済み属性: {attributes.map((a) => `${a.key}=${a.value}`).join(", ")}
							</Text>
						</Box>
					)}
					<Box marginBottom={1}>
						<Text>属性名（空 Enter で完了）:</Text>
					</Box>
					<Box>
						<Text color="cyan">{">"} </Text>
						<TextInput placeholder="例: birthday, group, agency" onSubmit={handleAttrKeySubmit} />
					</Box>
				</Box>
			)}

			{/* Step: 属性値入力 */}
			{step === "manual-attr-value" && (
				<Box flexDirection="column">
					<Box marginBottom={1}>
						<Text>
							<Text bold>{currentAttrKey}</Text> の値:
						</Text>
					</Box>
					<Box>
						<Text color="cyan">{">"} </Text>
						<TextInput placeholder="" onSubmit={handleAttrValueSubmit} />
					</Box>
				</Box>
			)}

			{/* Step: 保存中 */}
			{step === "saving" && (
				<Box>
					<Text color="yellow">{spinner} 登録中...</Text>
				</Box>
			)}

			{/* Step: API 連携チェック */}
			{step === "api-check" && registeredOshi && (
				<Box flexDirection="column">
					<Box borderStyle="round" borderColor="green" paddingX={1} flexDirection="column">
						<Text color="green" bold>
							{registeredOshi.name} を登録しました!
						</Text>
					</Box>
					<Box marginTop={1}>
						<Text color="yellow">
							{unavailablePlugins.map((p) => p.name).join("、")} の API Key
							が未設定のため、情報収集が限定されます。
						</Text>
					</Box>
					<Box marginTop={1}>
						<Select
							options={[
								{ label: "スキップ（後から /auth で設定可）", value: "skip" },
								{ label: "今すぐ設定する", value: "setup" },
							]}
							onChange={handleApiCheckSelect}
						/>
					</Box>
				</Box>
			)}

			{/* Step: 外部 API 設定フロー */}
			{step === "api-setup" && (
				<SetupExternalApiFlow onComplete={handleApiSetupComplete} onCancel={handleApiSetupCancel} />
			)}

			{/* Step: 完了 */}
			{step === "done" && registeredOshi && (
				<Box flexDirection="column">
					<Box borderStyle="round" borderColor="green" paddingX={1} flexDirection="column">
						<Text color="green" bold>
							{registeredOshi.name} を登録しました!
						</Text>
						<Text>カテゴリ: {CATEGORY_LABELS[registeredOshi.category as OshiCategory]}</Text>
						{registeredOshi.description && <Text>説明: {registeredOshi.description}</Text>}
					</Box>
					<Box marginTop={1}>
						<Text dimColor>`/collect` コマンドで情報収集できます。ダッシュボードに戻ります...</Text>
					</Box>
				</Box>
			)}
		</Box>
	);
}

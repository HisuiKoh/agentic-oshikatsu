import { Box, Text, useApp, useInput } from "ink";
import { useCallback } from "react";
import type { Oshi } from "../../../core/oshi/types.js";
import { useCommandRunner } from "../hooks/useCommandRunner.js";
import { useDashboardData } from "../hooks/useDashboardData.js";
import type { TuiAction, TuiState } from "../types.js";
import { AddOshiFlow } from "./AddOshiFlow.js";
import { AiUsagePanel } from "./AiUsagePanel.js";
import { BudgetAddFlow } from "./BudgetAddFlow.js";
import { BudgetPanel } from "./BudgetPanel.js";
import { BudgetSetFlow } from "./BudgetSetFlow.js";
import { CommandInput } from "./CommandInput.js";
import { CommandLog } from "./CommandLog.js";
import { InfoPanel } from "./InfoPanel.js";
import { LintPanel } from "./LintPanel.js";
import { OshiPanel } from "./OshiPanel.js";
import { StatusBar } from "./StatusBar.js";
import { SuggestPanel } from "./SuggestPanel.js";

interface DashboardProps {
	state: TuiState;
	dispatch: React.Dispatch<TuiAction>;
}

export function Dashboard({ state, dispatch }: DashboardProps) {
	const { exit } = useApp();

	const selectedOshi = state.oshiList[state.selectedOshiIndex];
	const { refresh } = useDashboardData({
		selectedOshiIndex: state.selectedOshiIndex,
		dispatch,
	});

	const { run } = useCommandRunner({
		selectedOshi,
		dispatch,
		onRefresh: refresh,
		onExit: () => exit(),
	});

	// キーバインド（特殊キーのみ。コマンドは全て /command 形式で入力）
	useInput((_input, key) => {
		if (state.activeFlow !== null) return;
		if (key.tab && state.oshiList.length > 1) {
			const next = (state.selectedOshiIndex + 1) % state.oshiList.length;
			dispatch({ type: "SELECT_OSHI", index: next });
			return;
		}
	});

	const handleCommand = useCallback(
		(value: string) => {
			run(value);
		},
		[run],
	);

	const handleAddComplete = useCallback(
		(_oshi: Oshi) => {
			dispatch({ type: "SET_ACTIVE_FLOW", flow: null });
			refresh();
		},
		[dispatch, refresh],
	);

	const handleAddCancel = useCallback(() => {
		dispatch({ type: "SET_ACTIVE_FLOW", flow: null });
	}, [dispatch]);

	const handleBudgetFlowComplete = useCallback(() => {
		dispatch({ type: "SET_ACTIVE_FLOW", flow: null });
		refresh();
	}, [dispatch, refresh]);

	const handleBudgetFlowCancel = useCallback(() => {
		dispatch({ type: "SET_ACTIVE_FLOW", flow: null });
	}, [dispatch]);

	const { dashboardData, overview } = state;

	// フロー表示中
	if (state.activeFlow === "add-oshi") {
		return (
			<AddOshiFlow
				onComplete={handleAddComplete}
				onCancel={handleAddCancel}
				prefillName={state.addPrefillName}
			/>
		);
	}
	if (state.activeFlow === "budget-set") {
		return (
			<BudgetSetFlow onComplete={handleBudgetFlowComplete} onCancel={handleBudgetFlowCancel} />
		);
	}
	if (state.activeFlow === "budget-add") {
		return (
			<BudgetAddFlow onComplete={handleBudgetFlowComplete} onCancel={handleBudgetFlowCancel} />
		);
	}

	// 推し未登録時
	if (state.oshiList.length === 0 && overview) {
		return (
			<Box flexDirection="column" gap={1}>
				<Box borderStyle="round" borderColor="yellow" paddingX={1} flexDirection="column">
					<Text color="yellow">推しが登録されていません。</Text>
					<Text color="yellow">「/add」コマンドで推しを登録できます。</Text>
				</Box>

				{overview.aiUsage.length > 0 && <AiUsagePanel usage={overview.aiUsage} />}
				{overview.totalBudgetSummaries.length > 0 && (
					<BudgetPanel summaries={overview.totalBudgetSummaries} />
				)}

				<CommandLog entries={state.commandLog} />
				<CommandInput onSubmit={handleCommand} isRunning={state.isRunning} />
				<StatusBar oshiName={undefined} oshiCount={0} />
			</Box>
		);
	}

	// 通常ダッシュボード
	return (
		<Box flexDirection="column">
			{dashboardData && (
				<Box flexDirection="row">
					{/* 左カラム */}
					<Box flexDirection="column" width="50%">
						<OshiPanel oshi={dashboardData.oshi} />
						<BudgetPanel summaries={dashboardData.budgetSummaries} />
						<AiUsagePanel usage={dashboardData.aiUsage} />
					</Box>

					{/* 右カラム */}
					<Box flexDirection="column" width="50%">
						<InfoPanel items={dashboardData.recentInfo} />
						<SuggestPanel suggestions={dashboardData.recentSuggestions} />
						<LintPanel results={dashboardData.recentLintResults} />
					</Box>
				</Box>
			)}

			{!dashboardData && (
				<Box paddingX={1}>
					<Text dimColor>データを読み込み中...</Text>
				</Box>
			)}

			<CommandLog entries={state.commandLog} />
			<CommandInput onSubmit={handleCommand} isRunning={state.isRunning} />
			<StatusBar oshiName={selectedOshi?.name} oshiCount={state.oshiList.length} />
		</Box>
	);
}

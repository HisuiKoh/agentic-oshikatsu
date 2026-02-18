import { Select, TextInput } from "@inkjs/ui";
import { Box, Text, useInput } from "ink";
import { useCallback, useEffect, useState } from "react";
import { BudgetManager } from "../../../core/budget/manager.js";
import {
	BUDGET_PERIOD_LABELS,
	BUDGET_TYPE_LABELS,
	type BudgetPeriod,
	type BudgetType,
} from "../../../core/budget/types.js";
import { getDbPath } from "../../../infrastructure/config/manager.js";
import { getDb } from "../../../infrastructure/db/connection.js";

type FlowStep = "type-select" | "period-select" | "amount-input" | "done";

interface BudgetSetFlowProps {
	onComplete: () => void;
	onCancel: () => void;
}

export function BudgetSetFlow({ onComplete, onCancel }: BudgetSetFlowProps) {
	const [step, setStep] = useState<FlowStep>("type-select");
	const [budgetType, setBudgetType] = useState<BudgetType>("oshi_activity");
	const [period, setPeriod] = useState<BudgetPeriod>("monthly");
	const [error, setError] = useState("");

	useInput((_input, key) => {
		if (key.escape && step !== "done") {
			onCancel();
		}
	});

	// 成功後 2 秒で完了
	useEffect(() => {
		if (step === "done") {
			const timer = setTimeout(onComplete, 2000);
			return () => clearTimeout(timer);
		}
	}, [step, onComplete]);

	const typeOptions = [
		{ label: BUDGET_TYPE_LABELS.oshi_activity, value: "oshi_activity" },
		{ label: BUDGET_TYPE_LABELS.ai_api, value: "ai_api" },
		{ label: BUDGET_TYPE_LABELS.external_api, value: "external_api" },
	];

	const periodOptions = [
		{ label: BUDGET_PERIOD_LABELS.monthly, value: "monthly" },
		{ label: BUDGET_PERIOD_LABELS.weekly, value: "weekly" },
		{ label: BUDGET_PERIOD_LABELS.daily, value: "daily" },
	];

	const handleTypeSelect = useCallback((value: string) => {
		setBudgetType(value as BudgetType);
		setStep("period-select");
	}, []);

	const handlePeriodSelect = useCallback((value: string) => {
		setPeriod(value as BudgetPeriod);
		setStep("amount-input");
	}, []);

	const handleAmountSubmit = useCallback(
		(value: string) => {
			const parsed = Number(value);
			if (!Number.isInteger(parsed) || parsed <= 0) {
				setError("正の整数を入力してください");
				return;
			}
			setError("");

			try {
				const manager = new BudgetManager(getDb(getDbPath()));
				manager.setLimit({
					type: budgetType,
					period,
					limit: parsed,
					currency: "JPY",
				});
				setStep("done");
			} catch {
				setError("保存に失敗しました。もう一度お試しください。");
			}
		},
		[budgetType, period],
	);

	return (
		<Box flexDirection="column" gap={1} paddingX={1}>
			<Text bold color="cyan">
				予算上限設定
			</Text>
			<Text dimColor>Esc でキャンセル</Text>

			{error && <Text color="red">{error}</Text>}

			{step === "type-select" && (
				<Box flexDirection="column">
					<Text>予算タイプを選択:</Text>
					<Select options={typeOptions} onChange={handleTypeSelect} />
				</Box>
			)}

			{step === "period-select" && (
				<Box flexDirection="column">
					<Text>
						タイプ: <Text color="green">{BUDGET_TYPE_LABELS[budgetType]}</Text>
					</Text>
					<Text>期間を選択:</Text>
					<Select options={periodOptions} onChange={handlePeriodSelect} />
				</Box>
			)}

			{step === "amount-input" && (
				<Box flexDirection="column">
					<Text>
						タイプ: <Text color="green">{BUDGET_TYPE_LABELS[budgetType]}</Text> / 期間:{" "}
						<Text color="green">{BUDGET_PERIOD_LABELS[period]}</Text>
					</Text>
					<Text>上限金額（円）を入力:</Text>
					<TextInput onSubmit={handleAmountSubmit} placeholder="例: 10000" />
				</Box>
			)}

			{step === "done" && (
				<Text color="green">
					{BUDGET_TYPE_LABELS[budgetType]}（{BUDGET_PERIOD_LABELS[period]}）の上限を設定しました。
				</Text>
			)}
		</Box>
	);
}

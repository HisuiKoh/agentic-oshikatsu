import { Select, TextInput } from "@inkjs/ui";
import { Box, Text, useInput } from "ink";
import { useCallback, useEffect, useRef, useState } from "react";
import { BudgetManager } from "../../../core/budget/manager.js";
import { BUDGET_TYPE_LABELS, type BudgetType } from "../../../core/budget/types.js";
import { getDbPath } from "../../../infrastructure/config/manager.js";
import { getDb } from "../../../infrastructure/db/connection.js";

type FlowStep = "type-select" | "amount-input" | "description-input" | "done";

interface BudgetAddFlowProps {
	onComplete: () => void;
	onCancel: () => void;
}

export function BudgetAddFlow({ onComplete, onCancel }: BudgetAddFlowProps) {
	const [step, setStep] = useState<FlowStep>("type-select");
	const [budgetType, setBudgetType] = useState<BudgetType>("oshi_activity");
	const amountRef = useRef(0);
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

	// ai_api は除外（syncAiCosts で自動同期されるため）
	const typeOptions = [
		{ label: BUDGET_TYPE_LABELS.oshi_activity, value: "oshi_activity" },
		{ label: BUDGET_TYPE_LABELS.external_api, value: "external_api" },
	];

	const handleTypeSelect = useCallback((value: string) => {
		setBudgetType(value as BudgetType);
		setStep("amount-input");
	}, []);

	const handleAmountSubmit = useCallback((value: string) => {
		const parsed = Number(value);
		if (!Number.isInteger(parsed) || parsed <= 0) {
			setError("正の整数を入力してください");
			return;
		}
		setError("");
		amountRef.current = parsed;
		setStep("description-input");
	}, []);

	const handleDescriptionSubmit = useCallback(
		(value: string) => {
			try {
				const manager = new BudgetManager(getDb(getDbPath()));
				manager.addEntry({
					type: budgetType,
					amount: amountRef.current,
					currency: "JPY",
					description: value.trim() || null,
					date: new Date().toISOString().split("T")[0],
				});
				setStep("done");
			} catch {
				setError("保存に失敗しました。もう一度お試しください。");
			}
		},
		[budgetType],
	);

	return (
		<Box flexDirection="column" gap={1} paddingX={1}>
			<Text bold color="cyan">
				支出記録
			</Text>
			<Text dimColor>Esc でキャンセル</Text>

			{error && <Text color="red">{error}</Text>}

			{step === "type-select" && (
				<Box flexDirection="column">
					<Text>支出タイプを選択:</Text>
					<Select options={typeOptions} onChange={handleTypeSelect} />
				</Box>
			)}

			{step === "amount-input" && (
				<Box flexDirection="column">
					<Text>
						タイプ: <Text color="green">{BUDGET_TYPE_LABELS[budgetType]}</Text>
					</Text>
					<Text>金額（円）を入力:</Text>
					<TextInput onSubmit={handleAmountSubmit} placeholder="例: 3000" />
				</Box>
			)}

			{step === "description-input" && (
				<Box flexDirection="column">
					<Text>
						タイプ: <Text color="green">{BUDGET_TYPE_LABELS[budgetType]}</Text> / 金額:{" "}
						<Text color="green">{amountRef.current.toLocaleString()}円</Text>
					</Text>
					<Text>説明（任意、Enter でスキップ）:</Text>
					<TextInput onSubmit={handleDescriptionSubmit} placeholder="例: ライブチケット" />
				</Box>
			)}

			{step === "done" && (
				<Text color="green">
					{BUDGET_TYPE_LABELS[budgetType]} の支出 {amountRef.current.toLocaleString()}円
					を記録しました。
				</Text>
			)}
		</Box>
	);
}

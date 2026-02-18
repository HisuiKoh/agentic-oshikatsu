import { Select, TextInput } from "@inkjs/ui";
import { Box, Text } from "ink";
import { useState } from "react";
import { maskApiKey } from "../../../infrastructure/auth/detector.js";
import { validateExternalApiToken } from "../../../infrastructure/auth/external-api-validator.js";
import type { ExternalApiType } from "../../../infrastructure/auth/types.js";
import { updateConfig } from "../../../infrastructure/config/manager.js";
import { useOshiriSpinner } from "../hooks/useOshiriSpinner.js";

type Step = "select-api" | "input-token" | "validating" | "success" | "error";

interface SetupExternalApiFlowProps {
	onComplete: () => void;
	onCancel: () => void;
}

const API_LABELS: Record<ExternalApiType, string> = {
	youtube: "YouTube API Key",
	x: "X (Twitter) Bearer Token",
};

const API_PLACEHOLDERS: Record<ExternalApiType, string> = {
	youtube: "AIza...",
	x: "AAAA...",
};

export function SetupExternalApiFlow({ onComplete, onCancel }: SetupExternalApiFlowProps) {
	const [step, setStep] = useState<Step>("select-api");
	const [selectedApi, setSelectedApi] = useState<ExternalApiType>("youtube");
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	const spinner = useOshiriSpinner();

	const handleApiSelect = (value: string) => {
		if (value === "skip") {
			onCancel();
			return;
		}
		setSelectedApi(value as ExternalApiType);
		setStep("input-token");
	};

	const handleTokenSubmit = async (value: string) => {
		const trimmed = value.trim();
		if (!trimmed) return;
		// 二重サブミット防止
		if (step === "validating") return;

		setStep("validating");
		setError("");

		try {
			const result = await validateExternalApiToken(selectedApi, trimmed);

			if (!result.ok) {
				setError(result.message);
				setStep("error");
				return;
			}

			updateConfig({ externalApis: { [selectedApi]: trimmed } });
			setMessage(`${API_LABELS[selectedApi]} を設定しました (${maskApiKey(trimmed)})`);
			setStep("success");

			// 少し待ってから完了
			setTimeout(onComplete, 1000);
		} catch (e) {
			setError(e instanceof Error ? e.message : "検証中にエラーが発生しました");
			setStep("error");
		}
	};

	const handleErrorAction = (value: string) => {
		if (value === "retry") {
			setError("");
			setStep("input-token");
		} else {
			onCancel();
		}
	};

	return (
		<Box flexDirection="column" gap={1}>
			<Box>
				<Text bold color="cyan">
					外部 API 設定
				</Text>
			</Box>

			{/* Step: API 選択 */}
			{step === "select-api" && (
				<Box flexDirection="column">
					<Box marginBottom={1}>
						<Text>設定する外部 API を選択してください</Text>
					</Box>
					<Select
						options={[
							{ label: "YouTube Data API", value: "youtube" },
							{ label: "X (Twitter) API", value: "x" },
							{ label: "スキップ", value: "skip" },
						]}
						onChange={handleApiSelect}
					/>
				</Box>
			)}

			{/* Step: トークン入力 */}
			{step === "input-token" && (
				<Box flexDirection="column">
					<Box marginBottom={1}>
						<Text>{API_LABELS[selectedApi]} を入力してください</Text>
					</Box>
					<Box>
						<Text color="cyan">{">"} </Text>
						<TextInput placeholder={API_PLACEHOLDERS[selectedApi]} onSubmit={handleTokenSubmit} />
					</Box>
				</Box>
			)}

			{/* Step: 検証中 */}
			{step === "validating" && (
				<Box>
					<Text color="yellow">
						{spinner} {API_LABELS[selectedApi]} を検証中...
					</Text>
				</Box>
			)}

			{/* Step: 成功 */}
			{step === "success" && (
				<Box>
					<Text color="green">{message}</Text>
				</Box>
			)}

			{/* Step: エラー */}
			{step === "error" && (
				<Box flexDirection="column">
					<Box>
						<Text color="red">{error}</Text>
					</Box>
					<Box marginTop={1}>
						<Select
							options={[
								{ label: "再入力する", value: "retry" },
								{ label: "スキップ", value: "skip" },
							]}
							onChange={handleErrorAction}
						/>
					</Box>
				</Box>
			)}
		</Box>
	);
}

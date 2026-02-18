import { Select, TextInput } from "@inkjs/ui";
import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import { detectClaudeCliPath, detectExistingAuth } from "../../../infrastructure/auth/detector.js";
import {
	setupClaudeApiKey,
	setupClaudeCliProxy,
	setupCodex,
} from "../../../infrastructure/auth/manager.js";
import { needsInit, runInit } from "../adapters/init-adapter.js";
import { useOshiriSpinner } from "../hooks/useOshiriSpinner.js";

type Step =
	| "welcome"
	| "init"
	| "auth-select"
	| "auth-claude"
	| "auth-apikey"
	| "auth-codex"
	| "done";

interface OnboardingProps {
	onComplete: () => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
	const [step, setStep] = useState<Step>("welcome");
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	const [isProcessing, setIsProcessing] = useState(false);
	const spinner = useOshiriSpinner();

	// step が "done" になったら onComplete を1回だけ呼ぶ
	useEffect(() => {
		if (step !== "done") return;
		const timer = setTimeout(onComplete, 500);
		return () => clearTimeout(timer);
	}, [step, onComplete]);

	// マウント時に1回だけ初期化処理を実行
	useEffect(() => {
		if (needsInit()) {
			try {
				runInit();
				setMessage("初期化が完了しました");
			} catch (e) {
				setError(e instanceof Error ? e.message : "初期化に失敗しました");
			}
		} else {
			setMessage("設定ディレクトリは既に存在します");
		}
		setStep("auth-select");
	}, []);

	const handleAuthSelect = async (value: string) => {
		if (value === "skip") {
			setStep("done");
			return;
		}
		if (value === "claude") {
			// Claude Code CLI が使えるか検出
			const claudeCliPath = detectClaudeCliPath();
			if (claudeCliPath) {
				setIsProcessing(true);
				const result = await setupClaudeCliProxy();
				setIsProcessing(false);
				if (result.valid) {
					setMessage(result.message);
					setStep("done");
					return;
				}
				setError(result.message);
			}
			if (process.env.ANTHROPIC_API_KEY) {
				setIsProcessing(true);
				const result = await setupClaudeApiKey(process.env.ANTHROPIC_API_KEY);
				setMessage(result.message);
				setIsProcessing(false);
				if (result.valid) {
					setStep("done");
				} else {
					setStep("auth-apikey");
				}
				return;
			}
			setStep("auth-apikey");
		} else if (value === "codex") {
			const detected = detectExistingAuth().filter((d) => d.provider === "codex");
			if (detected.length > 0) {
				setIsProcessing(true);
				const cliPath = (detected[0].data as { cliPath: string }).cliPath;
				const result = await setupCodex(cliPath);
				setMessage(result.message);
				setIsProcessing(false);
				if (result.valid) {
					setStep("done");
				} else {
					setError("Codex CLI の検証に失敗しました");
					setStep("auth-select");
				}
			} else {
				setMessage(
					"Codex CLI が見つかりません。`npm install -g @openai/codex` でインストールしてください。",
				);
				setStep("auth-select");
			}
		}
	};

	const handleApiKeySubmit = async (value: string) => {
		const trimmed = value.trim();
		if (!trimmed) return;
		setIsProcessing(true);
		setError("");
		const result = await setupClaudeApiKey(trimmed);
		setIsProcessing(false);
		if (result.valid) {
			setMessage(result.message);
			setStep("done");
		} else {
			setError(result.message);
		}
	};

	return (
		<Box flexDirection="column" paddingX={1} gap={1}>
			<Box>
				<Text bold color="cyan">
					agentic-oshikatsu セットアップ
				</Text>
			</Box>

			{message && (
				<Box>
					<Text color="green">{message}</Text>
				</Box>
			)}

			{error && (
				<Box>
					<Text color="red">{error}</Text>
				</Box>
			)}

			{isProcessing && (
				<Box>
					<Text color="yellow">{spinner} 処理中...</Text>
				</Box>
			)}

			{step === "auth-select" && !isProcessing && (
				<Box flexDirection="column">
					<Box marginBottom={1}>
						<Text>AI プロバイダーの認証を設定してください:</Text>
					</Box>
					<Select
						options={[
							{ label: "Claude (Anthropic)", value: "claude" },
							{ label: "Codex (OpenAI)", value: "codex" },
							{ label: "スキップ（後で設定）", value: "skip" },
						]}
						onChange={handleAuthSelect}
					/>
				</Box>
			)}

			{step === "auth-apikey" && !isProcessing && (
				<Box flexDirection="column">
					<Box marginBottom={1}>
						<Text>Anthropic API Key を入力してください:</Text>
					</Box>
					<TextInput placeholder="sk-ant-api03-..." onSubmit={handleApiKeySubmit} />
				</Box>
			)}

			{step === "done" && (
				<Box flexDirection="column" gap={1}>
					<Text color="green">セットアップ完了! ダッシュボードに移行します...</Text>
					<Box flexDirection="column">
						<Text dimColor>ヒント:</Text>
						<Text dimColor> oshi add — 推しを登録</Text>
						<Text dimColor> oshi auth — 認証設定を変更</Text>
						<Text dimColor> oshi profile edit — AI 応答スタイルを変更</Text>
					</Box>
				</Box>
			)}
		</Box>
	);
}

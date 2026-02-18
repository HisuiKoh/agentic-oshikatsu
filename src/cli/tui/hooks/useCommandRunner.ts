import { useCallback } from "react";
import type { Oshi } from "../../../core/oshi/types.js";
import { AIError } from "../../../shared/errors.js";
import { generateId } from "../../../shared/id.js";
import { executeCommand } from "../adapters/command-adapter.js";
import { resolveIntent } from "../adapters/intent-resolver.js";
import type { CommandLogEntry, TuiAction } from "../types.js";

interface UseCommandRunnerOptions {
	selectedOshi: Oshi | undefined;
	dispatch: React.Dispatch<TuiAction>;
	onRefresh: () => void;
	onExit: () => void;
}

/** dispatch 後に Ink のレンダリングサイクルを確実に完了させる */
const waitForRender = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export function useCommandRunner({
	selectedOshi,
	dispatch,
	onRefresh,
	onExit,
}: UseCommandRunnerOptions) {
	/** スラッシュコマンドを処理する内部関数 */
	const handleSlashCommand = useCallback(
		async (slashInput: string, rawInput?: string) => {
			// /budget set, /budget add は TUI 内フローで処理
			if (slashInput === "/budget set") {
				dispatch({ type: "SET_ACTIVE_FLOW", flow: "budget-set" });
				return;
			}
			if (slashInput === "/budget add") {
				dispatch({ type: "SET_ACTIVE_FLOW", flow: "budget-add" });
				return;
			}

			// /add コマンドは TUI 内フローで処理
			if (slashInput === "/add" || slashInput.startsWith("/add ")) {
				const prefillName = slashInput.length > 4 ? slashInput.slice(5).trim() : undefined;
				dispatch({
					type: "SET_ACTIVE_FLOW",
					flow: "add-oshi",
					addPrefillName: prefillName || undefined,
				});
				return;
			}

			// /clear コマンドでログクリア + リフレッシュ
			if (slashInput === "/clear") {
				dispatch({ type: "CLEAR_LOG" });
				onRefresh();
				return;
			}

			// /exit / /quit コマンドで TUI 終了
			if (slashInput === "/exit" || slashInput === "/quit") {
				onExit();
				return;
			}

			dispatch({ type: "SET_RUNNING", isRunning: true });
			await waitForRender();

			try {
				const result = await executeCommand(slashInput, selectedOshi);

				const entry: CommandLogEntry = {
					id: generateId(),
					command: rawInput ?? slashInput,
					resolvedCommand: rawInput ? slashInput : undefined,
					result: result.message,
					status: result.status,
					timestamp: new Date(),
				};
				dispatch({ type: "ADD_LOG", entry });

				// コマンド成功時は自動リフレッシュ
				if (result.status === "success") {
					onRefresh();
				}
			} finally {
				dispatch({ type: "SET_RUNNING", isRunning: false });
			}
		},
		[selectedOshi, dispatch, onRefresh, onExit],
	);

	const run = useCallback(
		async (input: string) => {
			const trimmed = input.trim();
			if (!trimmed) return;

			// `/` で始まる場合 → 従来のスラッシュコマンドフロー
			if (trimmed.startsWith("/")) {
				return handleSlashCommand(trimmed);
			}

			// 自然言語入力 → インテント解析
			dispatch({ type: "SET_RUNNING", isRunning: true });
			await waitForRender();
			try {
				const resolved = await resolveIntent(trimmed, selectedOshi?.name);

				// unknown → ガイダンス表示
				if (resolved.isUnknown) {
					const entry: CommandLogEntry = {
						id: generateId(),
						command: trimmed,
						result: "意図を読み取れませんでした。`/help` でコマンド一覧を確認できます。",
						status: "info",
						timestamp: new Date(),
					};
					dispatch({ type: "ADD_LOG", entry });
					return;
				}

				// 解析結果を従来のスラッシュコマンドフローに渡す
				await handleSlashCommand(resolved.command, resolved.rawInput);
			} catch (error) {
				const entry: CommandLogEntry = {
					id: generateId(),
					command: trimmed,
					result:
						error instanceof AIError
							? "自然言語モードを使うには `oshi auth` でAI設定が必要です。`/help` でコマンド一覧を確認できます。"
							: "インテント解析に失敗しました。`/` 付きでコマンドを入力してください。",
					status: "error",
					timestamp: new Date(),
				};
				dispatch({ type: "ADD_LOG", entry });
			} finally {
				dispatch({ type: "SET_RUNNING", isRunning: false });
			}
		},
		[selectedOshi, dispatch, handleSlashCommand],
	);

	return { run };
}

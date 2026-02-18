import { useApp } from "ink";
import { useEffect, useRef } from "react";

/**
 * SIGINT/SIGTERM をハンドリングし、コマンド実行中は終了をガードする。
 * isRunning が false の場合は即座に終了し、true の場合は完了を待つ。
 * コマンド実行中にシグナルを受けた場合、完了後に自動終了する。
 */
export function useGracefulExit(isRunning: boolean) {
	const { exit } = useApp();
	const isRunningRef = useRef(isRunning);
	const pendingExitRef = useRef(false);

	useEffect(() => {
		isRunningRef.current = isRunning;
		// コマンド完了時に保留中の終了要求があれば実行
		if (!isRunning && pendingExitRef.current) {
			pendingExitRef.current = false;
			exit();
		}
	}, [isRunning, exit]);

	useEffect(() => {
		const handleSignal = () => {
			if (!isRunningRef.current) {
				exit();
			} else {
				// コマンド実行中はシグナルを保留し、完了後に終了
				pendingExitRef.current = true;
			}
		};

		process.on("SIGINT", handleSignal);
		process.on("SIGTERM", handleSignal);

		return () => {
			process.removeListener("SIGINT", handleSignal);
			process.removeListener("SIGTERM", handleSignal);
		};
	}, [exit]);
}

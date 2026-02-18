import { type ChildProcess, spawn } from "node:child_process";

export interface SpawnOptions {
	timeout: number;
	env?: NodeJS.ProcessEnv;
}

/**
 * CLI サブプロセスを spawn し、プロンプトを stdin 経由で渡して stdout を収集する。
 * コマンドライン引数の長さ制限や特殊文字の問題を回避するため、
 * 長いプロンプトは必ず stdin 経由で渡す。
 */
export function spawnWithStdin(
	cliPath: string,
	args: string[],
	input: string,
	options: SpawnOptions,
): Promise<string> {
	return new Promise((resolve, reject) => {
		const child: ChildProcess = spawn(cliPath, args, {
			stdio: ["pipe", "pipe", "pipe"],
			env: options.env,
		});

		let stdout = "";
		let stderr = "";
		let killed = false;

		const timer = setTimeout(() => {
			killed = true;
			child.kill("SIGTERM");
		}, options.timeout);

		child.stdout?.on("data", (chunk: Buffer) => {
			stdout += chunk.toString();
		});
		child.stderr?.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});

		child.on("error", (err) => {
			clearTimeout(timer);
			reject(err);
		});

		child.on("close", (code) => {
			clearTimeout(timer);
			if (killed) {
				reject(Object.assign(new Error("Process timed out"), { killed: true }));
				return;
			}
			if (code !== 0 && !stdout.trim()) {
				reject(new Error(`Process exited with code ${code}: ${stderr.trim()}`));
				return;
			}
			resolve(stdout);
		});

		// stdin の EPIPE エラーを無視（プロセスが早期終了した場合に発生しうる）
		child.stdin?.on("error", () => {});
		child.stdin?.write(input);
		child.stdin?.end();
	});
}

/** 親プロセスの環境変数を継承し、API キーのみ除外する */
export function safeEnv(): NodeJS.ProcessEnv {
	const env = { ...process.env };
	delete env.ANTHROPIC_API_KEY;
	delete env.OPENAI_API_KEY;
	return env;
}

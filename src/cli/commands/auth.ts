import * as p from "@clack/prompts";
import {
	detectClaudeCliPath,
	detectExistingAuth,
	maskApiKey,
} from "../../infrastructure/auth/detector.js";
import { validateExternalApiToken } from "../../infrastructure/auth/external-api-validator.js";
import {
	getAuthStatus,
	removeAuth,
	setupClaudeApiKey,
	setupClaudeCliProxy,
	setupCodex,
} from "../../infrastructure/auth/manager.js";
import type { AuthProvider, ExternalApiType } from "../../infrastructure/auth/types.js";
import {
	isInitialized,
	readConfig,
	removeExternalApi,
	updateConfig,
} from "../../infrastructure/config/manager.js";

export type { ExternalApiType } from "../../infrastructure/auth/types.js";

async function setupAuth(): Promise<void> {
	p.intro("oshi auth — 認証セットアップ");

	if (!isInitialized()) {
		p.log.error("初期化されていません。先に `oshi init` を実行してください。");
		return;
	}

	// 1. プロバイダー選択
	const providerResult = await p.select({
		message: "セットアップ対象を選択してください",
		options: [
			{ value: "claude" as const, label: "Claude (Anthropic)" },
			{ value: "codex" as const, label: "Codex (OpenAI)" },
			{
				value: "external" as const,
				label: "外部 API (YouTube / X)",
			},
		],
	});

	if (p.isCancel(providerResult)) return;

	if (providerResult === "claude") {
		await setupClaudeFlow();
	} else if (providerResult === "codex") {
		await setupCodexFlow();
	} else {
		await setupExternalApiFlow();
	}
}

/** Claude 認証フロー（init からも呼び出し可能） */
export async function setupClaudeFlow(): Promise<void> {
	// Claude Code CLI の検出
	const claudeCliPath = detectClaudeCliPath();

	type ClaudeAuthOption = "cli_proxy" | "api_key" | "env";
	const options: Array<{
		value: ClaudeAuthOption;
		label: string;
		hint?: string;
	}> = [];

	if (claudeCliPath) {
		options.push({
			value: "cli_proxy",
			label: "Claude Code CLI 経由で使用（サブスクリプションで利用可能）",
			hint: claudeCliPath,
		});
	}

	if (process.env.ANTHROPIC_API_KEY) {
		options.push({
			value: "env",
			label: "環境変数 ANTHROPIC_API_KEY を使用",
			hint: maskApiKey(process.env.ANTHROPIC_API_KEY),
		});
	}

	options.push({
		value: "api_key",
		label: "API Key を手動入力",
	});

	const methodResult = await p.select({
		message: "認証方式を選択してください",
		options,
	});

	if (p.isCancel(methodResult)) {
		p.outro("キャンセルしました");
		return;
	}
	const method = methodResult;

	const s = p.spinner();

	if (method === "cli_proxy") {
		s.start("Claude Code CLI を検証中...");
		const result = await setupClaudeCliProxy();
		s.stop(result.message);
		if (!result.valid) return;
	} else if (method === "env") {
		const apiKey = process.env.ANTHROPIC_API_KEY;
		if (!apiKey) {
			p.log.error("ANTHROPIC_API_KEY が設定されていません");
			return;
		}
		s.start("API Key を検証中...");
		const result = await setupClaudeApiKey(apiKey);
		s.stop(result.message);
		if (!result.valid) return;
	} else {
		const apiKey = await p.text({
			message: "Anthropic API Key を入力してください",
			placeholder: "sk-ant-api03-...",
			validate: (value) => {
				if (!value?.trim()) return "API Key を入力してください";
			},
		});

		if (p.isCancel(apiKey)) return;

		s.start("API Key を検証中...");
		const result = await setupClaudeApiKey(apiKey.trim());
		s.stop(result.message);
		if (!result.valid) return;
	}

	p.log.success("Claude の認証設定が完了しました");
}

/** Codex 認証フロー（init からも呼び出し可能） */
export async function setupCodexFlow(): Promise<void> {
	const detected = detectExistingAuth().filter((d) => d.provider === "codex");

	if (detected.length > 0) {
		const cliPath = (detected[0].data as { cliPath: string }).cliPath;
		const useDetected = await p.confirm({
			message: `Codex CLI が見つかりました (${cliPath})。これを使用しますか？`,
			initialValue: true,
		});

		if (p.isCancel(useDetected)) return;

		if (useDetected) {
			const s = p.spinner();
			s.start("Codex CLI を検証中...");
			const result = await setupCodex(cliPath);
			s.stop(result.message);

			if (result.valid) {
				p.log.success("Codex の認証設定が完了しました");
			} else {
				p.log.error("Codex の設定に失敗しました");
			}
			return;
		}
	}

	p.log.info("Codex CLI がインストールされていないようです。");
	p.note(
		[
			"Codex CLI をインストールするには:",
			"  npm install -g @openai/codex",
			"",
			"インストール後に再度 `oshi auth` を実行してください。",
		].join("\n"),
		"インストール方法",
	);
}

/** 外部 API 設定フロー（add からも呼び出し可能） */
export async function setupExternalApiFlow(targetApi?: ExternalApiType): Promise<void> {
	let api: ExternalApiType;

	if (targetApi) {
		api = targetApi;
	} else {
		const apiResult = await p.select({
			message: "設定する外部 API を選択してください",
			options: [
				{
					value: "youtube" as const,
					label: "YouTube Data API",
					hint: "動画・チャンネル情報の取得に使用",
				},
				{
					value: "x" as const,
					label: "X (Twitter) API",
					hint: "ツイート検索・アカウント情報の取得に使用",
				},
			],
		});

		if (p.isCancel(apiResult)) return;
		api = apiResult;
	}

	const label = api === "youtube" ? "YouTube API Key" : "X (Twitter) Bearer Token";
	const placeholder = api === "youtube" ? "AIza..." : "AAAA...";

	const token = await p.text({
		message: `${label} を入力してください`,
		placeholder,
		validate: (value) => {
			if (!value?.trim()) return `${label} を入力してください`;
		},
	});

	if (p.isCancel(token)) return;

	const trimmedToken = token.trim();
	const s = p.spinner();
	s.start(`${label} を検証中...`);

	const valid = await validateExternalApiToken(api, trimmedToken);

	if (!valid.ok) {
		s.stop(`${label} の検証に失敗しました`);
		p.log.warn(valid.message);

		const retry = await p.confirm({
			message: "再入力しますか？",
			initialValue: true,
		});

		if (p.isCancel(retry) || !retry) return;

		// 再帰で再入力
		return setupExternalApiFlow(api);
	}

	s.stop(`${label} の検証に成功しました`);

	updateConfig({ externalApis: { [api]: trimmedToken } });
	p.log.success(`${label} を設定しました (${maskApiKey(trimmedToken)})`);
}

function showStatus(): void {
	p.intro("oshi auth status — 認証状態");

	const statuses = getAuthStatus();

	if (statuses.length === 0) {
		p.log.info("認証情報が設定されていません。`oshi auth` で設定してください。");
	}

	for (const status of statuses) {
		const line = `${status.provider}: ${status.detail}`;
		if (status.method === "none") {
			p.log.info(line);
		} else {
			p.log.success(line);
		}
	}

	// 外部 API ステータス
	try {
		const config = readConfig();
		if (config.externalApis.youtube) {
			p.log.success(`YouTube: API Key 設定済み (${maskApiKey(config.externalApis.youtube)})`);
		} else {
			p.log.info("YouTube: 未設定");
		}
		if (config.externalApis.x) {
			p.log.success(`X (Twitter): Bearer Token 設定済み (${maskApiKey(config.externalApis.x)})`);
		} else {
			p.log.info("X (Twitter): 未設定");
		}
	} catch {
		// config が読めない場合はスキップ
	}

	p.outro("");
}

async function handleRemove(args: string[]): Promise<void> {
	const target = args[0] as AuthProvider | ExternalApiType | undefined;

	if (!target || !["claude", "codex", "youtube", "x"].includes(target)) {
		p.log.error("対象を指定してください: oshi auth remove <claude|codex|youtube|x>");
		return;
	}

	const labelMap: Record<string, string> = {
		claude: "Claude",
		codex: "Codex",
		youtube: "YouTube API Key",
		x: "X (Twitter) Bearer Token",
	};

	const confirm = await p.confirm({
		message: `${labelMap[target]} の認証情報を削除しますか？`,
		initialValue: false,
	});

	if (p.isCancel(confirm) || !confirm) {
		p.outro("キャンセルしました");
		return;
	}

	if (target === "youtube" || target === "x") {
		removeExternalApi(target);
	} else {
		removeAuth(target);
	}

	p.log.success(`${labelMap[target]} の認証情報を削除しました`);
}

export async function execute(args: string[]): Promise<void> {
	const subcommand = args[0];

	if (subcommand === "status") {
		showStatus();
	} else if (subcommand === "remove") {
		await handleRemove(args.slice(1));
	} else {
		await setupAuth();
	}
}

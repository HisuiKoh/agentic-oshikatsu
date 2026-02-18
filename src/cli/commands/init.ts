import * as p from "@clack/prompts";
import { DEFAULT_CONFIG } from "../../infrastructure/config/defaults.js";
import {
	ensureAppDir,
	getAppDir,
	getConfigPath,
	getDbPath,
	isInitialized,
	writeConfig,
} from "../../infrastructure/config/manager.js";
import { getDb } from "../../infrastructure/db/connection.js";
import { runMigrate } from "../../infrastructure/db/run-migrate.js";
import { t } from "../../shared/i18n/i18n.js";
import { setupClaudeFlow, setupCodexFlow } from "./auth.js";
import { runProfileSetup } from "./profile.js";

export async function execute(_args: string[]): Promise<void> {
	p.intro(t("init.title"));

	const appDir = getAppDir();

	if (isInitialized()) {
		const shouldReinit = await p.confirm({
			message: t("init.alreadyInitialized"),
			initialValue: false,
		});

		if (p.isCancel(shouldReinit) || !shouldReinit) {
			p.outro(t("init.skipped"));
			return;
		}
	}

	const s = p.spinner();

	// 1. 設定ディレクトリ作成
	s.start(t("init.creatingDir"));
	ensureAppDir();
	s.stop(`${t("init.creatingDir").replace("...", "")}: ${appDir}`);

	// 2. DB 初期化
	s.start(t("init.creatingDb"));
	const dbPath = getDbPath();
	runMigrate(dbPath);
	s.stop(`${t("init.creatingDb").replace("...", "")}: ${dbPath}`);

	// 3. config.json 作成
	s.start(t("init.creatingConfig"));
	writeConfig(DEFAULT_CONFIG);
	s.stop(`${t("init.creatingConfig").replace("...", "")}: ${getConfigPath()}`);

	// 4. AI 認証設定（任意）
	const setupAuthResult = await p.select({
		message: t("init.authQuestion"),
		options: [
			{ value: "claude" as const, label: "Claude (Anthropic)" },
			{ value: "codex" as const, label: "Codex (OpenAI)" },
			{ value: "skip" as const, label: t("init.authSkip") },
		],
	});

	if (!p.isCancel(setupAuthResult) && setupAuthResult !== "skip") {
		if (setupAuthResult === "claude") {
			await setupClaudeFlow();
		} else {
			await setupCodexFlow();
		}
	}

	// 5. パーソナリティ設定（任意）
	const setupProfile = await p.confirm({
		message: t("init.profileQuestion"),
		initialValue: true,
	});

	if (!p.isCancel(setupProfile) && setupProfile) {
		const db = getDb(dbPath);
		await runProfileSetup(db);
	}

	p.note(
		[
			`${t("init.creatingDir").replace("...", "")}: ${appDir}`,
			"",
			"次にできること:",
			"  oshi add          — 推しを登録",
			"  oshi list         — 登録済みの推しを一覧表示",
			"  oshi auth         — AI プロバイダーの認証を変更",
			"  oshi profile edit — AI の応答スタイルを変更",
		].join("\n"),
		t("init.complete"),
	);

	p.outro(t("init.ready"));
}

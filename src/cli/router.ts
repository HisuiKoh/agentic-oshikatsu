import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as p from "@clack/prompts";
import { closeDb } from "../infrastructure/db/connection.js";
import { t } from "../shared/i18n/i18n.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function getVersion(): string {
	// src/cli/ → package.json or dist/src/cli/ → package.json
	for (const relative of ["../../package.json", "../../../package.json"]) {
		const candidate = resolve(__dirname, relative);
		if (existsSync(candidate)) {
			const pkg = JSON.parse(readFileSync(candidate, "utf-8"));
			return pkg.version ?? "unknown";
		}
	}
	return "unknown";
}

const COMMANDS: Record<string, () => Promise<{ execute: (args: string[]) => Promise<void> }>> = {
	init: () => import("./commands/init.js"),
	add: () => import("./commands/add.js"),
	list: () => import("./commands/list.js"),
	auth: () => import("./commands/auth.js"),
	cost: () => import("./commands/cost.js"),
	collect: () => import("./commands/collect.js"),
	info: () => import("./commands/info.js"),
	budget: () => import("./commands/budget.js"),
	lint: () => import("./commands/lint.js"),
	suggest: () => import("./commands/suggest.js"),
	review: () => import("./commands/review.js"),
	dashboard: () => import("./commands/dashboard.js"),
	profile: () => import("./commands/profile.js"),
	backup: () => import("./commands/backup.js"),
	reset: () => import("./commands/reset.js"),
};

function showHelp() {
	console.log(`
  agentic-oshikatsu - 推し活 × AI のエージェンティックツール

  使い方:
    oshi                  TUI ダッシュボードを起動
    oshi <command> [options]

  コマンド:
    init           設定ディレクトリと DB を初期化
    auth           AI プロバイダーの認証を設定
    auth status    認証状態を表示
    auth remove    認証情報を削除
    add            推しを登録（AI 対話 / 手動）
    list           登録済みの推しを一覧表示
    collect [name]               推しの最新情報を収集
    collect [name] --source <id> 特定ソースのみ（youtube, wikipedia, google-news, x）
    info [name]    収集済み情報を表示
    review [name]              収集情報を確認して承認/却下
    review [name] --approve-all  承認待ち情報をすべて承認
    budget set     予算上限を設定
    budget add     支出を記録
    budget status  予算状況を表示
    lint [action]  行動のリスク評価（PASS/WARN/BLOCK）
    suggest [name] 推しに関する行動提案を AI で生成
    suggest [name] --history 過去の提案履歴を表示
    dashboard [name] 推し活ダッシュボード（TUI / --static で静的表示）
    profile [show]   パーソナリティ設定を表示
    profile edit     パーソナリティ設定を変更
    backup           DB バックアップを作成
    backup list      バックアップ一覧
    backup restore   バックアップからリストア
    backup export    JSON エクスポート
    backup import    JSON インポート
    cost           AI 使用量とコストを表示
    reset          全データを削除してリセット
    help           ヘルプを表示

  グローバルオプション:
    --lang <ja|en>  表示言語を切り替え（デフォルト: 環境変数から自動検出）
    --version, -v   バージョンを表示
    --list, -l      登録済みの推しを一覧表示（list のショートカット）

  例:
    oshi init
    oshi add
    oshi collect 杵月のあ
    oshi collect 杵月のあ --source x
    oshi info 杵月のあ
    oshi budget set
    oshi budget status
    oshi lint "15,000円のグッズを購入する"
    oshi suggest 杵月のあ
    oshi dashboard
    oshi dashboard 杵月のあ
`);
}

/** フラグ → コマンドのエイリアス */
const FLAG_ALIASES: Record<string, string> = {
	"--list": "list",
	"-l": "list",
};

export async function routeCommand(args: string[]) {
	const command = args[0];

	// oshi（引数なし）→ TUI ダッシュボード起動
	if (!command) {
		// 非 TTY 環境（パイプ等）→ 従来の静的表示にフォールバック
		if (!process.stdout.isTTY) {
			const mod = await COMMANDS.dashboard();
			await mod.execute(["--static"]);
			closeDb();
			return;
		}

		const { renderTui } = await import("./tui/App.js");
		await renderTui();
		return;
	}

	if (command === "help" || command === "--help" || command === "-h") {
		showHelp();
		return;
	}

	if (command === "--version" || command === "-v" || command === "-V") {
		console.log(`oshi v${getVersion()}`);
		return;
	}

	// フラグエイリアスの解決
	const resolved = FLAG_ALIASES[command] ?? command;

	const loader = COMMANDS[resolved];
	if (!loader) {
		p.log.error(t("router.unknownCommand", { command }));
		showHelp();
		process.exitCode = 1;
		return;
	}

	try {
		const mod = await loader();
		await mod.execute(args.slice(1));
	} catch (error) {
		if (error instanceof Error) {
			p.log.error(error.message);
		} else {
			p.log.error(t("router.unexpectedError"));
		}
		process.exitCode = 1;
	} finally {
		closeDb();
	}
}

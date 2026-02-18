export interface TuiCommand {
	name: string;
	description: string;
	args?: string;
}

export const TUI_COMMANDS: TuiCommand[] = [
	{ name: "/add", description: "推しを登録", args: "[name]" },
	{ name: "/collect", description: "推しの情報を収集", args: "[name]" },
	{ name: "/suggest", description: "行動提案を生成", args: "[name]" },
	{ name: "/lint", description: "行動のリスク評価", args: "<action>" },
	{ name: "/budget", description: "予算状況を表示" },
	{ name: "/budget set", description: "予算上限を設定" },
	{ name: "/budget add", description: "支出を記録" },
	{ name: "/cost", description: "AI 使用量を表示" },
	{ name: "/info", description: "収集情報を表示" },
	{ name: "/list", description: "推し一覧を表示" },
	{ name: "/clear", description: "画面をリセット" },
	{ name: "/refresh", description: "データを更新" },
	{ name: "/help", description: "コマンド一覧を表示" },
	{ name: "/exit", description: "TUI を終了" },
];

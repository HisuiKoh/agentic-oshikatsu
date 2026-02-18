import * as p from "@clack/prompts";
import { BudgetManager } from "../../core/budget/manager.js";
import {
	BUDGET_PERIOD_LABELS,
	BUDGET_PERIODS,
	BUDGET_TYPE_LABELS,
	BUDGET_TYPES,
} from "../../core/budget/types.js";
import { getDbPath, isInitialized } from "../../infrastructure/config/manager.js";
import { getDb } from "../../infrastructure/db/connection.js";

/** プログレスバーを生成 */
function progressBar(rate: number, width: number = 20): string {
	const filled = Math.min(Math.round(rate * width), width);
	const bar = "\u2588".repeat(filled) + "\u2591".repeat(width - filled);
	const percent = Math.round(rate * 100);
	return `${bar} ${percent}%`;
}

/** サブコマンド: set */
async function handleSet(manager: BudgetManager): Promise<void> {
	const typeResult = await p.select({
		message: "予算タイプを選択",
		options: BUDGET_TYPES.map((t) => ({ value: t, label: BUDGET_TYPE_LABELS[t] })),
	});
	if (p.isCancel(typeResult)) return;
	const type = typeResult;

	const periodResult = await p.select({
		message: "予算期間を選択",
		options: BUDGET_PERIODS.map((pr) => ({ value: pr, label: BUDGET_PERIOD_LABELS[pr] })),
	});
	if (p.isCancel(periodResult)) return;
	const period = periodResult;

	const amountStr = await p.text({
		message: "予算上限（円）",
		placeholder: "例: 30000",
		validate: (value) => {
			const num = Number(value);
			if (Number.isNaN(num) || !Number.isInteger(num) || num <= 0) {
				return "正の整数を入力してください";
			}
		},
	});
	if (p.isCancel(amountStr)) return;

	manager.setLimit({
		type,
		period,
		limit: Number(amountStr),
		currency: "JPY",
	});

	p.log.success(
		`${BUDGET_TYPE_LABELS[type]}の${BUDGET_PERIOD_LABELS[period]}予算を ${Number(amountStr).toLocaleString()} 円に設定しました`,
	);
}

/** サブコマンド: add */
async function handleAdd(manager: BudgetManager): Promise<void> {
	const typeResult = await p.select({
		message: "支出タイプを選択",
		options: BUDGET_TYPES.map((t) => ({ value: t, label: BUDGET_TYPE_LABELS[t] })),
	});
	if (p.isCancel(typeResult)) return;
	const type = typeResult;

	const amountStr = await p.text({
		message: "金額（円）",
		placeholder: "例: 3500",
		validate: (value) => {
			const num = Number(value);
			if (Number.isNaN(num) || !Number.isInteger(num) || num <= 0) {
				return "正の整数を入力してください";
			}
		},
	});
	if (p.isCancel(amountStr)) return;

	const description = await p.text({
		message: "説明（任意）",
		placeholder: "例: 推しのアクリルスタンド",
		defaultValue: "",
	});
	if (p.isCancel(description)) return;

	manager.addEntry({
		type,
		amount: Number(amountStr),
		currency: "JPY",
		description: description.trim() || undefined,
		date: new Date().toISOString().split("T")[0],
	});

	p.log.success(`${Number(amountStr).toLocaleString()} 円の支出を記録しました`);
}

/** サブコマンド: status */
function handleStatus(manager: BudgetManager): void {
	// AI コストを同期
	manager.syncAiCosts();

	const summaries = manager.getSummary();

	if (summaries.length === 0) {
		p.log.info("予算が設定されていません。`oshi budget set` で予算を設定してください。");
		return;
	}

	for (const summary of summaries) {
		const typeLabel = BUDGET_TYPE_LABELS[summary.type];
		const periodLabel = BUDGET_PERIOD_LABELS[summary.period];

		p.note(
			[
				`予算: ${summary.limit.toLocaleString()} 円`,
				`使用: ${summary.spent.toLocaleString()} 円`,
				`残り: ${summary.remaining.toLocaleString()} 円`,
				progressBar(summary.usageRate),
			].join("\n"),
			`${typeLabel}（${periodLabel}）`,
		);
	}
}

export async function execute(args: string[]): Promise<void> {
	p.intro("oshi budget — 予算管理");

	if (!isInitialized()) {
		p.log.error("初期化されていません。先に `oshi init` を実行してください。");
		return;
	}

	const db = getDb(getDbPath());
	const manager = new BudgetManager(db);
	const subcommand = args[0];

	switch (subcommand) {
		case "set":
			await handleSet(manager);
			break;
		case "add":
			await handleAdd(manager);
			break;
		case "status":
			handleStatus(manager);
			break;
		default: {
			if (subcommand) {
				p.log.error(`不明なサブコマンド: ${subcommand}`);
			}
			p.log.info(
				[
					"使い方:",
					"  oshi budget set    - 予算上限を設定",
					"  oshi budget add    - 支出を記録",
					"  oshi budget status - 予算状況を表示",
				].join("\n"),
			);
		}
	}

	p.outro("");
}

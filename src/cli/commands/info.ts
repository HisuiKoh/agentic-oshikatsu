import * as p from "@clack/prompts";
import { getCollectedInfo } from "../../core/info-collection/collector.js";
import { OshiRepository } from "../../core/oshi/repository.js";
import { getDbPath, isInitialized } from "../../infrastructure/config/manager.js";
import { getDb } from "../../infrastructure/db/connection.js";

/** 重要度をバーで表示 */
function importanceBar(importance: number | null): string {
	if (importance === null) return "---";
	const filled = Math.min(importance, 10);
	return "\u2588".repeat(filled) + "\u2591".repeat(10 - filled);
}

/** センチメントのアイコン */
function sentimentIcon(sentiment: string | null): string {
	switch (sentiment) {
		case "positive":
			return "[+]";
		case "negative":
			return "[-]";
		default:
			return "[=]";
	}
}

export async function execute(args: string[]): Promise<void> {
	p.intro("oshi info — 収集済み情報を表示");

	if (!isInitialized()) {
		p.log.error("初期化されていません。先に `oshi init` を実行してください。");
		return;
	}

	const db = getDb(getDbPath());
	const repo = new OshiRepository(db);
	const allOshis = repo.findAll();

	if (allOshis.length === 0) {
		p.log.error("推しが登録されていません。先に `oshi add` で推しを登録してください。");
		return;
	}

	// 引数から推しを特定、または選択
	let oshiName = args[0];
	if (!oshiName) {
		const selected = await p.select({
			message: "情報を表示する推しを選択",
			options: allOshis.map((o) => ({ value: o.name, label: o.name })),
		});
		if (p.isCancel(selected)) {
			p.outro("キャンセルしました");
			return;
		}
		oshiName = selected;
	}

	const matches = repo.findByName(oshiName);
	if (matches.length === 0) {
		p.log.error(`「${oshiName}」に一致する推しが見つかりません。`);
		return;
	}

	const oshi = matches[0];
	const infos = getCollectedInfo(db, oshi.id, { limit: 20 });

	if (infos.length === 0) {
		p.log.info(
			`${oshi.name} の収集済み情報はありません。\`oshi collect ${oshi.name}\` で情報を収集してください。`,
		);
		p.outro("");
		return;
	}

	p.log.info(`${oshi.name} の収集済み情報: ${infos.length} 件`);

	for (const info of infos) {
		const displayDate = (info.publishedAt ?? info.collectedAt).split("T")[0];
		const lines = [
			`[${displayDate}] ${info.title}`,
			info.summary ? `  ${info.summary}` : "",
			`  重要度: ${importanceBar(info.importance ?? null)} ${sentimentIcon(info.sentiment ?? null)}`,
			info.category ? `  カテゴリ: ${info.category}` : "",
			info.url ? `  URL: ${info.url}` : "",
			info.publishedAt ? `  公開日: ${info.publishedAt.split("T")[0]}` : "",
			info.eventDate ? `  イベント日: ${info.eventDate}` : "",
		]
			.filter(Boolean)
			.join("\n");

		p.log.message(lines);
	}

	p.outro(`${infos.length} 件の情報を表示しました`);
}

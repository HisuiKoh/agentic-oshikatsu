import * as p from "@clack/prompts";
import { getCollectedInfo, updateApprovalStatus } from "../../core/info-collection/collector.js";
import { OshiRepository } from "../../core/oshi/repository.js";
import { getDbPath, isInitialized } from "../../infrastructure/config/manager.js";
import { getDb } from "../../infrastructure/db/connection.js";

export async function execute(args: string[]): Promise<void> {
	p.intro("oshi review — 収集情報を確認して承認/却下");

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

	// --approve-all オプション解析
	const approveAll = args.includes("--approve-all");
	const filteredArgs = args.filter((a) => a !== "--approve-all");

	// 引数から推しを特定、または選択
	let oshiName = filteredArgs[0];
	if (!oshiName) {
		const selected = await p.select({
			message: "レビューする推しを選択",
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
	const pendingItems = getCollectedInfo(db, oshi.id, {
		approvalStatuses: ["pending"],
	});

	if (pendingItems.length === 0) {
		p.log.info(`${oshi.name} の承認待ち情報はありません。`);
		p.outro("");
		return;
	}

	p.log.info(`${oshi.name} の承認待ち情報: ${pendingItems.length} 件`);

	// --approve-all: 一括承認
	if (approveAll) {
		const confirmed = await p.confirm({
			message: `${pendingItems.length} 件すべてを承認しますか？`,
		});
		if (p.isCancel(confirmed) || !confirmed) {
			p.outro("キャンセルしました");
			return;
		}

		for (const item of pendingItems) {
			updateApprovalStatus(db, item.id, "approved");
		}
		p.log.success(`${pendingItems.length} 件を承認しました。`);
		p.outro("");
		return;
	}

	// 個別レビュー（関連度スコア降順）
	const sorted = [...pendingItems].sort(
		(a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0),
	);

	let approvedCount = 0;
	let rejectedCount = 0;
	let skippedCount = 0;

	for (const item of sorted) {
		const displayDate = (item.publishedAt ?? item.collectedAt).split("T")[0];
		const score = item.relevanceScore ?? 0;

		p.note(
			[
				`タイトル: ${item.title}`,
				item.summary ? `要約: ${item.summary}` : "",
				`関連度: ${score}/100`,
				`カテゴリ: ${item.category ?? "不明"}`,
				item.url ? `URL: ${item.url}` : "",
				`日付: ${displayDate}`,
			]
				.filter(Boolean)
				.join("\n"),
			`[${score}] ${item.title.slice(0, 40)}`,
		);

		const action = await p.select({
			message: "この情報をどうしますか？",
			options: [
				{ value: "approve", label: "承認" },
				{ value: "reject", label: "却下" },
				{ value: "skip", label: "スキップ" },
				{ value: "quit", label: "終了" },
			],
		});

		if (p.isCancel(action) || action === "quit") {
			break;
		}

		if (action === "approve") {
			updateApprovalStatus(db, item.id, "approved");
			approvedCount++;
		} else if (action === "reject") {
			updateApprovalStatus(db, item.id, "rejected");
			rejectedCount++;
		} else {
			skippedCount++;
		}
	}

	const parts = [
		approvedCount > 0 ? `承認: ${approvedCount} 件` : "",
		rejectedCount > 0 ? `却下: ${rejectedCount} 件` : "",
		skippedCount > 0 ? `スキップ: ${skippedCount} 件` : "",
	].filter(Boolean);

	if (parts.length > 0) {
		p.log.success(parts.join("、"));
	}

	p.outro("レビュー完了");
}

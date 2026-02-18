import * as p from "@clack/prompts";
import { collectInfo } from "../../core/info-collection/collector.js";
import { OshiRepository } from "../../core/oshi/repository.js";
import { createProvider } from "../../infrastructure/ai/provider-factory.js";
import type { AIProvider } from "../../infrastructure/ai/types.js";
import { getDbPath, isInitialized } from "../../infrastructure/config/manager.js";
import { getDb } from "../../infrastructure/db/connection.js";
import { notifyNewInfo } from "../../infrastructure/notifications/discord.js";
import type { PluginOshiContext } from "../../infrastructure/plugins/base.js";

export async function execute(args: string[]): Promise<void> {
	p.intro("oshi collect — 推しの情報を収集");

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

	// --source オプションを解析
	let sourcePlugin: string | undefined;
	const filteredArgs: string[] = [];
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--source" && i + 1 < args.length) {
			sourcePlugin = args[i + 1];
			i++;
		} else {
			filteredArgs.push(args[i]);
		}
	}

	// 引数から推しを特定、または選択
	let oshiName = filteredArgs[0];
	if (!oshiName) {
		const selected = await p.select({
			message: "情報を収集する推しを選択",
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
	const attributes = repo.getAttributes(oshi.id);

	// AI プロバイダーを取得
	let provider: AIProvider;
	try {
		provider = createProvider();
	} catch {
		p.log.error("AI プロバイダーが利用できません。`oshi auth` で認証を設定してください。");
		return;
	}

	const oshiContext: PluginOshiContext = {
		id: oshi.id,
		name: oshi.name,
		category: oshi.category as PluginOshiContext["category"],
		attributes: attributes.map((a) => ({ key: a.key, value: a.value })),
	};

	const s = p.spinner();
	s.start(`${oshi.name} の情報を収集中...`);

	try {
		const result = await collectInfo(db, provider, oshiContext, { maxItems: 10, sourcePlugin });
		s.stop("収集完了");

		if (result.error) {
			p.log.error(result.error);
			return;
		}

		if (result.newItems === 0 && result.skippedDuplicates === 0) {
			p.log.info("新しい情報は見つかりませんでした。");
		} else {
			const details = [
				`自動承認: ${result.approvedItems} 件`,
				result.pendingItems > 0 ? `承認待ち: ${result.pendingItems} 件` : "",
				result.rejectedItems > 0 ? `自動却下: ${result.rejectedItems} 件` : "",
			]
				.filter(Boolean)
				.join("、");

			p.log.success(
				[
					`新規: ${result.newItems} 件（${details}）`,
					result.skippedDuplicates > 0 ? `重複スキップ: ${result.skippedDuplicates} 件` : "",
				]
					.filter(Boolean)
					.join("、"),
			);

			if (result.pendingItems > 0) {
				p.log.info(`承認待ちの情報があります。\`oshi review ${oshi.name}\` で確認してください。`);
			}

			// Discord 通知（新着がある場合のみ）
			if (result.newItems > 0) {
				await notifyNewInfo(oshi.name, result.newItems, result.pendingItems);
			}
		}

		p.outro(`収集完了（合計 ${result.totalCollected} 件取得）`);
	} catch (error) {
		s.stop("収集に失敗しました");
		p.log.error(error instanceof Error ? error.message : "情報収集中にエラーが発生しました");
	}
}

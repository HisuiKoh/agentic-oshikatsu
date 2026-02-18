import { readFileSync, writeFileSync } from "node:fs";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../../infrastructure/db/schema.js";
import { logger } from "../../shared/logger.js";

/** エクスポートデータ形式 */
interface ExportData {
	version: string;
	exportedAt: string;
	oshis: unknown[];
	oshiAttributes: unknown[];
	collectedInfo: unknown[];
	budgetEntries: unknown[];
	budgetLimits: unknown[];
	suggestions: unknown[];
	lintResults: unknown[];
	userProfile: unknown[];
}

/** DB の全データを JSON 形式でエクスポート */
export function exportToJson(db: BetterSQLite3Database<typeof schema>): ExportData {
	return {
		version: "1.0.0",
		exportedAt: new Date().toISOString(),
		oshis: db.select().from(schema.oshis).all(),
		oshiAttributes: db.select().from(schema.oshiAttributes).all(),
		collectedInfo: db.select().from(schema.collectedInfo).all(),
		budgetEntries: db.select().from(schema.budgetEntries).all(),
		budgetLimits: db.select().from(schema.budgetLimits).all(),
		suggestions: db.select().from(schema.suggestions).all(),
		lintResults: db.select().from(schema.lintResults).all(),
		userProfile: db.select().from(schema.userProfile).all(),
	};
}

/** JSON ファイルに書き出し */
export function exportToFile(db: BetterSQLite3Database<typeof schema>, filePath: string): void {
	const data = exportToJson(db);
	writeFileSync(filePath, JSON.stringify(data, null, "\t"), "utf-8");
	logger.info(`エクスポートしました: ${filePath}`);
}

/** JSON ファイルからインポート */
export function importFromFile(
	db: BetterSQLite3Database<typeof schema>,
	filePath: string,
): { imported: number } {
	const raw = readFileSync(filePath, "utf-8");
	const data = JSON.parse(raw) as ExportData;

	if (!data.version || !data.exportedAt) {
		throw new Error("エクスポートファイルの形式が不正です");
	}

	let imported = 0;

	// 推しデータのインポート（既存と重複する場合はスキップ）
	for (const oshi of data.oshis as Array<typeof schema.oshis.$inferInsert>) {
		try {
			db.insert(schema.oshis).values(oshi).run();
			imported++;
		} catch {
			// 重複時はスキップ
		}
	}

	// 属性のインポート
	for (const attr of data.oshiAttributes as Array<typeof schema.oshiAttributes.$inferInsert>) {
		try {
			db.insert(schema.oshiAttributes).values(attr).run();
			imported++;
		} catch {
			// 重複時はスキップ
		}
	}

	// 収集情報のインポート
	for (const info of data.collectedInfo as Array<typeof schema.collectedInfo.$inferInsert>) {
		try {
			db.insert(schema.collectedInfo).values(info).run();
			imported++;
		} catch {
			// 重複時はスキップ
		}
	}

	// 予算データのインポート
	for (const entry of data.budgetEntries as Array<typeof schema.budgetEntries.$inferInsert>) {
		try {
			db.insert(schema.budgetEntries).values(entry).run();
			imported++;
		} catch {
			// 重複時はスキップ
		}
	}

	for (const limit of data.budgetLimits as Array<typeof schema.budgetLimits.$inferInsert>) {
		try {
			db.insert(schema.budgetLimits).values(limit).run();
			imported++;
		} catch {
			// 重複時はスキップ
		}
	}

	logger.info(`${imported} 件のレコードをインポートしました`);
	return { imported };
}

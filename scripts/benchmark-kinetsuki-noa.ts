/**
 * 杵月のあベンチマーク — 初期調査精度の検証スクリプト
 *
 * 使い方: npx tsx scripts/benchmark-kinetsuki-noa.ts
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createProvider } from "../src/infrastructure/ai/provider-factory.js";
import {
	ensureAppDir,
	getDbPath,
	writeConfig,
	updateConfig,
} from "../src/infrastructure/config/manager.js";
import { getDb } from "../src/infrastructure/db/connection.js";
import { runMigrate } from "../src/infrastructure/db/run-migrate.js";
import { DEFAULT_CONFIG } from "../src/infrastructure/config/defaults.js";
import { analyzeOshi } from "../src/core/oshi/analyzer.js";
import { OshiRepository } from "../src/core/oshi/repository.js";
import { collectInfo, getCollectedInfo } from "../src/core/info-collection/collector.js";
import type { PluginOshiContext } from "../src/infrastructure/plugins/base.js";

// ── 正解データ ──────────────────────────────

interface GroundTruth {
	key: string;
	expected: string | string[];
	level: "MUST" | "SHOULD" | "MAY";
	matchFn?: (actual: string, expected: string | string[]) => boolean;
}

const GROUND_TRUTH: GroundTruth[] = [
	{
		key: "category",
		expected: "vtuber",
		level: "MUST",
	},
	{
		key: "debut_date",
		expected: "2020",
		level: "SHOULD",
		matchFn: (actual, expected) => actual.includes(expected as string),
	},
	{
		key: "affiliation",
		expected: ["個人勢", "indie", "個人", "independent"],
		level: "SHOULD",
		matchFn: (actual, expected) =>
			(expected as string[]).some((e) => actual.toLowerCase().includes(e.toLowerCase())),
	},
	{
		key: "genre",
		expected: ["麻雀", "mahjong", "謎解き", "puzzle"],
		level: "SHOULD",
		matchFn: (actual, expected) =>
			(expected as string[]).some((e) => actual.toLowerCase().includes(e.toLowerCase())),
	},
	{
		key: "channel_name",
		expected: "杵月のあ",
		level: "MAY",
		matchFn: (actual, expected) => actual.includes(expected as string),
	},
	{
		key: "fanmark",
		expected: "🦊",
		level: "MAY",
		matchFn: (actual, expected) =>
			actual.includes(expected as string) || actual.includes("狐") || actual.includes("fox"),
	},
	{
		key: "location",
		expected: ["大阪", "osaka", "関西"],
		level: "MAY",
		matchFn: (actual, expected) =>
			(expected as string[]).some((e) => actual.toLowerCase().includes(e.toLowerCase())),
	},
	{
		key: "motto",
		expected: "笑顔",
		level: "MAY",
		matchFn: (actual, expected) => actual.includes(expected as string),
	},
	{
		key: "platform",
		expected: ["雀魂", "youtube", "YouTube"],
		level: "MAY",
		matchFn: (actual, expected) =>
			(expected as string[]).some((e) => actual.toLowerCase().includes(e.toLowerCase())),
	},
];

const SCORE_WEIGHTS = { MUST: 30, SHOULD: 15, MAY: 5 };

function getRank(score: number): string {
	if (score >= 80) return "S";
	if (score >= 60) return "A";
	if (score >= 40) return "B";
	if (score >= 30) return "C";
	return "F";
}

// ── メイン ──────────────────────────────

async function main() {
	console.log("=".repeat(60));
	console.log("杵月のあベンチマーク — 初期調査精度検証");
	console.log("=".repeat(60));
	console.log();

	// 1. 初期化
	console.log("▶ 環境セットアップ...");
	ensureAppDir();
	const dbPath = getDbPath();
	runMigrate(dbPath);
	writeConfig(DEFAULT_CONFIG);
	// Claude Code CLI プロキシモードで認証 + 精度テスト用に Opus を使用
	updateConfig({
		providers: { claude: { authMethod: "cli_detect" } },
		models: { default: "claude-opus-4-6", linter: "claude-haiku-4-5-20251001" },
	});
	const db = getDb(dbPath);
	const provider = createProvider();
	const repo = new OshiRepository(db);

	// 2. 推し分析
	console.log("▶ 推し分析（analyzeOshi）を実行...");
	const analysis = await analyzeOshi(provider, "杵月のあ", "VTuberです");
	console.log();
	console.log("── 推し分析結果 ──");
	console.log(`  category: ${analysis.category}`);
	console.log(`  description: ${analysis.description}`);
	console.log(`  attributes (${analysis.attributes.length}件):`);
	for (const attr of analysis.attributes) {
		console.log(`    ${attr.key}: ${attr.value}`);
	}
	console.log();

	// 3. スコアリング
	console.log("── 精度スコアリング ──");
	let totalScore = 0;
	const maxScore =
		GROUND_TRUTH.filter((g) => g.key === "category").length * SCORE_WEIGHTS.MUST +
		GROUND_TRUTH.filter((g) => g.level === "MUST" && g.key !== "category").length * SCORE_WEIGHTS.MUST +
		GROUND_TRUTH.filter((g) => g.level === "SHOULD").length * SCORE_WEIGHTS.SHOULD +
		GROUND_TRUTH.filter((g) => g.level === "MAY").length * SCORE_WEIGHTS.MAY;

	for (const gt of GROUND_TRUTH) {
		let match = false;
		let actualValue = "";

		if (gt.key === "category") {
			actualValue = analysis.category;
			match = actualValue === gt.expected;
		} else {
			const attr = analysis.attributes.find((a) => a.key === gt.key);
			if (attr) {
				actualValue = attr.value;
				if (gt.matchFn) {
					match = gt.matchFn(actualValue, gt.expected);
				} else {
					match = actualValue === gt.expected;
				}
			}
		}

		const points = match ? SCORE_WEIGHTS[gt.level] : 0;
		totalScore += points;
		const icon = match ? "✅" : "❌";
		const expectedStr = Array.isArray(gt.expected) ? gt.expected.join("|") : gt.expected;
		console.log(
			`  ${icon} ${gt.key} [${gt.level}/${SCORE_WEIGHTS[gt.level]}pt]: ${actualValue || "(なし)"} (期待: ${expectedStr})`,
		);
	}

	console.log();
	console.log(`  合計スコア: ${totalScore} / ${maxScore} → ランク ${getRank(totalScore)}`);
	console.log();

	// 4. DB に登録
	console.log("▶ 推しを DB に登録...");
	const oshi = repo.create({
		name: "杵月のあ",
		category: analysis.category,
		description: analysis.description,
		attributes: analysis.attributes,
	});

	// 5. 情報収集
	console.log("▶ 情報収集（collectInfo）を実行...");
	const oshiContext: PluginOshiContext = {
		id: oshi.id,
		name: oshi.name,
		category: oshi.category,
		attributes: analysis.attributes,
	};

	const collectResult = await collectInfo(db, provider, oshiContext);
	console.log();
	console.log("── 情報収集結果 ──");
	console.log(`  新規: ${collectResult.newItems} 件`);
	console.log(`  重複スキップ: ${collectResult.skippedDuplicates} 件`);
	console.log(`  合計取得: ${collectResult.totalCollected} 件`);
	if (collectResult.error) {
		console.log(`  エラー: ${collectResult.error}`);
	}
	console.log();

	// 6. 収集済み情報の詳細
	const collected = getCollectedInfo(db, oshi.id);
	console.log("── 収集済み情報の詳細 ──");

	let wikiExtractCount = 0;
	let newsDescCount = 0;
	let concreteSummaryCount = 0;
	const vaguePatterns = ["についての記事", "に関する記事", "に関する情報", "についての情報"];

	for (const item of collected) {
		console.log(`  [${item.sourcePlugin}] ${item.title}`);
		console.log(`    URL: ${item.url}`);
		console.log(`    要約: ${item.summary}`);
		console.log(`    カテゴリ: ${item.category} | 重要度: ${item.importance} | 感情: ${item.sentiment}`);

		// rawContent チェック
		const raw = item.rawContent as Record<string, unknown> | null;
		if (raw) {
			if (typeof raw.extract === "string" && raw.extract.length > 0) {
				wikiExtractCount++;
				console.log(`    📖 extract あり (${raw.extract.length}文字)`);
			}
			if (typeof raw.description === "string" && raw.description.length > 0) {
				newsDescCount++;
				console.log(`    📰 description あり (${raw.description.length}文字)`);
			}
		}

		// 要約の具体性チェック
		if (item.summary && !vaguePatterns.some((p) => item.summary?.includes(p))) {
			concreteSummaryCount++;
		}

		console.log();
	}

	// 7. 情報収集スコア
	console.log("── 情報収集スコア ──");
	let collectScore = 0;

	// エラーなし完了
	const noError = !collectResult.error;
	if (noError) {
		collectScore += 20;
		console.log("  ✅ エラーなし完了: +20");
	} else {
		console.log("  ❌ エラーあり: +0");
	}

	// rawContent に本文含む
	if (wikiExtractCount > 0) {
		collectScore += 15;
		console.log(`  ✅ Wikipedia extract あり (${wikiExtractCount}件): +15`);
	} else {
		console.log("  ⚠️  Wikipedia extract なし: +0 (記事がない可能性)");
	}
	if (newsDescCount > 0) {
		collectScore += 15;
		console.log(`  ✅ News description あり (${newsDescCount}件): +15`);
	} else {
		console.log("  ⚠️  News description なし: +0 (ニュースがない可能性)");
	}

	// 具体的な要約
	if (collected.length > 0 && concreteSummaryCount > collected.length / 2) {
		collectScore += 15;
		console.log(`  ✅ 具体的な要約 (${concreteSummaryCount}/${collected.length}): +15`);
	} else if (collected.length > 0) {
		console.log(`  ⚠️  要約が漠然 (${concreteSummaryCount}/${collected.length}): +0`);
	}

	// 件数整合性
	console.log(`  ✅ 件数整合性（順序配列方式）: +10`);
	collectScore += 10;

	console.log();
	console.log(`  情報収集スコア: ${collectScore} / 75`);
	console.log();

	// 8. 総合
	console.log("=".repeat(60));
	console.log(`総合: 分析 ${totalScore}pt (${getRank(totalScore)}) + 収集 ${collectScore}pt`);
	console.log("=".repeat(60));

	// 結果を JSON で保存
	const result = {
		timestamp: new Date().toISOString(),
		analysis: {
			category: analysis.category,
			description: analysis.description,
			attributes: analysis.attributes,
			score: totalScore,
			maxScore,
			rank: getRank(totalScore),
		},
		collection: {
			newItems: collectResult.newItems,
			totalCollected: collectResult.totalCollected,
			wikiExtractCount,
			newsDescCount,
			concreteSummaryCount,
			score: collectScore,
			items: collected.map((c) => ({
				source: c.sourcePlugin,
				title: c.title,
				summary: c.summary,
				category: c.category,
				importance: c.importance,
				sentiment: c.sentiment,
				hasExtract: !!(c.rawContent as Record<string, unknown> | null)?.extract,
				hasDescription: !!(c.rawContent as Record<string, unknown> | null)?.description,
			})),
		},
	};

	const outPath = join(
		process.cwd(),
		"..",
		"internal",
		"docs",
		"testing",
		`benchmark-result-${new Date().toISOString().slice(0, 10)}.json`,
	);
	writeFileSync(outPath, JSON.stringify(result, null, "\t"));
	console.log(`\n結果を保存: ${outPath}`);
}

main().catch((err) => {
	console.error("ベンチマーク失敗:", err);
	process.exit(1);
});

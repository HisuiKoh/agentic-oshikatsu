import * as p from "@clack/prompts";
import { getUsageSummary } from "../../infrastructure/ai/usage-tracker.js";
import { isInitialized } from "../../infrastructure/config/manager.js";
import { getLocale, t } from "../../shared/i18n/i18n.js";

function formatNumber(n: number): string {
	const locale = getLocale() === "en" ? "en-US" : "ja-JP";
	return n.toLocaleString(locale);
}

function formatCost(cost: number): string {
	if (cost === 0) return "$0.00";
	if (cost < 0.01) return `$${cost.toFixed(6)}`;
	return `$${cost.toFixed(4)}`;
}

export async function execute(_args: string[]): Promise<void> {
	p.intro(t("cost.title"));

	if (!isInitialized()) {
		p.log.error(t("common.notInitialized"));
		return;
	}

	const summaries = getUsageSummary();

	if (summaries.length === 0) {
		p.log.info(t("cost.noHistory"));
		p.outro("");
		return;
	}

	let totalCost = 0;
	let totalInput = 0;
	let totalOutput = 0;
	let totalCount = 0;

	for (const summary of summaries) {
		const lines = [
			`  ${t("cost.requests")}: ${formatNumber(summary.count)}`,
			`  ${t("cost.inputTokens")}: ${formatNumber(summary.totalInputTokens)}`,
			`  ${t("cost.outputTokens")}: ${formatNumber(summary.totalOutputTokens)}`,
			`  ${t("cost.costLabel")}: ${formatCost(summary.totalCost)}`,
		];

		p.note(lines.join("\n"), `${summary.provider.toUpperCase()}`);

		totalCost += summary.totalCost;
		totalInput += summary.totalInputTokens;
		totalOutput += summary.totalOutputTokens;
		totalCount += summary.count;
	}

	if (summaries.length > 1) {
		p.note(
			[
				`  ${t("cost.requests")}: ${formatNumber(totalCount)}`,
				`  ${t("cost.inputTokens")}: ${formatNumber(totalInput)}`,
				`  ${t("cost.outputTokens")}: ${formatNumber(totalOutput)}`,
				`  ${t("cost.totalCost")}: ${formatCost(totalCost)}`,
			].join("\n"),
			t("cost.total"),
		);
	}

	p.outro("");
}

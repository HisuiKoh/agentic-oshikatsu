import { Text } from "ink";
import type { LintSummary } from "../../../core/dashboard/aggregator.js";
import { Panel } from "./Panel.js";

const VERDICT_ICONS: Record<string, string> = {
	PASS: "\u2705",
	WARN: "\u26a0\ufe0f",
	BLOCK: "\ud83d\udeab",
};

interface LintPanelProps {
	results: LintSummary[];
}

export function LintPanel({ results }: LintPanelProps) {
	return (
		<Panel title="Linter">
			{results.length === 0 ? (
				<Text dimColor>/lint [行動] でリスク評価を実行できます</Text>
			) : (
				results.map((r) => {
					const icon = VERDICT_ICONS[r.verdict] ?? "";
					const actionPreview = r.action.length > 35 ? `${r.action.slice(0, 35)}...` : r.action;
					return (
						<Text key={`${r.timestamp}-${r.action.slice(0, 20)}`} wrap="truncate">
							{icon} {r.verdict} - {actionPreview}
						</Text>
					);
				})
			)}
		</Panel>
	);
}

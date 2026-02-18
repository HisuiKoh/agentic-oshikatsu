import { Box, Text } from "ink";
import type { BudgetSummary } from "../../../core/budget/types.js";
import { Panel } from "./Panel.js";

interface BudgetPanelProps {
	summaries: BudgetSummary[];
}

function progressBar(ratio: number, width: number = 15): string {
	const clamped = Math.max(0, Math.min(1, ratio));
	const filled = Math.round(clamped * width);
	const empty = width - filled;
	return "\u2588".repeat(filled) + "\u2591".repeat(empty);
}

function barColor(ratio: number): string {
	if (ratio >= 0.9) return "red";
	if (ratio >= 0.7) return "yellow";
	return "green";
}

export function BudgetPanel({ summaries }: BudgetPanelProps) {
	return (
		<Panel title="予算">
			{summaries.length === 0 ? (
				<Text dimColor>/budget set で月間予算を設定できます</Text>
			) : (
				summaries.map((s) => {
					const pct = Math.round(s.usageRate * 100);
					return (
						<Box key={`${s.type}-${s.period}`} flexDirection="column">
							<Text>
								[{s.type}] <Text color={barColor(s.usageRate)}>{progressBar(s.usageRate)}</Text>{" "}
								{pct}%
							</Text>
							<Text dimColor>
								{"  "}残: {s.remaining.toLocaleString()}円 / {s.limit.toLocaleString()}円
							</Text>
						</Box>
					);
				})
			)}
		</Panel>
	);
}

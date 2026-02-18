import { Text } from "ink";
import type { AiUsageSummary } from "../../../core/dashboard/aggregator.js";
import { Panel } from "./Panel.js";

interface AiUsagePanelProps {
	usage: AiUsageSummary[];
}

export function AiUsagePanel({ usage }: AiUsagePanelProps) {
	return (
		<Panel title="AI 使用量">
			{usage.length === 0 ? (
				<Text dimColor>AI を使用すると利用状況がここに表示されます</Text>
			) : (
				usage.map((u) => {
					const totalTokens = (u.totalInputTokens + u.totalOutputTokens).toLocaleString();
					const cost = u.totalCost.toFixed(4);
					return (
						<Text key={u.provider}>
							[{u.provider}] {u.callCount}回 / {totalTokens} tokens / ${cost}
						</Text>
					);
				})
			)}
		</Panel>
	);
}

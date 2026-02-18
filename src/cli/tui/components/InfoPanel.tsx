import { Text } from "ink";
import type { InfoSummary } from "../../../core/dashboard/aggregator.js";
import { Panel } from "./Panel.js";

interface InfoPanelProps {
	items: InfoSummary[];
}

export function InfoPanel({ items }: InfoPanelProps) {
	return (
		<Panel title="最新情報">
			{items.length === 0 ? (
				<Text dimColor>/collect で推しの最新情報を収集できます</Text>
			) : (
				items.map((info) => {
					const date = (info.publishedAt ?? info.collectedAt).slice(0, 10);
					const cat = info.category ? `[${info.category}]` : "";
					const eventMark = info.eventDate ? ` [${info.eventDate}]` : "";
					return (
						<Text key={`${info.collectedAt}-${info.title}`} wrap="truncate">
							[{date}] {cat} {info.title}
							{eventMark}
						</Text>
					);
				})
			)}
		</Panel>
	);
}

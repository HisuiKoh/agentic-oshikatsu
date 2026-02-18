import { Text } from "ink";
import type { SuggestionSummary } from "../../../core/dashboard/aggregator.js";
import { Panel } from "./Panel.js";

const CATEGORY_LABELS: Record<string, string> = {
	goods: "\ud83d\uded2 グッズ",
	event: "\ud83c\udfab イベント",
	sns: "\ud83d\udcf1 SNS",
	communication: "\ud83d\udcac コミュニケーション",
	creative: "\ud83c\udfa8 クリエイティブ",
	other: "\ud83d\udccc その他",
};

interface SuggestPanelProps {
	suggestions: SuggestionSummary[];
}

export function SuggestPanel({ suggestions }: SuggestPanelProps) {
	return (
		<Panel title="提案">
			{suggestions.length === 0 ? (
				<Text dimColor>/suggest で推し活の提案を生成できます</Text>
			) : (
				suggestions.map((s) => {
					const catLabel = CATEGORY_LABELS[s.category ?? "other"] ?? s.category;
					return (
						<Text key={`${s.createdAt}-${s.content.slice(0, 20)}`} wrap="truncate">
							[{catLabel}] {s.content}
						</Text>
					);
				})
			)}
		</Panel>
	);
}

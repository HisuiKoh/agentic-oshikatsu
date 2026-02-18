import { Text } from "ink";
import type { OshiSummary } from "../../../core/dashboard/aggregator.js";
import { Panel } from "./Panel.js";

interface OshiPanelProps {
	oshi: OshiSummary;
}

export function OshiPanel({ oshi }: OshiPanelProps) {
	return (
		<Panel title="推し情報">
			<Text>
				名前: <Text bold>{oshi.name}</Text>
			</Text>
			<Text>カテゴリ: {oshi.category}</Text>
			{oshi.description && <Text>説明: {oshi.description}</Text>}
			<Text>登録日: {oshi.registeredAt.slice(0, 10)}</Text>
			<Text>
				属性: {oshi.attributeCount}件 / 情報: {oshi.infoCount}件
			</Text>
		</Panel>
	);
}

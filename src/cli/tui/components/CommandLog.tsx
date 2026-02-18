import { Box, Text } from "ink";
import type { CommandLogEntry } from "../types.js";
import { Panel } from "./Panel.js";

interface CommandLogProps {
	entries: CommandLogEntry[];
}

const STATUS_MARKERS: Record<string, { symbol: string; color: string }> = {
	success: { symbol: "\u2713", color: "green" },
	error: { symbol: "\u2717", color: "red" },
	info: { symbol: "\u2022", color: "blue" },
};

export function CommandLog({ entries }: CommandLogProps) {
	const visible = entries.slice(-5);

	return (
		<Panel title="コマンドログ">
			{visible.length === 0 ? (
				<Text dimColor>コマンドを入力してください</Text>
			) : (
				visible.map((entry) => {
					const marker = STATUS_MARKERS[entry.status] ?? STATUS_MARKERS.info;
					return (
						<Box key={entry.id} flexDirection="column">
							<Text dimColor>
								{">"} {entry.command}
							</Text>
							{entry.resolvedCommand && (
								<Text dimColor color="yellow">
									{"\u2192"} {entry.resolvedCommand}
								</Text>
							)}
							<Text color={marker.color}>
								{marker.symbol} {entry.result}
							</Text>
						</Box>
					);
				})
			)}
		</Panel>
	);
}

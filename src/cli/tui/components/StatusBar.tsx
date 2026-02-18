import { Box, Text } from "ink";

interface StatusBarProps {
	oshiName: string | undefined;
	oshiCount: number;
}

export function StatusBar({ oshiName, oshiCount }: StatusBarProps) {
	return (
		<Box justifyContent="space-between">
			<Box>
				{oshiName && (
					<Text dimColor>
						推し: <Text bold>{oshiName}</Text>
						{oshiCount > 1 && ` (${oshiCount}人中)`}
					</Text>
				)}
			</Box>
			<Box gap={2}>
				{oshiCount > 1 && <Text dimColor>[Tab:切替]</Text>}
				<Text dimColor>[/help:コマンド一覧]</Text>
			</Box>
		</Box>
	);
}

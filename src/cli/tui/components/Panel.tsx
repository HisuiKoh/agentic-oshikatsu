import { Box, Text } from "ink";
import type { ReactNode } from "react";

interface PanelProps {
	title: string;
	children: ReactNode;
	width?: number | string;
	minHeight?: number;
}

export function Panel({ title, children, width, minHeight }: PanelProps) {
	return (
		<Box
			flexDirection="column"
			borderStyle="single"
			borderColor="cyan"
			width={width}
			minHeight={minHeight}
			paddingX={1}
		>
			<Box>
				<Text bold color="cyan">
					{title}
				</Text>
			</Box>
			{children}
		</Box>
	);
}

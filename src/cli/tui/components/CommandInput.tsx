import { TextInput } from "@inkjs/ui";
import { Box, Text, useInput, useStdout } from "ink";
import { useState } from "react";
import { TUI_COMMANDS } from "../commands.js";
import { useOshiriSpinner } from "../hooks/useOshiriSpinner.js";

interface CommandInputProps {
	onSubmit: (value: string) => void;
	isRunning: boolean;
}

export function CommandInput({ onSubmit, isRunning }: CommandInputProps) {
	const [value, setValue] = useState("");
	const [inputKey, setInputKey] = useState(0);
	const [selectedIndex, setSelectedIndex] = useState(-1);
	const spinner = useOshiriSpinner(isRunning);
	const { stdout } = useStdout();
	const columns = stdout?.columns ?? 80;
	const rule = "─".repeat(columns);

	const isTypingCommand = value.startsWith("/") && !value.includes(" ");
	const filtered = isTypingCommand ? TUI_COMMANDS.filter((c) => c.name.startsWith(value)) : [];

	// サジェストリストが消えたら選択をリセット
	const showSuggest = filtered.length > 0;

	const handleChange = (v: string) => {
		setValue(v);
		// 入力が変わったら選択をリセット
		setSelectedIndex(-1);
	};

	const handleSubmit = (v: string) => {
		setValue("");
		setInputKey((k) => k + 1);
		setSelectedIndex(-1);
		onSubmit(v);
	};

	// Tab で補完、上下で候補選択（TextInput がスキップするキーを処理）
	useInput(
		(_input, key) => {
			if (!showSuggest) return;

			if (key.upArrow) {
				setSelectedIndex((i) => (i <= 0 ? filtered.length - 1 : i - 1));
			} else if (key.downArrow) {
				setSelectedIndex((i) => (i >= filtered.length - 1 ? 0 : i + 1));
			} else if (key.tab) {
				// 選択中の候補、または候補が1つだけの場合に補完
				const target =
					selectedIndex >= 0 ? filtered[selectedIndex] : filtered.length === 1 ? filtered[0] : null;
				if (target) {
					const completed = target.args ? `${target.name} ` : target.name;
					setValue(completed);
					setInputKey((k) => k + 1);
					setSelectedIndex(-1);
				}
			}
		},
		{ isActive: !isRunning },
	);

	if (isRunning) {
		return (
			<Box flexDirection="column">
				<Text dimColor>{rule}</Text>
				<Box>
					<Text color="yellow">{spinner} 実行中...</Text>
				</Box>
				<Text dimColor>{rule}</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			{showSuggest && (
				<Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
					{filtered.map((cmd, i) => {
						const isSelected = i === selectedIndex;
						return (
							<Box key={cmd.name} gap={1}>
								<Text color={isSelected ? "green" : "cyan"} bold={isSelected} inverse={isSelected}>
									{cmd.name}
								</Text>
								{cmd.args && <Text dimColor>{cmd.args}</Text>}
								<Text dimColor>— {cmd.description}</Text>
							</Box>
						);
					})}
				</Box>
			)}
			<Text dimColor>{rule}</Text>
			<Box>
				<Text color="cyan">oshi{">"} </Text>
				<TextInput
					key={inputKey}
					defaultValue={value}
					placeholder="やりたいことを入力（/help でコマンド一覧）"
					onChange={handleChange}
					onSubmit={handleSubmit}
				/>
			</Box>
			<Text dimColor>{rule}</Text>
		</Box>
	);
}

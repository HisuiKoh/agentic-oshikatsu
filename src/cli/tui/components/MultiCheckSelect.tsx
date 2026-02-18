import { Box, Text, useInput } from "ink";
import { useRef, useState } from "react";

const POINTER = "❯";
const CHECKBOX_ON = "◉";
const CHECKBOX_OFF = "◯";
const CHECK_MARK = "✔";

interface Option {
	label: string;
	value: string;
}

interface MultiCheckSelectProps {
	options: Option[];
	onSubmit: (values: string[]) => void;
	hint?: string;
}

/**
 * 複数選択コンポーネント（全角スペース対応）
 *
 * - ↑↓: カーソル移動
 * - スペース（半角/全角）: 選択/解除
 * - Enter: 確定
 */
export function MultiCheckSelect({ options, onSubmit, hint }: MultiCheckSelectProps) {
	const [focusIndex, setFocusIndex] = useState(0);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [submitted, setSubmitted] = useState(false);
	const submittedRef = useRef(false);

	useInput((input, key) => {
		if (submittedRef.current) return;

		if (key.downArrow) {
			setFocusIndex((prev) => Math.min(prev + 1, options.length - 1));
		}
		if (key.upArrow) {
			setFocusIndex((prev) => Math.max(prev - 1, 0));
		}
		// 半角スペースまたは全角スペースでトグル
		if (input === " " || input === "\u3000") {
			const value = options[focusIndex]?.value;
			if (value !== undefined) {
				setSelected((prev) => {
					const next = new Set(prev);
					if (next.has(value)) {
						next.delete(value);
					} else {
						next.add(value);
					}
					return next;
				});
			}
		}
		if (key.return) {
			submittedRef.current = true;
			setSubmitted(true);
			onSubmit([...selected]);
		}
	});

	// 確定後: 選択した項目だけを確定表示
	if (submitted) {
		const selectedOptions = options.filter((o) => selected.has(o.value));
		if (selectedOptions.length === 0) {
			return (
				<Box>
					<Text dimColor>{CHECK_MARK} 該当なし（AI に分析を任せる）</Text>
				</Box>
			);
		}
		return (
			<Box flexDirection="column">
				{selectedOptions.map((option) => (
					<Box key={option.value}>
						<Text color="green">
							{CHECK_MARK} {option.label}
						</Text>
					</Box>
				))}
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			{hint && (
				<Box marginBottom={1}>
					<Text dimColor>{hint}</Text>
				</Box>
			)}
			{options.map((option, i) => {
				const isFocused = i === focusIndex;
				const isSelected = selected.has(option.value);
				return (
					<Box key={option.value}>
						<Text color={isFocused ? "cyan" : undefined}>{isFocused ? POINTER : " "} </Text>
						<Text color={isFocused ? "cyan" : undefined}>
							{isSelected ? CHECKBOX_ON : CHECKBOX_OFF} {option.label}
						</Text>
					</Box>
				);
			})}
		</Box>
	);
}

import { useEffect, useState } from "react";

/**
 * おしりスピナー 🍑
 *
 * 推し → おしり → おしり型の文字をコロコロ回す。
 * 処理中であることを楽しく伝えるアニメーション。
 */

const OSHIRI_FRAMES = ["3", "B", "β", "з", "Ʒ", "ɜ"];
const DEFAULT_INTERVAL_MS = 120;

/** おしりスピナーの現在フレームを返すフック（active=false のとき interval を停止） */
export function useOshiriSpinner(active = true, intervalMs = DEFAULT_INTERVAL_MS): string {
	const [frameIndex, setFrameIndex] = useState(0);

	useEffect(() => {
		if (!active) return;

		const timer = setInterval(() => {
			setFrameIndex((prev) => (prev + 1) % OSHIRI_FRAMES.length);
		}, intervalMs);

		return () => clearInterval(timer);
	}, [active, intervalMs]);

	return OSHIRI_FRAMES[frameIndex];
}

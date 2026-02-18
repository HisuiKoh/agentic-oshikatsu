import { AIError } from "../../shared/errors.js";
import { readConfig } from "../config/manager.js";
import { createClaudeProvider } from "./claude-provider.js";
import { createCodexProvider } from "./codex-provider.js";
import type { AIProvider, AIProviderId } from "./types.js";

/** 指定されたプロバイダーのインスタンスを生成 */
export function createProvider(providerId?: AIProviderId): AIProvider {
	const config = readConfig();
	const id = providerId ?? config.defaultProvider;

	if (id === "claude") {
		if (!config.providers.claude && !process.env.ANTHROPIC_API_KEY) {
			throw new AIError("Claude の認証情報が設定されていません。`oshi auth` を実行してください。");
		}
		return createClaudeProvider();
	}

	if (id === "codex") {
		if (!config.providers.codex?.enabled) {
			throw new AIError("Codex が設定されていません。`oshi auth` を実行してください。");
		}
		return createCodexProvider();
	}

	throw new AIError(`不明なプロバイダー: ${id}`);
}

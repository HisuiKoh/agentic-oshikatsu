import type { z } from "zod";

/** AI プロバイダー ID */
export type AIProviderId = "claude" | "codex";

/** クエリオプション */
export interface QueryOptions {
	model?: string;
	systemPrompt?: string;
	maxTokens?: number;
	temperature?: number;
	purpose?: AIPurpose;
}

/** AI 使用目的 */
export type AIPurpose =
	| "oshi_registration"
	| "oshi_identification"
	| "info_analysis"
	| "suggestion"
	| "linting"
	| "intent_resolution"
	| "other";

/** AI レスポンス */
export interface AIResponse {
	content: string;
	usage: TokenUsage;
	model: string;
	provider: AIProviderId;
}

/** トークン使用量 */
export interface TokenUsage {
	inputTokens: number;
	outputTokens: number;
	cacheTokens?: number;
}

/** 構造化 AI レスポンス */
export interface StructuredAIResponse<T> {
	data: T;
	usage: TokenUsage;
	model: string;
	provider: AIProviderId;
}

/** AI プロバイダーインターフェース */
export interface AIProvider {
	id: AIProviderId;
	query(prompt: string, options?: QueryOptions): Promise<AIResponse>;
	queryStructured<T>(
		prompt: string,
		schema: z.ZodSchema<T>,
		options?: QueryOptions,
	): Promise<StructuredAIResponse<T>>;
	estimateCost(inputTokens: number, outputTokens: number, cacheTokens?: number): number;
}

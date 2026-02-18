import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { AIProvider, AIResponse } from "@/infrastructure/ai/types.js";

// queryStructured の内部ロジック（リトライ・パース・バリデーション）をテストする。
// createClaudeProvider は readConfig に依存するため、AIProvider を直接組み立てて
// query メソッドだけモックし、queryStructured の実装を再現する。

// テスト用スキーマ
const TestSchema = z.object({
	name: z.string(),
	count: z.coerce.string(), // 数値→文字列変換（z.coerce.string のテスト）
});

const mockUsage = { inputTokens: 100, outputTokens: 50 };

function makeResponse(content: string): AIResponse {
	return { content, usage: mockUsage, model: "test", provider: "claude" };
}

/**
 * queryStructured のロジックを再現するファクトリ。
 * claude-provider.ts の実装と同じリトライ・パースロジックを持つが、
 * query() は外部から注入できる。
 */
function createTestProvider(queryFn: AIProvider["query"]): AIProvider {
	const provider: AIProvider = {
		id: "claude",
		query: queryFn,
		async queryStructured<T>(
			prompt: string,
			schema: z.ZodSchema<T>,
			options?,
		) {
			const structuredRetries = 1;
			let retryHint = "";

			for (let attempt = 0; attempt <= structuredRetries; attempt++) {
				const systemPrompt = [
					options?.systemPrompt ?? "",
					"必ず JSON 形式のみで応答してください。",
					retryHint,
				]
					.filter(Boolean)
					.join("\n\n");

				const response = await provider.query(prompt, {
					...options,
					systemPrompt,
				});

				let parsed: unknown;
				try {
					parsed = JSON.parse(response.content.trim());
				} catch {
					const codeBlockMatch = response.content.match(
						/```(?:json)?\s*\n([\s\S]*?)\n\s*```/,
					);
					if (codeBlockMatch?.[1]) {
						try {
							parsed = JSON.parse(codeBlockMatch[1].trim());
						} catch {
							// ignore
						}
					}

					if (parsed === undefined) {
						const jsonMatch = response.content.match(
							/(\{[\s\S]*\}|\[[\s\S]*\])/,
						);
						if (jsonMatch?.[1]) {
							try {
								parsed = JSON.parse(jsonMatch[1].trim());
							} catch {
								// ignore
							}
						}
					}

					if (parsed === undefined) {
						if (attempt < structuredRetries) {
							retryHint = "JSON として解析できませんでした。";
							continue;
						}
						throw new Error("PARSE_ERROR");
					}
				}

				const result = schema.safeParse(parsed);
				if (!result.success) {
					if (attempt < structuredRetries) {
						retryHint = `バリデーション失敗: ${result.error.message}`;
						continue;
					}
					throw new Error("VALIDATION_ERROR");
				}

				return {
					data: result.data,
					usage: response.usage,
					model: response.model,
					provider: "claude" as const,
				};
			}

			throw new Error("VALIDATION_ERROR");
		},
		estimateCost: () => 0,
	};
	return provider;
}

describe("queryStructured パース・リトライロジック", () => {
	it("正常な JSON をパースできる", async () => {
		const queryFn = vi.fn().mockResolvedValue(
			makeResponse('{"name": "test", "count": "5"}'),
		);
		const provider = createTestProvider(queryFn);
		const result = await provider.queryStructured("prompt", TestSchema);
		expect(result.data).toEqual({ name: "test", count: "5" });
		expect(queryFn).toHaveBeenCalledTimes(1);
	});

	it("数値の value を z.coerce.string で文字列に変換できる", async () => {
		const queryFn = vi.fn().mockResolvedValue(
			makeResponse('{"name": "test", "count": 42}'),
		);
		const provider = createTestProvider(queryFn);
		const result = await provider.queryStructured("prompt", TestSchema);
		expect(result.data).toEqual({ name: "test", count: "42" });
	});

	it("コードブロックで囲まれた JSON をパースできる", async () => {
		const queryFn = vi.fn().mockResolvedValue(
			makeResponse('```json\n{"name": "test", "count": "1"}\n```'),
		);
		const provider = createTestProvider(queryFn);
		const result = await provider.queryStructured("prompt", TestSchema);
		expect(result.data).toEqual({ name: "test", count: "1" });
	});

	it("前後に説明テキストがある JSON を抽出できる", async () => {
		const queryFn = vi.fn().mockResolvedValue(
			makeResponse('以下が結果です:\n{"name": "test", "count": "1"}\n以上です。'),
		);
		const provider = createTestProvider(queryFn);
		const result = await provider.queryStructured("prompt", TestSchema);
		expect(result.data).toEqual({ name: "test", count: "1" });
	});

	it("JSON パース失敗時にリトライする", async () => {
		const queryFn = vi
			.fn()
			.mockResolvedValueOnce(makeResponse("これは JSON ではありません"))
			.mockResolvedValueOnce(makeResponse('{"name": "retry", "count": "1"}'));
		const provider = createTestProvider(queryFn);
		const result = await provider.queryStructured("prompt", TestSchema);
		expect(result.data).toEqual({ name: "retry", count: "1" });
		expect(queryFn).toHaveBeenCalledTimes(2);
	});

	it("バリデーション失敗時にリトライする", async () => {
		// name が欠けている不正なレスポンス → リトライで正しいレスポンス
		const queryFn = vi
			.fn()
			.mockResolvedValueOnce(makeResponse('{"count": "1"}'))
			.mockResolvedValueOnce(makeResponse('{"name": "fixed", "count": "1"}'));
		const provider = createTestProvider(queryFn);
		const result = await provider.queryStructured("prompt", TestSchema);
		expect(result.data).toEqual({ name: "fixed", count: "1" });
		expect(queryFn).toHaveBeenCalledTimes(2);
	});

	it("リトライ上限を超えるとエラーになる", async () => {
		const queryFn = vi.fn().mockResolvedValue(
			makeResponse("not json at all"),
		);
		const provider = createTestProvider(queryFn);
		await expect(
			provider.queryStructured("prompt", TestSchema),
		).rejects.toThrow("PARSE_ERROR");
		// structuredRetries=1 なので 2 回呼ばれる
		expect(queryFn).toHaveBeenCalledTimes(2);
	});

	it("バリデーション失敗がリトライ上限を超えるとエラーになる", async () => {
		const queryFn = vi.fn().mockResolvedValue(
			makeResponse('{"wrong_field": true}'),
		);
		const provider = createTestProvider(queryFn);
		await expect(
			provider.queryStructured("prompt", TestSchema),
		).rejects.toThrow("VALIDATION_ERROR");
		expect(queryFn).toHaveBeenCalledTimes(2);
	});

	it("リトライ時にヒントがシステムプロンプトに追加される", async () => {
		const queryFn = vi
			.fn()
			.mockResolvedValueOnce(makeResponse("bad"))
			.mockResolvedValueOnce(makeResponse('{"name": "ok", "count": "1"}'));
		const provider = createTestProvider(queryFn);
		await provider.queryStructured("prompt", TestSchema);

		// 2 回目の呼び出しで systemPrompt にリトライヒントが含まれる
		const secondCall = queryFn.mock.calls[1];
		const opts = secondCall[1] as { systemPrompt?: string };
		expect(opts.systemPrompt).toContain("JSON として解析できませんでした");
	});
});

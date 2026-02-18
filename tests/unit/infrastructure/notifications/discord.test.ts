import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	notifyLintWarning,
	notifyNewInfo,
	sendDiscordNotification,
} from "@/infrastructure/notifications/discord.js";

// readConfig をモック
vi.mock("@/infrastructure/config/manager.js", () => ({
	readConfig: vi.fn(),
}));

import { readConfig } from "@/infrastructure/config/manager.js";

const mockReadConfig = vi.mocked(readConfig);

describe("Discord 通知", () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		vi.clearAllMocks();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	describe("sendDiscordNotification", () => {
		it("通知が無効の場合は何もしない", async () => {
			mockReadConfig.mockReturnValue({
				notifications: { discord: { enabled: false } },
			} as never);

			globalThis.fetch = vi.fn();

			await sendDiscordNotification("テスト", "テスト説明");

			expect(globalThis.fetch).not.toHaveBeenCalled();
		});

		it("webhookUrl が未設定の場合は何もしない", async () => {
			mockReadConfig.mockReturnValue({
				notifications: { discord: { enabled: true } },
			} as never);

			globalThis.fetch = vi.fn();

			await sendDiscordNotification("テスト", "テスト説明");

			expect(globalThis.fetch).not.toHaveBeenCalled();
		});

		it("有効な設定の場合に Webhook を送信する", async () => {
			mockReadConfig.mockReturnValue({
				notifications: {
					discord: {
						enabled: true,
						webhookUrl: "https://discord.com/api/webhooks/test",
					},
				},
			} as never);

			globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

			await sendDiscordNotification("テストタイトル", "テスト説明", 0x3498db);

			expect(globalThis.fetch).toHaveBeenCalledOnce();
			const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
			expect(fetchCall[0]).toBe("https://discord.com/api/webhooks/test");

			const options = fetchCall[1] as RequestInit;
			const body = JSON.parse(options.body as string);
			expect(body.embeds).toHaveLength(1);
			expect(body.embeds[0].title).toBe("テストタイトル");
			expect(body.embeds[0].description).toBe("テスト説明");
			expect(body.embeds[0].color).toBe(0x3498db);
			expect(body.embeds[0].footer.text).toBe("agentic-oshikatsu");
		});

		it("HTTP エラー時はログ出力のみで例外を投げない", async () => {
			mockReadConfig.mockReturnValue({
				notifications: {
					discord: {
						enabled: true,
						webhookUrl: "https://discord.com/api/webhooks/test",
					},
				},
			} as never);

			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 400,
			});

			// 例外が投げられないことを確認
			await expect(sendDiscordNotification("テスト", "テスト説明")).resolves.toBeUndefined();
		});

		it("ネットワークエラー時はログ出力のみで例外を投げない", async () => {
			mockReadConfig.mockReturnValue({
				notifications: {
					discord: {
						enabled: true,
						webhookUrl: "https://discord.com/api/webhooks/test",
					},
				},
			} as never);

			globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

			await expect(sendDiscordNotification("テスト", "テスト説明")).resolves.toBeUndefined();
		});

		it("readConfig が例外を投げた場合は何もしない", async () => {
			mockReadConfig.mockImplementation(() => {
				throw new Error("Config not found");
			});

			globalThis.fetch = vi.fn();

			await sendDiscordNotification("テスト", "テスト説明");

			expect(globalThis.fetch).not.toHaveBeenCalled();
		});
	});

	describe("notifyNewInfo", () => {
		it("新着が 0 件の場合は何もしない", async () => {
			globalThis.fetch = vi.fn();

			await notifyNewInfo("テスト推し", 0);

			expect(globalThis.fetch).not.toHaveBeenCalled();
		});

		it("新着がある場合に通知を送信する", async () => {
			mockReadConfig.mockReturnValue({
				notifications: {
					discord: {
						enabled: true,
						webhookUrl: "https://discord.com/api/webhooks/test",
					},
				},
			} as never);

			globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

			await notifyNewInfo("杵月のあ", 5);

			expect(globalThis.fetch).toHaveBeenCalledOnce();
			const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
			const body = JSON.parse((fetchCall[1] as RequestInit).body as string);
			expect(body.embeds[0].title).toContain("杵月のあ");
			expect(body.embeds[0].description).toContain("5 件");
		});
	});

	describe("notifyLintWarning", () => {
		it("WARN 時に黄色で通知を送信する", async () => {
			mockReadConfig.mockReturnValue({
				notifications: {
					discord: {
						enabled: true,
						webhookUrl: "https://discord.com/api/webhooks/test",
					},
				},
			} as never);

			globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

			await notifyLintWarning("テスト推し", "高額グッズを購入", "WARN", [
				{ ruleId: "budget-rule", message: "予算超過のリスクあり" },
			]);

			const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
			const body = JSON.parse((fetchCall[1] as RequestInit).body as string);
			expect(body.embeds[0].title).toContain("WARN");
			expect(body.embeds[0].color).toBe(0xf1c40f); // yellow
			expect(body.embeds[0].description).toContain("高額グッズを購入");
		});

		it("BLOCK 時に赤色で通知を送信する", async () => {
			mockReadConfig.mockReturnValue({
				notifications: {
					discord: {
						enabled: true,
						webhookUrl: "https://discord.com/api/webhooks/test",
					},
				},
			} as never);

			globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

			await notifyLintWarning("テスト推し", "危険な行動", "BLOCK", [
				{ ruleId: "keyword-rule", message: "禁止キーワード検出" },
			]);

			const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
			const body = JSON.parse((fetchCall[1] as RequestInit).body as string);
			expect(body.embeds[0].title).toContain("BLOCK");
			expect(body.embeds[0].color).toBe(0xe74c3c); // red
		});

		it("評価が 5 件を超える場合は先頭 5 件のみ含める", async () => {
			mockReadConfig.mockReturnValue({
				notifications: {
					discord: {
						enabled: true,
						webhookUrl: "https://discord.com/api/webhooks/test",
					},
				},
			} as never);

			globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

			const evaluations = Array.from({ length: 8 }, (_, i) => ({
				ruleId: `rule-${i}`,
				message: `メッセージ ${i}`,
			}));

			await notifyLintWarning("テスト推し", "行動", "WARN", evaluations);

			const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
			const body = JSON.parse((fetchCall[1] as RequestInit).body as string);
			const description = body.embeds[0].description;
			// 先頭 5 件のみ含み、残件数を表示
			expect(description).toContain("メッセージ 0");
			expect(description).toContain("メッセージ 4");
			expect(description).not.toContain("メッセージ 5");
			expect(description).toContain("他 3 件");
		});
	});
});

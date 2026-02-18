import { describe, expect, it } from "vitest";
import { AIError, AuthError, BaseError, ConfigError, ValidationError } from "@/shared/errors.js";

describe("エラークラス", () => {
	it("BaseError にコードとメッセージが設定される", () => {
		const err = new BaseError("テスト", "TEST_CODE");
		expect(err.message).toBe("テスト");
		expect(err.code).toBe("TEST_CODE");
		expect(err.name).toBe("BaseError");
	});

	it("ValidationError は VALIDATION_ERROR コードを持つ", () => {
		const err = new ValidationError("入力エラー");
		expect(err.code).toBe("VALIDATION_ERROR");
		expect(err).toBeInstanceOf(BaseError);
	});

	it("AIError は cause を保持する", () => {
		const cause = new Error("元エラー");
		const err = new AIError("AI失敗", cause);
		expect(err.cause).toBe(cause);
	});

	it("AuthError は AUTH_ERROR コードを持つ", () => {
		expect(new AuthError("認証失敗").code).toBe("AUTH_ERROR");
	});

	it("ConfigError は CONFIG_ERROR コードを持つ", () => {
		expect(new ConfigError("設定エラー").code).toBe("CONFIG_ERROR");
	});
});

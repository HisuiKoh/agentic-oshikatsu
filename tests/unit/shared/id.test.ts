import { describe, expect, it } from "vitest";
import { generateId } from "@/shared/id.js";

describe("generateId", () => {
	it("デフォルトで21文字のIDを生成する", () => {
		const id = generateId();
		expect(id).toHaveLength(21);
	});

	it("指定サイズのIDを生成する", () => {
		const id = generateId(10);
		expect(id).toHaveLength(10);
	});

	it("一意のIDを生成する", () => {
		const ids = new Set(Array.from({ length: 100 }, () => generateId()));
		expect(ids.size).toBe(100);
	});
});

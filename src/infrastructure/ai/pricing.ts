import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface ModelPricing {
	inputPerMToken: number;
	outputPerMToken: number;
	cacheReadPerMToken: number;
}

interface Pricing {
	claude: Record<string, ModelPricing>;
}

let cached: Pricing | null = null;

/** pricing.json を読み込み（キャッシュ） */
export function loadPricing(): Pricing {
	if (cached) return cached;

	const __dirname = dirname(fileURLToPath(import.meta.url));
	const pricingPath = join(__dirname, "..", "..", "..", "assets", "pricing.json");

	const raw = readFileSync(pricingPath, "utf-8");
	cached = JSON.parse(raw) as Pricing;
	return cached;
}

import type { Config } from "./schema.js";

export const DEFAULT_CONFIG: Config = {
	providers: {},
	defaultProvider: "claude",
	models: {
		default: "claude-sonnet-4-5-20250929",
		linter: "claude-haiku-4-5-20251001",
	},
	externalApis: {},
	locale: "ja",
	notifications: {
		discord: {
			enabled: false,
		},
	},
	budget: {
		defaultCurrency: "JPY",
	},
	linter: {},
};

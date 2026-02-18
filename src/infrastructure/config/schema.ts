import { z } from "zod";

export const ConfigSchema = z.object({
	providers: z.object({
		claude: z
			.object({
				authMethod: z.enum(["api_key", "oauth", "cli_detect"]).optional(),
				apiKey: z.string().optional(),
				oauth: z
					.object({
						accessToken: z.string(),
						refreshToken: z.string(),
						expiresAt: z.number(),
					})
					.optional(),
			})
			.optional(),
		codex: z
			.object({
				enabled: z.boolean().default(false),
				cliPath: z.string().optional(),
			})
			.optional(),
	}),
	defaultProvider: z.enum(["claude", "codex"]).default("claude"),
	models: z.object({
		default: z.string().default("claude-sonnet-4-5-20250929"),
		linter: z.string().default("claude-haiku-4-5-20251001"),
	}),
	externalApis: z.object({
		youtube: z.string().optional(),
		x: z.string().optional(),
	}),
	locale: z.enum(["ja", "en"]).default("ja"),
	notifications: z.object({
		discord: z.object({
			enabled: z.boolean().default(false),
			webhookUrl: z.string().url().optional(),
		}),
	}),
	budget: z.object({
		defaultCurrency: z.string().default("JPY"),
	}),
	linter: z.object({}),
});

export type Config = z.infer<typeof ConfigSchema>;

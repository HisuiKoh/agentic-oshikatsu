import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// oshis — 全推しの共通属性
export const oshis = sqliteTable("oshis", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	category: text("category").notNull(),
	subcategory: text("subcategory"),
	description: text("description"),
	imageUrl: text("image_url"),
	registeredAt: text("registered_at").notNull(),
	metadata: text("metadata", { mode: "json" }),
});

// oshi_attributes — 汎用KV（CASCADE）
export const oshiAttributes = sqliteTable(
	"oshi_attributes",
	{
		id: text("id").primaryKey(),
		oshiId: text("oshi_id")
			.notNull()
			.references(() => oshis.id, { onDelete: "cascade" }),
		key: text("key").notNull(),
		value: text("value").notNull(),
		source: text("source"),
		collectedAt: text("collected_at"),
	},
	(table) => [uniqueIndex("oshi_attributes_oshi_key_unique").on(table.oshiId, table.key)],
);

// collected_info — 収集した情報（CASCADE）
export const collectedInfo = sqliteTable("collected_info", {
	id: text("id").primaryKey(),
	oshiId: text("oshi_id")
		.notNull()
		.references(() => oshis.id, { onDelete: "cascade" }),
	sourcePlugin: text("source_plugin").notNull(),
	title: text("title").notNull(),
	url: text("url").unique(),
	summary: text("summary"),
	category: text("category"),
	importance: integer("importance"),
	sentiment: text("sentiment"),
	rawContent: text("raw_content", { mode: "json" }),
	collectedAt: text("collected_at").notNull(),
	publishedAt: text("published_at"),
	eventDate: text("event_date"),
	isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
	relevanceScore: integer("relevance_score"),
	approvalStatus: text("approval_status", {
		enum: ["approved", "pending", "rejected"],
	})
		.notNull()
		.default("approved"),
});

// budget_entries — 支出記録（SET NULL）
export const budgetEntries = sqliteTable("budget_entries", {
	id: text("id").primaryKey(),
	oshiId: text("oshi_id").references(() => oshis.id, { onDelete: "set null" }),
	type: text("type", { enum: ["oshi_activity", "ai_api", "external_api"] }).notNull(),
	category: text("category"),
	amount: integer("amount").notNull(),
	currency: text("currency").notNull().default("JPY"),
	description: text("description"),
	date: text("date").notNull(),
	metadata: text("metadata", { mode: "json" }),
});

// budget_limits — 予算上限（SET NULL）
export const budgetLimits = sqliteTable("budget_limits", {
	id: text("id").primaryKey(),
	oshiId: text("oshi_id").references(() => oshis.id, { onDelete: "set null" }),
	type: text("type", { enum: ["oshi_activity", "ai_api", "external_api"] }).notNull(),
	period: text("period", { enum: ["monthly", "weekly", "daily"] }).notNull(),
	limit: integer("limit").notNull(),
	currency: text("currency").notNull().default("JPY"),
	createdAt: text("created_at").notNull(),
});

// ai_usage — AI API 使用量
export const aiUsage = sqliteTable("ai_usage", {
	id: text("id").primaryKey(),
	provider: text("provider").notNull(),
	model: text("model"),
	inputTokens: integer("input_tokens").notNull(),
	outputTokens: integer("output_tokens").notNull(),
	cacheTokens: integer("cache_tokens").default(0),
	cost: real("cost"),
	purpose: text("purpose", {
		enum: [
			"oshi_registration",
			"oshi_identification",
			"info_analysis",
			"suggestion",
			"linting",
			"intent_resolution",
			"other",
		],
	}).notNull(),
	timestamp: text("timestamp").notNull(),
});

// suggestions — AI による行動提案
export const suggestions = sqliteTable("suggestions", {
	id: text("id").primaryKey(),
	oshiId: text("oshi_id")
		.notNull()
		.references(() => oshis.id, { onDelete: "cascade" }),
	category: text("category"),
	content: text("content").notNull(),
	context: text("context", { mode: "json" }),
	createdAt: text("created_at").notNull(),
});

// lint_results — Linter 評価履歴
export const lintResults = sqliteTable("lint_results", {
	id: text("id").primaryKey(),
	suggestionId: text("suggestion_id").references(() => suggestions.id, { onDelete: "cascade" }),
	action: text("action").notNull(),
	verdict: text("verdict", { enum: ["PASS", "WARN", "BLOCK"] }).notNull(),
	evaluations: text("evaluations", { mode: "json" }),
	timestamp: text("timestamp").notNull(),
});

// user_profile — パーソナリティ設定
export const userProfile = sqliteTable("user_profile", {
	id: text("id").primaryKey(),
	formality: text("formality", { enum: ["casual", "neutral", "formal"] })
		.notNull()
		.default("neutral"),
	feedbackStyle: text("feedback_style", { enum: ["gentle", "balanced", "strict"] })
		.notNull()
		.default("balanced"),
	detailLevel: text("detail_level", { enum: ["brief", "normal", "detailed"] })
		.notNull()
		.default("normal"),
	decoration: text("decoration", { enum: ["minimal", "moderate", "rich"] })
		.notNull()
		.default("moderate"),
	oshiIntensity: text("oshi_intensity", { enum: ["casual", "moderate", "intense"] })
		.notNull()
		.default("moderate"),
	locale: text("locale").notNull().default("ja"),
	updatedAt: text("updated_at").notNull(),
});

// settings — 汎用設定KV
export const settings = sqliteTable("settings", {
	key: text("key").primaryKey(),
	value: text("value", { mode: "json" }),
	updatedAt: text("updated_at").notNull(),
});

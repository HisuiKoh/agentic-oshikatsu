CREATE TABLE `ai_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`model` text,
	`input_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL,
	`cache_tokens` integer DEFAULT 0,
	`cost` real,
	`purpose` text NOT NULL,
	`timestamp` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `budget_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`oshi_id` text,
	`type` text NOT NULL,
	`category` text,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'JPY' NOT NULL,
	`description` text,
	`date` text NOT NULL,
	`metadata` text,
	FOREIGN KEY (`oshi_id`) REFERENCES `oshis`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `budget_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`oshi_id` text,
	`type` text NOT NULL,
	`period` text NOT NULL,
	`limit` integer NOT NULL,
	`currency` text DEFAULT 'JPY' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`oshi_id`) REFERENCES `oshis`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `collected_info` (
	`id` text PRIMARY KEY NOT NULL,
	`oshi_id` text NOT NULL,
	`source_plugin` text NOT NULL,
	`title` text NOT NULL,
	`url` text,
	`summary` text,
	`category` text,
	`importance` integer,
	`sentiment` text,
	`raw_content` text,
	`collected_at` text NOT NULL,
	`published_at` text,
	`is_read` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`oshi_id`) REFERENCES `oshis`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collected_info_url_unique` ON `collected_info` (`url`);--> statement-breakpoint
CREATE TABLE `lint_results` (
	`id` text PRIMARY KEY NOT NULL,
	`suggestion_id` text,
	`action` text NOT NULL,
	`verdict` text NOT NULL,
	`evaluations` text,
	`timestamp` text NOT NULL,
	FOREIGN KEY (`suggestion_id`) REFERENCES `suggestions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `oshi_attributes` (
	`id` text PRIMARY KEY NOT NULL,
	`oshi_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`source` text,
	`collected_at` text,
	FOREIGN KEY (`oshi_id`) REFERENCES `oshis`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oshi_attributes_oshi_key_unique` ON `oshi_attributes` (`oshi_id`,`key`);--> statement-breakpoint
CREATE TABLE `oshis` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`subcategory` text,
	`description` text,
	`image_url` text,
	`registered_at` text NOT NULL,
	`metadata` text
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`oshi_id` text NOT NULL,
	`category` text,
	`content` text NOT NULL,
	`context` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`oshi_id`) REFERENCES `oshis`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_profile` (
	`id` text PRIMARY KEY NOT NULL,
	`formality` text DEFAULT 'neutral' NOT NULL,
	`feedback_style` text DEFAULT 'balanced' NOT NULL,
	`detail_level` text DEFAULT 'normal' NOT NULL,
	`decoration` text DEFAULT 'moderate' NOT NULL,
	`oshi_intensity` text DEFAULT 'moderate' NOT NULL,
	`locale` text DEFAULT 'ja' NOT NULL,
	`updated_at` text NOT NULL
);

ALTER TABLE `collected_info` ADD `relevance_score` integer;--> statement-breakpoint
ALTER TABLE `collected_info` ADD `approval_status` text DEFAULT 'approved' NOT NULL;
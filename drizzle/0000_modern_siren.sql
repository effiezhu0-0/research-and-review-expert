CREATE TABLE `research_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`source` text NOT NULL,
	`source_label` text NOT NULL,
	`title` text NOT NULL,
	`url` text,
	`author` text,
	`published_at` text,
	`captured_at` text NOT NULL,
	`original_text` text NOT NULL,
	`screenshot_key` text,
	`media_type` text NOT NULL,
	`keywords` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `research_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`payload` text NOT NULL,
	`worker_id` text,
	`error` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);

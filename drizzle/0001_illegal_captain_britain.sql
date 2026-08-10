CREATE INDEX `idx_research_evidence_task` ON `research_evidence` (`task_id`);--> statement-breakpoint
CREATE INDEX `idx_research_tasks_status_created` ON `research_tasks` (`status`,`created_at`);
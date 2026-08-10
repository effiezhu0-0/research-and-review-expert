// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
export {};
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const researchTasks = sqliteTable("research_tasks", {
  id: text("id").primaryKey(),
  status: text("status").notNull().default("queued"),
  payload: text("payload").notNull(),
  workerId: text("worker_id"),
  error: text("error"),
  blockedSource: text("blocked_source"),
  actionUrl: text("action_url"),
  activity: text("activity"),
  attempts: integer("attempts").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idx_research_tasks_status_created").on(table.status, table.createdAt),
]);

export const researchEvidence = sqliteTable("research_evidence", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull(),
  source: text("source").notNull(),
  sourceLabel: text("source_label").notNull(),
  title: text("title").notNull(),
  url: text("url"),
  author: text("author"),
  publishedAt: text("published_at"),
  capturedAt: text("captured_at").notNull(),
  originalText: text("original_text").notNull(),
  screenshotKey: text("screenshot_key"),
  mediaType: text("media_type").notNull(),
  keywords: text("keywords").notNull().default("[]"),
}, (table) => [
  index("idx_research_evidence_task").on(table.taskId),
]);

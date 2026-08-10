import { env } from "cloudflare:workers";

type RuntimeEnv = {
  DB: D1Database;
  EVIDENCE?: R2Bucket;
  AGENT_API_BASE?: string;
  AGENT_API_KEY?: string;
  AGENT_MODEL?: string;
  AGENT_TIMEOUT_MS?: string;
};

export function researchEnv() {
  return env as unknown as RuntimeEnv;
}

export async function ensureResearchSchema() {
  const { DB } = researchEnv();
  await DB.batch([
    DB.prepare(`CREATE TABLE IF NOT EXISTS research_tasks (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'queued',
      payload TEXT NOT NULL,
      worker_id TEXT,
      error TEXT,
      blocked_source TEXT,
      action_url TEXT,
      activity TEXT,
      owner_id TEXT,
      owner_name TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS research_evidence (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      source TEXT NOT NULL,
      source_label TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT,
      author TEXT,
      published_at TEXT,
      captured_at TEXT NOT NULL,
      original_text TEXT NOT NULL,
      screenshot_key TEXT,
      media_type TEXT NOT NULL,
      keywords TEXT NOT NULL DEFAULT '[]',
      observable_fact TEXT,
      design_interpretation TEXT,
      project_implication TEXT,
      evidence_strength TEXT,
      likes INTEGER NOT NULL DEFAULT 0,
      comments INTEGER NOT NULL DEFAULT 0,
      collects INTEGER NOT NULL DEFAULT 0,
      primary_dimension TEXT
    )`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS research_candidates (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      source TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      author TEXT,
      published_at TEXT,
      captured_at TEXT NOT NULL,
      excerpt TEXT NOT NULL DEFAULT '',
      screenshot_key TEXT,
      media_type TEXT NOT NULL DEFAULT 'post',
      keywords TEXT NOT NULL DEFAULT '[]',
      likes INTEGER NOT NULL DEFAULT 0,
      comments INTEGER NOT NULL DEFAULT 0,
      collects INTEGER NOT NULL DEFAULT 0,
      relevance INTEGER NOT NULL DEFAULT 0,
      media_keys TEXT NOT NULL DEFAULT '[]',
      valuable_comments TEXT NOT NULL DEFAULT '[]',
      selected INTEGER NOT NULL DEFAULT 0,
      excluded INTEGER NOT NULL DEFAULT 0
    )`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS research_strategies (
      task_id TEXT PRIMARY KEY,
      result TEXT NOT NULL,
      source_candidate_ids TEXT NOT NULL DEFAULT '[]',
      model TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS research_worker_pairs (
      owner_id TEXT PRIMARY KEY,
      owner_name TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_research_tasks_status_created ON research_tasks(status, created_at)"),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_research_evidence_task ON research_evidence(task_id)"),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_research_candidates_task ON research_candidates(task_id, captured_at)"),
  ]);
  const columns = await DB.prepare("PRAGMA table_info(research_tasks)").all<{ name: string }>();
  const names = new Set(columns.results.map((column) => column.name));
  if (!names.has("blocked_source")) {
    await DB.prepare("ALTER TABLE research_tasks ADD COLUMN blocked_source TEXT").run();
  }
  if (!names.has("action_url")) {
    await DB.prepare("ALTER TABLE research_tasks ADD COLUMN action_url TEXT").run();
  }
  if (!names.has("activity")) {
    await DB.prepare("ALTER TABLE research_tasks ADD COLUMN activity TEXT").run();
  }
  if (!names.has("owner_id")) await DB.prepare("ALTER TABLE research_tasks ADD COLUMN owner_id TEXT").run();
  if (!names.has("owner_name")) await DB.prepare("ALTER TABLE research_tasks ADD COLUMN owner_name TEXT").run();
  await DB.prepare("CREATE INDEX IF NOT EXISTS idx_research_tasks_owner_status ON research_tasks(owner_id, status, created_at)").run();
  const evidenceColumns = await DB.prepare("PRAGMA table_info(research_evidence)").all<{ name: string }>();
  const evidenceNames = new Set(evidenceColumns.results.map((column) => column.name));
  for (const [name, definition] of [
    ["observable_fact", "TEXT"],
    ["design_interpretation", "TEXT"],
    ["project_implication", "TEXT"],
    ["evidence_strength", "TEXT"],
    ["likes", "INTEGER NOT NULL DEFAULT 0"],
    ["comments", "INTEGER NOT NULL DEFAULT 0"],
    ["collects", "INTEGER NOT NULL DEFAULT 0"],
    ["primary_dimension", "TEXT"],
  ] as const) {
    if (!evidenceNames.has(name)) {
      await DB.prepare(`ALTER TABLE research_evidence ADD COLUMN ${name} ${definition}`).run();
    }
  }
  const candidateColumns = await DB.prepare("PRAGMA table_info(research_candidates)").all<{ name: string }>();
  const candidateNames = new Set(candidateColumns.results.map((column) => column.name));
  if (!candidateNames.has("media_keys")) {
    await DB.prepare("ALTER TABLE research_candidates ADD COLUMN media_keys TEXT NOT NULL DEFAULT '[]'").run();
  }
  if (!candidateNames.has("valuable_comments")) {
    await DB.prepare("ALTER TABLE research_candidates ADD COLUMN valuable_comments TEXT NOT NULL DEFAULT '[]'").run();
  }
}

export function taskRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    status: row.status,
    project: JSON.parse(String(row.payload || "{}")),
    workerId: row.worker_id,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    error: row.error,
    blockedSource: row.blocked_source,
    actionUrl: row.action_url,
    activity: row.activity ? JSON.parse(String(row.activity)) : null,
    attempts: row.attempts,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

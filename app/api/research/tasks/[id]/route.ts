import { ensureResearchSchema, researchEnv, taskRow } from "../../store";
import { uniqueCandidates } from "../../candidate-dedupe";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureResearchSchema();
  const { id } = await context.params;
  const row = await researchEnv().DB.prepare("SELECT * FROM research_tasks WHERE id = ?")
    .bind(id).first<Record<string, unknown>>();
  if (!row) return Response.json({ error: "Task not found" }, { status: 404 });
  const count = await researchEnv().DB.prepare(
    "SELECT COUNT(*) AS count FROM research_evidence WHERE task_id = ?"
  ).bind(id).first<{ count: number }>();
  const candidateRows = await researchEnv().DB.prepare(
    "SELECT * FROM research_candidates WHERE task_id = ? AND excluded = 0 ORDER BY relevance DESC, captured_at DESC"
  ).bind(id).all<Record<string, unknown>>();
  const candidateCount = uniqueCandidates(candidateRows.results || []).length;
  return Response.json({
    task: taskRow(row),
    evidenceCount: count?.count || 0,
    candidateCount,
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureResearchSchema();
  const { id } = await context.params;
  const { status, error = null, blockedSource = null, actionUrl = null, activity = null } = await request.json();
  if (!["queued", "running", "awaiting_competitor_confirmation", "awaiting_visual_confirmation", "completed", "failed", "needs_login"].includes(status)) {
    return Response.json({ error: "Invalid status" }, { status: 400 });
  }
  await researchEnv().DB.prepare(
    "UPDATE research_tasks SET status = ?, error = ?, blocked_source = ?, action_url = ?, activity = ?, worker_id = CASE WHEN ? = 'queued' THEN NULL ELSE worker_id END, updated_at = ? WHERE id = ?"
  ).bind(status, error, blockedSource, actionUrl, activity ? JSON.stringify(activity) : null, status, new Date().toISOString(), id).run();
  return Response.json({ id, status, error, blockedSource, actionUrl, activity });
}

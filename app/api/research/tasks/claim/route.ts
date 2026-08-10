import { ensureResearchSchema, researchEnv, taskRow } from "../../store";

export async function POST(request: Request) {
  await ensureResearchSchema();
  const { workerId = "browser-agent" } = await request.json().catch(() => ({}));
  const { DB } = researchEnv();
  const candidate = await DB.prepare(
    "SELECT * FROM research_tasks WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1"
  ).first<Record<string, unknown>>();
  if (!candidate) return new Response(null, { status: 204 });

  const now = new Date().toISOString();
  const updated = await DB.prepare(
    "UPDATE research_tasks SET status = 'running', worker_id = ?, attempts = attempts + 1, updated_at = ? WHERE id = ? AND status = 'queued'"
  ).bind(workerId, now, candidate.id).run();
  if (!updated.meta.changes) return new Response(null, { status: 409 });
  return Response.json({ task: taskRow({ ...candidate, status: "running", worker_id: workerId, updated_at: now }) });
}

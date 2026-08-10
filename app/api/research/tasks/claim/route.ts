import { ensureResearchSchema, researchEnv, taskRow } from "../../store";
import { tokenHash } from "../../identity";

export async function POST(request: Request) {
  await ensureResearchSchema();
  const { workerId = "browser-agent", ownerId, pairToken } = await request.json().catch(() => ({}));
  if (!ownerId || !pairToken) return Response.json({ error: "个人 Worker 尚未配对" }, { status: 401 });
  const { DB } = researchEnv();
  const pair = await DB.prepare("SELECT token_hash FROM research_worker_pairs WHERE owner_id = ?")
    .bind(ownerId).first<{ token_hash: string }>();
  if (!pair || pair.token_hash !== await tokenHash(String(pairToken))) {
    return Response.json({ error: "Worker 配对信息无效，请在看板重新生成" }, { status: 401 });
  }
  const candidate = await DB.prepare(
    "SELECT * FROM research_tasks WHERE status = 'queued' AND owner_id = ? ORDER BY created_at ASC LIMIT 1"
  ).bind(ownerId).first<Record<string, unknown>>();
  if (!candidate) return new Response(null, { status: 204 });

  const now = new Date().toISOString();
  const updated = await DB.prepare(
    "UPDATE research_tasks SET status = 'running', worker_id = ?, attempts = attempts + 1, updated_at = ? WHERE id = ? AND status = 'queued'"
  ).bind(workerId, now, candidate.id).run();
  if (!updated.meta.changes) return new Response(null, { status: 409 });
  return Response.json({ task: taskRow({ ...candidate, status: "running", worker_id: workerId, updated_at: now }) });
}

import { ensureResearchSchema, researchEnv, taskRow } from "../store";
import { researchOwner } from "../identity";

export async function POST(request: Request) {
  await ensureResearchSchema();
  const project = await request.json();
  const selectedKeywords = Array.isArray(project?.researchKeywords)
    ? project.researchKeywords.map((value: unknown) => String(value || "").trim()).filter(Boolean)
    : [];
  if (project?.researchMode !== "visual" && selectedKeywords.length === 0) {
    return Response.json({ error: "请至少选择一个搜索关键词" }, { status: 400 });
  }
  let owner;
  try { owner = await researchOwner(request); } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "无法识别当前使用者" }, { status: 401 });
  }
  const id = `research-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  await researchEnv().DB.prepare(
    "INSERT INTO research_tasks (id, status, payload, owner_id, owner_name, created_at, updated_at) VALUES (?, 'queued', ?, ?, ?, ?, ?)"
  ).bind(id, JSON.stringify(project), owner.id, owner.name, now, now).run();
  return Response.json({ id, status: "queued", createdAt: now }, { status: 201 });
}

export async function GET() {
  await ensureResearchSchema();
  const result = await researchEnv().DB.prepare(
    "SELECT * FROM research_tasks ORDER BY created_at DESC LIMIT 20"
  ).all();
  return Response.json({ tasks: result.results.map((row) => taskRow(row as Record<string, unknown>)) });
}

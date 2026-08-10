import { ensureResearchSchema, researchEnv, taskRow } from "../store";

export async function POST(request: Request) {
  await ensureResearchSchema();
  const project = await request.json();
  const id = `research-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  await researchEnv().DB.prepare(
    "INSERT INTO research_tasks (id, status, payload, created_at, updated_at) VALUES (?, 'queued', ?, ?, ?)"
  ).bind(id, JSON.stringify(project), now, now).run();
  return Response.json({ id, status: "queued", createdAt: now }, { status: 201 });
}

export async function GET() {
  await ensureResearchSchema();
  const result = await researchEnv().DB.prepare(
    "SELECT * FROM research_tasks ORDER BY created_at DESC LIMIT 20"
  ).all();
  return Response.json({ tasks: result.results.map((row) => taskRow(row as Record<string, unknown>)) });
}

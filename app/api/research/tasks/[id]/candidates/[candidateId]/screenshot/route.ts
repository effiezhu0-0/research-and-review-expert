import { ensureResearchSchema, researchEnv } from "../../../../../store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; candidateId: string }> },
) {
  await ensureResearchSchema();
  const { id, candidateId } = await context.params;
  const row = await researchEnv().DB.prepare(
    "SELECT screenshot_key FROM research_candidates WHERE task_id = ? AND id = ?"
  ).bind(id, candidateId).first<{ screenshot_key?: string }>();
  if (!row?.screenshot_key) return new Response("Screenshot not found", { status: 404 });
  const object = await researchEnv().EVIDENCE?.get(row.screenshot_key);
  if (!object) return new Response("Screenshot not found", { status: 404 });
  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType || "image/png",
      "cache-control": "private, max-age=300",
    },
  });
}

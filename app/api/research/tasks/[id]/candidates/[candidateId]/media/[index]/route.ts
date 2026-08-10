import { ensureResearchSchema, researchEnv } from "../../../../../../store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; candidateId: string; index: string }> },
) {
  await ensureResearchSchema();
  const { id, candidateId, index } = await context.params;
  const row = await researchEnv().DB.prepare(
    "SELECT media_keys FROM research_candidates WHERE task_id = ? AND id = ?"
  ).bind(id, candidateId).first<{ media_keys?: string }>();
  const keys = JSON.parse(row?.media_keys || "[]") as string[];
  const key = keys[Number(index)];
  if (!key) return new Response("Media not found", { status: 404 });
  const object = await researchEnv().EVIDENCE?.get(key);
  if (!object) return new Response("Media not found", { status: 404 });
  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType || "image/png",
      "cache-control": "private, max-age=300",
    },
  });
}

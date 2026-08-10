import { ensureResearchSchema, researchEnv } from "../../../../../store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; evidenceId: string }> },
) {
  await ensureResearchSchema();
  const { id, evidenceId } = await context.params;
  const { DB, EVIDENCE } = researchEnv();
  const row = await DB.prepare(
    "SELECT screenshot_key FROM research_evidence WHERE task_id = ? AND id = ?"
  ).bind(id, evidenceId).first<{ screenshot_key: string | null }>();

  if (!row?.screenshot_key || !EVIDENCE) {
    return new Response("Screenshot not found", { status: 404 });
  }
  const object = await EVIDENCE.get(row.screenshot_key);
  if (!object) return new Response("Screenshot not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", headers.get("content-type") || "image/png");
  headers.set("cache-control", "private, max-age=300");
  return new Response(object.body, { headers });
}

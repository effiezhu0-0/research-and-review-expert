import { ensureResearchSchema, researchEnv } from "../../../../../store";

export async function GET(_request: Request, context: { params: Promise<{ id: string; sampleId: string }> }) {
  await ensureResearchSchema();
  const { id, sampleId } = await context.params;
  const { DB, EVIDENCE } = researchEnv();
  const row = await DB.prepare(
    "SELECT screenshot_key, image_url, platform FROM research_visual_samples WHERE task_id = ? AND id = ?"
  ).bind(id, sampleId).first<{ screenshot_key?: string; image_url?: string; platform?: string }>();
  if (!row) return new Response("Image not found", { status: 404 });
  if (row.screenshot_key && EVIDENCE) {
    const object = await EVIDENCE.get(row.screenshot_key);
    if (object) return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType || "image/jpeg", "cache-control": "public, max-age=31536000, immutable" } });
  }
  if (!row.image_url) return new Response("Image not found", { status: 404 });
  const response = await fetch(row.image_url, {
    headers: row.platform === "huaban" ? { referer: "https://huaban.com/" } : {},
  }).catch(() => null);
  if (!response?.ok || !response.body) return new Response("Image unavailable", { status: 502 });
  return new Response(response.body, { headers: { "content-type": response.headers.get("content-type") || "image/jpeg", "cache-control": "public, max-age=86400" } });
}

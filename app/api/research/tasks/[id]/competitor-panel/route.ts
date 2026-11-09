import { researchEnv } from "../../../store";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({})) as { screenshotsBase64?: string[] };
  const screenshots = Array.isArray(body.screenshotsBase64) ? body.screenshotsBase64.slice(0, 5) : [];
  const bucket = researchEnv().EVIDENCE;
  if (!bucket || !screenshots.length) return Response.json({ count: 0 }, { status: 200 });

  let saved = 0;
  for (let index = 0; index < screenshots.length; index += 1) {
    const encoded = String(screenshots[index] || "").replace(/^data:image\/jpeg;base64,/, "");
    if (!encoded) continue;
    try {
      const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
      await bucket.put(`research/${id}/competitor-panel-${index}.jpg`, bytes, {
        httpMetadata: { contentType: "image/jpeg" },
      });
      saved += 1;
    } catch {
      // Keep extraction usable when evidence storage is unavailable.
    }
  }
  return Response.json({ count: saved });
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const index = Math.max(0, Math.min(4, Number(new URL(request.url).searchParams.get("index") || 0)));
  const object = await researchEnv().EVIDENCE?.get(`research/${id}/competitor-panel-${index}.jpg`);
  if (!object) return new Response("Panel screenshot not found", { status: 404 });
  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType || "image/jpeg",
      "cache-control": "private, max-age=300",
    },
  });
}

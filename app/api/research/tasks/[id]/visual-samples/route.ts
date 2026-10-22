import { ensureResearchSchema, researchEnv } from "../../../store";

function visualSampleRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    taskId: row.task_id,
    platform: row.platform,
    projectTitle: row.project_title,
    projectUrl: row.project_url,
    imageUrl: row.image_url,
    author: row.author,
    publishedAt: row.published_at,
    capturedAt: row.captured_at,
    trendLabel: row.trend_label,
    visualFeatures: JSON.parse(String(row.visual_features || "[]")),
    engagement: Number(row.engagement || 0),
    authorityTags: JSON.parse(String(row.authority_tags || "[]")),
    gameFit: Number(row.game_fit || 0),
    visualQuality: Number(row.visual_quality || 0),
    analysisReason: row.analysis_reason,
    selectionReason: row.selection_reason,
    referenceType: row.reference_type || "inspiration",
    relevanceScore: Number(row.relevance_score || 0),
    screenshotKey: row.screenshot_key,
  };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureResearchSchema();
  const { id } = await context.params;
  const result = await researchEnv().DB.prepare(
    "SELECT * FROM research_visual_samples WHERE task_id = ? ORDER BY captured_at DESC"
  ).bind(id).all();
  return Response.json({ samples: result.results.map((row) => visualSampleRow(row as Record<string, unknown>)) });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureResearchSchema();
  const { id: taskId } = await context.params;
  const body = await request.json();
  if (!["behance", "pinterest", "huaban", "dribbble", "zcool"].includes(body.platform)) {
    return Response.json({ error: "视觉样本来源不在允许的平台范围内" }, { status: 400 });
  }
  if (!body.projectTitle || !body.projectUrl || !body.trendLabel) {
    return Response.json({ error: "缺少项目名称、来源链接或趋势特征" }, { status: 400 });
  }
  const features = Array.isArray(body.visualFeatures)
    ? body.visualFeatures.map((item: unknown) => String(item).trim()).filter(Boolean)
    : [];
  const id = `visual-${crypto.randomUUID()}`;
  const capturedAt = new Date().toISOString();
  const { DB, EVIDENCE } = researchEnv();
  let screenshotKey: string | null = null;
  if (body.screenshotBase64 && EVIDENCE) {
    screenshotKey = `visual-samples/${taskId}/${id}.jpg`;
    const bytes = Uint8Array.from(atob(body.screenshotBase64), (character) => character.charCodeAt(0));
    await EVIDENCE.put(screenshotKey, bytes, { httpMetadata: { contentType: "image/jpeg" } });
  }
  await DB.prepare(`INSERT INTO research_visual_samples
    (id, task_id, platform, project_title, project_url, image_url, author, published_at, captured_at, trend_label, visual_features, engagement, authority_tags, game_fit, visual_quality, analysis_reason, selection_reason, reference_type, relevance_score, screenshot_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      id, taskId, body.platform, body.projectTitle, body.projectUrl, body.imageUrl || null,
      body.author || null, body.publishedAt || null, capturedAt, body.trendLabel,
      JSON.stringify(features), Math.max(0, Number(body.engagement || 0)),
      JSON.stringify(Array.isArray(body.authorityTags) ? body.authorityTags : []),
      Math.max(0, Math.min(100, Number(body.gameFit || 0))),
      Math.max(0, Math.min(100, Number(body.visualQuality || 0))),
      body.analysisReason || null,
      body.selectionReason || null,
      body.referenceType === "execution" ? "execution" : "inspiration",
      Math.max(0, Math.min(100, Number(body.relevanceScore || 0))),
      screenshotKey,
    ).run();
  return Response.json({ id, capturedAt }, { status: 201 });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureResearchSchema();
  const { id: taskId } = await context.params;
  const sampleId = new URL(request.url).searchParams.get("sampleId");
  if (!sampleId && new URL(request.url).searchParams.get("all") === "1") {
    await researchEnv().DB.prepare("DELETE FROM research_visual_samples WHERE task_id = ?").bind(taskId).run();
    return new Response(null, { status: 204 });
  }
  if (!sampleId) return Response.json({ error: "sampleId is required" }, { status: 400 });
  await researchEnv().DB.prepare("DELETE FROM research_visual_samples WHERE id = ? AND task_id = ?")
    .bind(sampleId, taskId).run();
  return new Response(null, { status: 204 });
}

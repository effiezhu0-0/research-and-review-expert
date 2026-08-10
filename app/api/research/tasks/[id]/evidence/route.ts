import { ensureResearchSchema, researchEnv } from "../../../store";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureResearchSchema();
  const { id } = await context.params;
  const result = await researchEnv().DB.prepare(
    "SELECT * FROM research_evidence WHERE task_id = ? ORDER BY captured_at DESC"
  ).bind(id).all();
  return Response.json({
    evidence: result.results
      .filter((row: Record<string, unknown>) => !/你访问的页面不见了|当前笔记暂时无法浏览|页面不存在/i.test(
        `${row.title || ""} ${row.original_text || ""}`
      ))
      .map((row: Record<string, unknown>) => ({
      id: row.id,
      taskId: row.task_id,
      source: row.source,
      sourceLabel: row.source_label,
      title: row.title,
      url: row.url,
      author: row.author,
      publishedAt: row.published_at,
      capturedAt: row.captured_at,
      originalText: row.original_text,
      screenshotKey: row.screenshot_key,
      mediaType: row.media_type,
      keywords: JSON.parse(String(row.keywords || "[]")),
      observableFact: row.observable_fact,
      designInterpretation: row.design_interpretation,
      projectImplication: row.project_implication,
      evidenceStrength: row.evidence_strength,
      likes: Number(row.likes || 0),
      comments: Number(row.comments || 0),
      collects: Number(row.collects || 0),
      primaryDimension: row.primary_dimension,
      })),
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureResearchSchema();
  const { id: taskId } = await context.params;
  const body = await request.json();
  const items = Array.isArray(body.evidence) ? body.evidence : [];
  const { DB, EVIDENCE } = researchEnv();

  for (const item of items) {
    const evidenceId = item.id || `evidence-${crypto.randomUUID()}`;
    let screenshotKey = item.screenshotKey || null;
    if (item.screenshotBase64 && EVIDENCE) {
      screenshotKey = `research/${taskId}/${evidenceId}.png`;
      const bytes = Uint8Array.from(atob(item.screenshotBase64), (char) => char.charCodeAt(0));
      await EVIDENCE.put(screenshotKey, bytes, { httpMetadata: { contentType: "image/png" } });
    }
    await DB.prepare(`INSERT OR REPLACE INTO research_evidence
      (id, task_id, source, source_label, title, url, author, published_at, captured_at, original_text, screenshot_key, media_type, keywords, observable_fact, design_interpretation, project_implication, evidence_strength, likes, comments, collects, primary_dimension)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        evidenceId,
        taskId,
        item.source,
        item.sourceLabel || item.source,
        item.title,
        item.url || null,
        item.author || null,
        item.publishedAt || null,
        item.capturedAt || new Date().toISOString(),
        item.originalText,
        screenshotKey,
        item.mediaType || "post",
        JSON.stringify(item.keywords || []),
        item.observableFact || null,
        item.designInterpretation || null,
        item.projectImplication || null,
        item.evidenceStrength || "单点观察",
        Number(item.likes || 0),
        Number(item.comments || 0),
        Number(item.collects || 0),
        item.primaryDimension || null,
      ).run();
  }
  return Response.json({ saved: items.length }, { status: 201 });
}

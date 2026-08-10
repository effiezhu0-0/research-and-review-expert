import { ensureResearchSchema, researchEnv } from "../../../store";

function candidateRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    taskId: row.task_id,
    source: row.source,
    title: row.title,
    url: row.url,
    author: row.author,
    publishedAt: row.published_at,
    capturedAt: row.captured_at,
    excerpt: row.excerpt,
    screenshotKey: row.screenshot_key,
    mediaType: row.media_type,
    keywords: JSON.parse(String(row.keywords || "[]")),
    likes: Number(row.likes || 0),
    comments: Number(row.comments || 0),
    collects: Number(row.collects || 0),
    relevance: Number(row.relevance || 0),
    mediaKeys: JSON.parse(String(row.media_keys || "[]")),
    valuableComments: JSON.parse(String(row.valuable_comments || "[]")),
    selected: Boolean(row.selected),
    excluded: Boolean(row.excluded),
  };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureResearchSchema();
  const { id } = await context.params;
  const result = await researchEnv().DB.prepare(
    "SELECT * FROM research_candidates WHERE task_id = ? ORDER BY relevance DESC, captured_at DESC"
  ).bind(id).all();
  return Response.json({
    candidates: result.results
      .filter((row: Record<string, unknown>) => !/当前笔记暂时无法浏览|你访问的页面不见了|页面不存在/i.test(
        `${row.title || ""} ${row.excerpt || ""}`
      ))
      .map((row) => candidateRow(row as Record<string, unknown>)),
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureResearchSchema();
  const { id: taskId } = await context.params;
  const body = await request.json();
  const items = Array.isArray(body.candidates) ? body.candidates : [];
  const { DB, EVIDENCE } = researchEnv();

  for (const item of items) {
    const candidateId = item.id || `candidate-${crypto.randomUUID()}`;
    let screenshotKey = item.screenshotKey || null;
    const mediaKeys: string[] = [];
    if (Array.isArray(item.mediaBase64s) && EVIDENCE) {
      for (let index = 0; index < item.mediaBase64s.length; index += 1) {
        const key = `research/${taskId}/candidates/${candidateId}-${index + 1}.png`;
        const bytes = Uint8Array.from(atob(item.mediaBase64s[index]), (char) => char.charCodeAt(0));
        await EVIDENCE.put(key, bytes, { httpMetadata: { contentType: "image/png" } });
        mediaKeys.push(key);
      }
    }
    if (item.screenshotBase64 && EVIDENCE) {
      screenshotKey = `research/${taskId}/candidates/${candidateId}.png`;
      const bytes = Uint8Array.from(atob(item.screenshotBase64), (char) => char.charCodeAt(0));
      await EVIDENCE.put(screenshotKey, bytes, { httpMetadata: { contentType: "image/png" } });
    }
    await DB.prepare(`INSERT OR REPLACE INTO research_candidates
      (id, task_id, source, title, url, author, published_at, captured_at, excerpt, screenshot_key, media_type, keywords, likes, comments, collects, relevance, media_keys, valuable_comments, selected, excluded)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT selected FROM research_candidates WHERE id = ?), 0), COALESCE((SELECT excluded FROM research_candidates WHERE id = ?), 0))`)
      .bind(
        candidateId, taskId, item.source || "xiaohongshu", item.title, item.url,
        item.author || null, item.publishedAt || null, item.capturedAt || new Date().toISOString(),
        item.excerpt || "", screenshotKey, item.mediaType || "post",
        JSON.stringify(item.keywords || []), Number(item.likes || 0), Number(item.comments || 0),
        Number(item.collects || 0), Number(item.relevance || 0),
        JSON.stringify(mediaKeys), JSON.stringify(item.valuableComments || []),
        candidateId, candidateId,
      ).run();
  }
  return Response.json({ saved: items.length }, { status: 201 });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureResearchSchema();
  const { id: taskId } = await context.params;
  const body = await request.json();
  if (!body.candidateId) return Response.json({ error: "candidateId is required" }, { status: 400 });
  const selected = body.selected === undefined ? null : Number(Boolean(body.selected));
  const excluded = body.excluded === undefined ? null : Number(Boolean(body.excluded));
  await researchEnv().DB.prepare(
    `UPDATE research_candidates
     SET selected = COALESCE(?, selected), excluded = COALESCE(?, excluded)
     WHERE id = ? AND task_id = ?`
  ).bind(selected, excluded, body.candidateId, taskId).run();
  return Response.json({ id: body.candidateId, selected, excluded });
}

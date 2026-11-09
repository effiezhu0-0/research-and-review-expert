import { ensureResearchSchema, researchEnv } from "../../../store";
import { candidatesAreDuplicates, canonicalVoiceDetailUrl, hasVoiceFeedbackId, normalizedText, uniqueCandidates } from "../../../candidate-dedupe";

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
    dedupeKey: row.dedupe_key || "",
    identityText: row.identity_text || "",
    screenshotHash: row.screenshot_hash || "",
    selected: Boolean(row.selected),
    excluded: Boolean(row.excluded),
  };
}

async function backfillScreenshotHashes(
  rows: Record<string, unknown>[],
  DB: ReturnType<typeof researchEnv>["DB"],
  EVIDENCE?: ReturnType<typeof researchEnv>["EVIDENCE"],
) {
  if (!EVIDENCE) return;
  await Promise.all(rows.filter((row) => !row.screenshot_hash && row.screenshot_key).map(async (row) => {
    try {
      const image = await EVIDENCE.get(String(row.screenshot_key));
      if (!image) return;
      const digest = await crypto.subtle.digest("SHA-256", await image.arrayBuffer());
      const screenshotHash = [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
      row.screenshot_hash = screenshotHash;
      await DB.prepare("UPDATE research_candidates SET screenshot_hash = ? WHERE id = ? AND task_id = ? AND screenshot_hash IS NULL")
        .bind(screenshotHash, row.id, row.task_id).run();
    } catch {
      // Keep a legacy case usable if its saved screenshot cannot be read.
    }
  }));
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureResearchSchema();
  const { id } = await context.params;
  const result = await researchEnv().DB.prepare(
    "SELECT * FROM research_candidates WHERE task_id = ? ORDER BY CASE source WHEN 'xiaohongshu' THEN 0 WHEN 'weibo' THEN 1 WHEN 'voice_of_user' THEN 2 ELSE 3 END, captured_at DESC, relevance DESC"
  ).bind(id).all<Record<string, unknown>>();
  const { DB, EVIDENCE } = researchEnv();
  await backfillScreenshotHashes(result.results, DB, EVIDENCE);
  const candidates = result.results
      .filter((row: Record<string, unknown>) => !/当前笔记暂时无法浏览|你访问的页面不见了|页面不存在/i.test(
        `${row.title || ""} ${row.excerpt || ""}`
      ))
      // Voice-of-User search URLs can render the whole result list. Only expose
      // saved records whose source points at one feedback detail.
      .filter((row: Record<string, unknown>) => row.source !== "voice_of_user" || hasVoiceFeedbackId(row.url))
      .map((row: Record<string, unknown>) => candidateRow(row));
  return Response.json({ candidates: uniqueCandidates(candidates) });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureResearchSchema();
  const { id: taskId } = await context.params;
  const body = await request.json();
  const items = Array.isArray(body.candidates) ? body.candidates : [];
  const invalidVoiceItem = items.find((item) => String(item?.source || "") === "voice_of_user" && !hasVoiceFeedbackId(item?.url));
  if (invalidVoiceItem) {
    return Response.json({ error: "用户之声案例必须使用带 feedbackId 的单条反馈详情链接，搜索结果页不会保存。" }, { status: 422 });
  }
  const { DB, EVIDENCE } = researchEnv();
  // A research run is its own evidence set. Do not let an earlier run for the
  // same project suppress a legitimate rediscovery in the current run.
  const existingRows = await DB.prepare(
    "SELECT * FROM research_candidates WHERE task_id = ? ORDER BY captured_at DESC",
  ).bind(taskId).all();
  const known: Record<string, unknown>[] = existingRows.results as Record<string, unknown>[];
  await backfillScreenshotHashes(known, DB, EVIDENCE);
  let saved = 0;
  let duplicates = 0;

  const hashBase64 = async (value: string) => {
    const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
  };

  for (const item of items) {
    // Candidate IDs are primary keys across the whole local database. Scope an
    // incoming deterministic post ID to this task so saving a rediscovered post
    // cannot replace its record in an earlier research run.
    const suppliedId = String(item.id || `candidate-${crypto.randomUUID()}`);
    const candidateId = suppliedId.startsWith(`${taskId}:`) ? suppliedId : `${taskId}:${suppliedId}`;
    const source = String(item.source || "xiaohongshu");
    const detailUrl = source === "voice_of_user" ? canonicalVoiceDetailUrl(item.url) : "";
    const commentList = Array.isArray(item.valuableComments) ? item.valuableComments.map(String) : [];
    // Identity must come from the original post, not generated titles/summaries
    // or comments, which can vary between captures of the same post.
    const identityText = String(item.identityText || "").trim();
    const canonicalText = normalizedText(identityText);
    const contentDedupeKey = canonicalText.length >= 24
      ? `content:${source}:${normalizedText(item.author)}:${normalizedText(item.publishedAt).slice(0, 10)}:${canonicalText}`
      : "";
    const dedupeKey = detailUrl
      ? `url:${detailUrl}`
      : contentDedupeKey || String(item.dedupeKey || "");
    const screenshotHash = String(item.screenshotHash || (item.screenshotBase64 ? await hashBase64(item.screenshotBase64) : ""));
    const identity = {
      source, title: item.title, url: item.url, author: item.author, publishedAt: item.publishedAt,
      excerpt: item.excerpt, identityText, dedupeKey, screenshotHash, valuableComments: commentList,
    };
    if (known.some((row) => candidatesAreDuplicates(row, identity))) {
      duplicates += 1;
      continue;
    }
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
      (id, task_id, source, title, url, author, published_at, captured_at, excerpt, screenshot_key, media_type, keywords, likes, comments, collects, relevance, media_keys, valuable_comments, dedupe_key, identity_text, screenshot_hash, selected, excluded)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT selected FROM research_candidates WHERE id = ?), 0), COALESCE((SELECT excluded FROM research_candidates WHERE id = ?), 0))`)
      .bind(
        candidateId, taskId, source, item.title, item.url || "",
        item.author || null, item.publishedAt || null, item.capturedAt || new Date().toISOString(),
        item.excerpt || "", screenshotKey, item.mediaType || "post",
        JSON.stringify(item.keywords || []), Number(item.likes || 0), Number(item.comments || 0),
        Number(item.collects || 0), Number(item.relevance || 0),
        JSON.stringify(mediaKeys), JSON.stringify(commentList), dedupeKey || null, identityText, screenshotHash || null,
        candidateId, candidateId,
      ).run();
    known.push({ ...identity, id: candidateId, task_id: taskId, dedupe_key: dedupeKey, identity_text: identityText, screenshot_hash: screenshotHash, valuable_comments: JSON.stringify(commentList) });
    saved += 1;
  }
  return Response.json({ saved, duplicates }, { status: 201 });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureResearchSchema();
  const { id: taskId } = await context.params;
  const body = await request.json();
  if (!body.candidateId) return Response.json({ error: "candidateId is required" }, { status: 400 });
  const selected = body.selected === undefined ? null : Number(Boolean(body.selected));
  const excluded = body.excluded === undefined ? null : Number(Boolean(body.excluded));
  const { DB } = researchEnv();
  const result = await DB.prepare("SELECT * FROM research_candidates WHERE task_id = ?").bind(taskId).all<Record<string, unknown>>();
  const rows = (result.results || []).map((row: Record<string, unknown>) => candidateRow(row));
  const target = rows.find((row) => row.id === body.candidateId);
  if (!target) return Response.json({ error: "Candidate not found" }, { status: 404 });
  const group = rows.filter((row) => row.id === target.id || candidatesAreDuplicates(target, row));
  await Promise.all(group.map((row) => DB.prepare(
    `UPDATE research_candidates
     SET selected = COALESCE(?, selected), excluded = COALESCE(?, excluded)
     WHERE id = ? AND task_id = ?`
  ).bind(selected, excluded, row.id, taskId).run()));
  return Response.json({ id: body.candidateId, selected, excluded });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureResearchSchema();
  const { id: taskId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const candidateIds = [...new Set((Array.isArray(body.candidateIds) ? body.candidateIds : []).map(String).filter(Boolean))].slice(0, 100);
  if (!candidateIds.length) return Response.json({ error: "candidateIds is required" }, { status: 400 });

  const { DB, EVIDENCE } = researchEnv();
  const result = await DB.prepare("SELECT * FROM research_candidates WHERE task_id = ?")
    .bind(taskId).all<Record<string, unknown>>();
  const allRows = result.results || [];
  const targets = allRows.filter((row) => candidateIds.includes(String(row.id)));
  // A visible card can represent multiple stored copies of the same post.
  // Remove those copies together so a duplicate does not reappear after refresh.
  const rows = allRows.filter((row) => targets.some((target) => candidatesAreDuplicates(target, row)));
  const existingIds = rows.map((row) => String(row.id));
  if (!existingIds.length) return Response.json({ deletedIds: [] });

  await Promise.all(existingIds.map((id) => DB.prepare("DELETE FROM research_candidates WHERE id = ? AND task_id = ?").bind(id, taskId).run()));
  const assetKeys = rows.flatMap((row) => {
    let mediaKeys: string[] = [];
    try { mediaKeys = JSON.parse(String(row.media_keys || "[]")); } catch { mediaKeys = []; }
    return [String(row.screenshot_key || ""), ...mediaKeys].filter(Boolean);
  });
  if (EVIDENCE) await Promise.allSettled(assetKeys.map((key) => EVIDENCE.delete(key)));
  return Response.json({ deletedIds: existingIds });
}

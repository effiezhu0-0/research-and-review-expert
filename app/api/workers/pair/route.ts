import { researchOwner, tokenHash } from "../../research/identity";
import { ensureResearchSchema, researchEnv } from "../../research/store";

export async function POST(request: Request) {
  try {
    await ensureResearchSchema();
    const owner = await researchOwner(request);
    const token = `dlw_${crypto.randomUUID().replace(/-/g, "")}`;
    const now = new Date().toISOString();
    await researchEnv().DB.prepare(
      `INSERT INTO research_worker_pairs (owner_id, owner_name, token_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(owner_id) DO UPDATE SET owner_name = excluded.owner_name, token_hash = excluded.token_hash, updated_at = excluded.updated_at`
    ).bind(owner.id, owner.name, await tokenHash(token), now, now).run();
    return Response.json({ ownerId: owner.id, ownerName: owner.name, pairToken: token });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    return Response.json({ error: `生成本机配对信息失败：${message}` }, { status: 500 });
  }
}

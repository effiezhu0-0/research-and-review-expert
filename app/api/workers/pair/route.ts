import { researchOwner, tokenHash } from "../../research/identity";
import { ensureResearchSchema, researchEnv } from "../../research/store";

export async function POST(request: Request) {
  await ensureResearchSchema();
  let owner;
  try { owner = await researchOwner(request); } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "无法识别当前使用者" }, { status: 401 });
  }
  const token = `dlw_${crypto.randomUUID().replace(/-/g, "")}`;
  const now = new Date().toISOString();
  await researchEnv().DB.prepare(
    `INSERT INTO research_worker_pairs (owner_id, owner_name, token_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(owner_id) DO UPDATE SET owner_name = excluded.owner_name, token_hash = excluded.token_hash, updated_at = excluded.updated_at`
  ).bind(owner.id, owner.name, await tokenHash(token), now, now).run();
  return Response.json({ ownerId: owner.id, ownerName: owner.name, pairToken: token });
}

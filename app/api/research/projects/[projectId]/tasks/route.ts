import { ensureResearchSchema, researchEnv } from "../../../store";
import { researchOwner } from "../../../identity";

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  await ensureResearchSchema();
  const { projectId } = await context.params;
  let owner;
  try { owner = await researchOwner(request); } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "无法识别当前使用者" }, { status: 401 });
  }
  const { DB } = researchEnv();
  const projectName = new URL(request.url).searchParams.get("name")?.trim();

  // Recover legacy runs that predate the explicit project/task relationship.
  // Ownership plus the exact project name keeps this migration within the
  // current user's project and avoids using the name as a permanent key.
  if (projectName) {
    const legacy = await DB.prepare(`SELECT id, created_at FROM research_tasks
      WHERE owner_id = ? AND json_extract(payload, '$.projectName') = ?
      ORDER BY created_at DESC`).bind(owner.id, projectName).all<{ id: string; created_at: string }>();
    await Promise.all((legacy.results as Array<{ id: string; created_at: string }>).map((task) => DB.prepare(
      "INSERT OR IGNORE INTO research_project_tasks (project_id, task_id, owner_id, created_at) VALUES (?, ?, ?, ?)"
    ).bind(projectId, task.id, owner.id, task.created_at).run()));
  }

  const result = await DB.prepare(`SELECT t.id, t.created_at, t.payload, t.activity FROM research_project_tasks p
    JOIN research_tasks t ON t.id = p.task_id
    WHERE p.project_id = ? AND p.owner_id = ? AND t.owner_id = ?
    ORDER BY t.created_at DESC`).bind(projectId, owner.id, owner.id).all<{ id: string; created_at: string; payload: string; activity?: string | null }>();
  const tasks = (result.results as Array<{ id: string; created_at: string; payload: string; activity?: string | null }>).map((task) => {
    let project: Record<string, unknown> = {};
    let activity: Record<string, unknown> = {};
    try { project = JSON.parse(task.payload || "{}"); } catch { /* retain the task association */ }
    try { activity = JSON.parse(task.activity || "{}"); } catch { /* use direction labels from saved references */ }
    const activityDirections = Array.isArray(activity.visualTrendQueries) ? activity.visualTrendQueries : [];
    const projectDirections = Array.isArray(project.visualDirections) ? project.visualDirections : [];
    const directions = activityDirections.length ? activityDirections : projectDirections;
    return {
      id: task.id,
      createdAt: task.created_at,
      mode: String(project.researchMode || ""),
      directions: directions.map((item: unknown) => typeof item === "string" ? item : String((item as { label?: unknown })?.label || "")).filter(Boolean),
    };
  });
  return Response.json({ taskIds: tasks.map((task: ProjectTaskSummary) => task.id), tasks });
}

type ProjectTaskSummary = { id: string; createdAt: string; mode: string; directions: string[] };

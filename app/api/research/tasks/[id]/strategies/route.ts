import { ensureResearchSchema, researchEnv } from "../../../store";

type CandidateRow = {
  id: string;
  title: string;
  url: string;
  excerpt: string;
  keywords: string;
  valuable_comments: string;
};

const strategyTool = {
  type: "function",
  function: {
    name: "report_design_strategy",
    description: "根据研究案例与用户反馈，输出有证据来源的设计机会、策略和初步方向。",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "一句话概括策略推导结论。" },
        opportunities: {
          type: "array", minItems: 2, maxItems: 4,
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              detail: { type: "string" },
              metric: { type: "string" },
              evidenceCandidateIds: { type: "array", items: { type: "string" } },
            },
            required: ["title", "detail", "metric", "evidenceCandidateIds"],
            additionalProperties: false,
          },
        },
        strategies: {
          type: "array", minItems: 2, maxItems: 4,
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              action: { type: "string" },
              metric: { type: "string" },
              evidenceCandidateIds: { type: "array", items: { type: "string" } },
              evidenceQuotes: { type: "array", items: { type: "string" }, maxItems: 3 },
              risk: { type: "string" },
            },
            required: ["title", "action", "metric", "evidenceCandidateIds", "evidenceQuotes", "risk"],
            additionalProperties: false,
          },
        },
        directions: {
          type: "array", minItems: 1, maxItems: 3,
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              summary: { type: "string" },
              flow: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
              points: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 },
              test: { type: "string" },
            },
            required: ["title", "summary", "flow", "points", "test"],
            additionalProperties: false,
          },
        },
      },
      required: ["summary", "opportunities", "strategies", "directions"],
      additionalProperties: false,
    },
  },
};

function parseToolArguments(message: { tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> } | undefined) {
  const call = message?.tool_calls?.find((item) => item.function?.name === "report_design_strategy");
  if (!call?.function?.arguments) throw new Error("策略模型没有返回结构化结果");
  return JSON.parse(call.function.arguments);
}

function agentEndpoint(base: string) {
  return `${base.replace(/\/$/, "")}/chat/completions`;
}

function personalAgentConfig(request: Request, runtime: ReturnType<typeof researchEnv>) {
  const apiBase = request.headers.get("x-design-lab-agent-api-base")?.trim();
  const model = request.headers.get("x-design-lab-agent-model")?.trim();
  const apiKey = request.headers.get("x-design-lab-agent-api-key")?.trim();
  if (!apiBase && !model && !apiKey) {
    return { apiBase: runtime.AGENT_API_BASE, model: runtime.AGENT_MODEL, apiKey: runtime.AGENT_API_KEY };
  }
  if (!apiBase || !model || !apiKey) throw new Error("个人 AI 配置不完整");
  let url: URL;
  try { url = new URL(apiBase); } catch { throw new Error("个人 AI 地址格式不正确"); }
  if (url.protocol !== "https:" || /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(url.hostname)) {
    throw new Error("个人 AI 仅支持 HTTPS 公网接口");
  }
  return { apiBase: url.toString().replace(/\/$/, ""), model, apiKey };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureResearchSchema();
  const { id } = await context.params;
  const row = await researchEnv().DB.prepare(
    "SELECT result, source_candidate_ids, model, updated_at FROM research_strategies WHERE task_id = ?"
  ).bind(id).first<Record<string, unknown>>();
  if (!row) return Response.json({ error: "strategy_not_found" }, { status: 404 });
  return Response.json({
    strategy: JSON.parse(String(row.result)),
    sourceCandidateIds: JSON.parse(String(row.source_candidate_ids || "[]")),
    model: row.model,
    updatedAt: row.updated_at,
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureResearchSchema();
  const { id } = await context.params;
  const runtime = researchEnv();
  const body = await request.json().catch(() => ({})) as { force?: boolean };
  const existing = await runtime.DB.prepare(
    "SELECT result, source_candidate_ids, model, updated_at FROM research_strategies WHERE task_id = ?"
  ).bind(id).first<Record<string, unknown>>();
  if (existing && !body.force) {
    return Response.json({
      strategy: JSON.parse(String(existing.result)),
      sourceCandidateIds: JSON.parse(String(existing.source_candidate_ids || "[]")),
      model: existing.model,
      updatedAt: existing.updated_at,
      reused: true,
    });
  }
  const task = await runtime.DB.prepare("SELECT payload FROM research_tasks WHERE id = ?")
    .bind(id).first<{ payload: string }>();
  if (!task) return Response.json({ error: "research_task_not_found" }, { status: 404 });

  const selected = await runtime.DB.prepare(
    `SELECT id, title, url, excerpt, keywords, valuable_comments
     FROM research_candidates WHERE task_id = ? AND selected = 1 AND excluded = 0
     ORDER BY relevance DESC, captured_at DESC`
  ).bind(id).all<CandidateRow>();
  if (!selected.results.length) {
    return Response.json({ error: "请先选择至少一个案例作为策略依据" }, { status: 400 });
  }
  let agent;
  try { agent = personalAgentConfig(request, runtime); } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "个人 AI 配置无效" }, { status: 400 });
  }
  if (!agent.apiBase || !agent.apiKey || !agent.model) {
    return Response.json({ error: "策略模型尚未配置，请检查 AGENT_API_BASE、AGENT_MODEL 和 AGENT_API_KEY" }, { status: 503 });
  }

  const sources = selected.results.map((item) => ({
    id: item.id,
    title: item.title,
    url: item.url,
    summary: item.excerpt,
    keywords: JSON.parse(item.keywords || "[]"),
    userFeedback: JSON.parse(item.valuable_comments || "[]"),
  }));
  const response = await fetch(agentEndpoint(agent.apiBase), {
    method: "POST",
    signal: AbortSignal.timeout(Number(runtime.AGENT_TIMEOUT_MS || 45000)),
    headers: { "content-type": "application/json", authorization: `Bearer ${agent.apiKey}` },
    body: JSON.stringify({
      model: agent.model,
      messages: [{
        role: "user",
        content: [
          "你是设计研究策略分析师。仅根据给定项目需求、小红书帖子摘要和用户评论提炼策略。",
          "必须区分事实与推断；不得虚构用户反馈、案例或效果数据。证据不足时用风险和待验证指标表达。",
          "策略应具体但保持通用设计层级，不照抄帖子，不提及与输入无关的品牌或具体业务。",
          `项目需求：${task.payload}`,
          `研究证据：${JSON.stringify(sources)}`,
        ].join("\n"),
      }],
      tools: [strategyTool],
      tool_choice: { type: "function", function: { name: "report_design_strategy" } },
      stream: false,
    }),
  });
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 300);
    return Response.json({ error: `策略模型返回 ${response.status}${detail ? `：${detail}` : ""}` }, { status: 502 });
  }
  const payload = await response.json() as { choices?: Array<{ message?: Parameters<typeof parseToolArguments>[0] }> };
  const result = parseToolArguments(payload.choices?.[0]?.message);
  const allowedIds = new Set(selected.results.map((item) => item.id));
  for (const item of [...result.opportunities, ...result.strategies]) {
    item.evidenceCandidateIds = item.evidenceCandidateIds.filter((candidateId: string) => allowedIds.has(candidateId));
  }

  const now = new Date().toISOString();
  const ids = selected.results.map((item) => item.id);
  await runtime.DB.prepare(
    `INSERT INTO research_strategies (task_id, result, source_candidate_ids, model, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(task_id) DO UPDATE SET result = excluded.result, source_candidate_ids = excluded.source_candidate_ids,
       model = excluded.model, updated_at = excluded.updated_at`
  ).bind(id, JSON.stringify(result), JSON.stringify(ids), agent.model, now, now).run();

  return Response.json({ strategy: result, sourceCandidateIds: ids, updatedAt: now }, { status: 201 });
}

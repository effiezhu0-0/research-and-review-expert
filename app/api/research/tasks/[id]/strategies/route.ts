import { ensureResearchSchema, researchEnv } from "../../../store";
import { requestAgentRuntime } from "../../../../../lib/agentRuntime";

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

function projectStrategyInstruction(payload: string) {
  try {
    const project = JSON.parse(payload) as { decisionPosture?: number; meetingContext?: { link?: string; fileName?: string; extractedText?: string; keyPoints?: string[] } };
    const posture = Number(project.decisionPosture ?? 50);
    const postureInstruction = posture < 40
      ? "开放度：方向聚焦。优先围绕项目已有目标、项目背景和明确约束收敛策略，不额外扩展无关方向；同时清晰标注证据不足、风险和待验证指标。"
      : posture > 60
        ? "开放度：开放探索。基于研究证据主动发现多个合理机会与替代方向，不受限于单一预设解法；每个方向仍需标注证据、风险和待验证指标。"
        : "开放度：探索与聚焦并行。在已有项目方向内提出有限的替代机会，并以研究证据筛选出最值得推进的方案。";
    const meeting = project.meetingContext?.keyPoints?.length
      ? `会议要点：${project.meetingContext.keyPoints.map((point, index) => `${index + 1}. ${point}`).join("；")}`
      : project.meetingContext?.extractedText
      ? `会议纪要摘录：${project.meetingContext.extractedText.slice(0, 12000)}`
      : project.meetingContext?.link ? `会议纪要链接：${project.meetingContext.link}` : "";
    return [postureInstruction, meeting].filter(Boolean).join("\n");
  } catch { return ""; }
}

function parseToolArguments(message: { tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> } | undefined) {
  const call = message?.tool_calls?.find((item) => item.function?.name === "report_design_strategy");
  if (!call?.function?.arguments) throw new Error("策略模型没有返回结构化结果");
  return JSON.parse(call.function.arguments);
}

function localEvidenceFallback(sources: Array<{ id: string; title: string; summary: string; keywords: string[]; userFeedback: string[] }>) {
  const evidenceIds = sources.map((source) => source.id);
  const quotes = sources.flatMap((source) => source.userFeedback).filter(Boolean).slice(0, 3);
  const themes = [...new Set(sources.flatMap((source) => source.keywords).filter(Boolean))].slice(0, 4);
  const theme = (index: number, fallback: string) => themes[index] || fallback;
  return {
    summary: "Agent 网关暂不可用，已基于所选案例摘要与用户反馈生成可编辑的证据归纳版本。",
    opportunities: [
      { title: `强化${theme(0, "核心利益")}`, detail: sources[0]?.summary || "从所选案例中提炼核心价值和参与动机。", metric: "参与率", evidenceCandidateIds: evidenceIds.slice(0, 2) },
      { title: `优化${theme(1, "参与路径")}`, detail: sources[1]?.summary || sources[0]?.summary || "减少理解和操作成本，观察关键步骤流失。", metric: "完成率", evidenceCandidateIds: evidenceIds.slice(0, 2) },
    ],
    strategies: [
      { title: "突出核心利益", action: `围绕${theme(0, "用户最关心的收益")}前置说明参与价值，并在关键入口保持一致表达。`, metric: "参与率", evidenceCandidateIds: evidenceIds, evidenceQuotes: quotes, risk: "需验证利益表达是否与真实奖励和用户预期一致。" },
      { title: "降低参与门槛", action: `围绕${theme(1, "关键流程")}缩短首次参与路径，并为关键操作提供即时反馈。`, metric: "完成率", evidenceCandidateIds: evidenceIds, evidenceQuotes: quotes, risk: "流程缩短可能减少规则解释，需要同步监测误操作。" },
    ],
    directions: [{ title: "利益前置的轻量参与路径", summary: "先说明价值，再用短路径承接参与，并以过程指标验证每一步。", flow: ["展示核心利益", "进入参与流程", "完成关键操作", "反馈结果"], points: ["利益表达一致", "减少非必要步骤", "关键节点有反馈"], test: "对比参与率、点击率和完成率。" }],
  };
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
  try {
    agent = requestAgentRuntime(request, runtime, {
      missingMessage: "策略模型尚未配置，请检查 AGENT_API_BASE、AGENT_MODEL 和 AGENT_API_KEY",
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "个人 AI 配置无效" }, { status: 400 });
  }

  const sources = selected.results.map((item) => ({
    id: item.id,
    title: item.title,
    url: item.url,
    summary: item.excerpt,
    keywords: JSON.parse(item.keywords || "[]"),
    userFeedback: JSON.parse(item.valuable_comments || "[]"),
  }));
  let result;
  let fallbackReason = "";
  try {
    const response = await agent.chatCompletions({
        messages: [{ role: "user", content: ["你是设计研究策略分析师。仅根据给定项目需求、小红书帖子摘要和用户评论提炼策略。", "必须区分事实与推断；不得虚构用户反馈、案例或效果数据。证据不足时用风险和待验证指标表达。", "策略应具体但保持通用设计层级，不照抄帖子，不提及与输入无关的品牌或具体业务。", `项目需求：${task.payload}`, projectStrategyInstruction(task.payload), `研究证据：${JSON.stringify(sources)}`].join("\n") }],
        tools: [strategyTool],
        tool_choice: { type: "function", function: { name: "report_design_strategy" } },
        stream: false,
    });
    if (!response.ok) throw new Error(`策略模型返回 ${response.status}：${(await response.text()).replace(/\s+/g, " ").slice(0, 180)}`);
    const payload = await response.json() as { choices?: Array<{ message?: Parameters<typeof parseToolArguments>[0] }> };
    result = parseToolArguments(payload.choices?.[0]?.message);
  } catch (error) {
    fallbackReason = error instanceof Error && error.message === "fetch failed" ? "Agent 网关无法连接，请检查公司网络或 DNS" : error instanceof Error ? error.message : "Agent 网关暂不可用";
    result = localEvidenceFallback(sources);
  }
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
  ).bind(id, JSON.stringify(result), JSON.stringify(ids), fallbackReason ? "local-evidence-fallback" : agent.config.model, now, now).run();

  return Response.json({ strategy: result, sourceCandidateIds: ids, updatedAt: now, fallback: Boolean(fallbackReason), warning: fallbackReason || undefined }, { status: 201 });
}

import { researchEnv } from "../research/store";
import { requestAgentRuntime } from "../../lib/agentRuntime";

type ReviewRequest = { projectName?: string; solutionName?: string; businessGoals?: string[]; designPoints?: Array<{ id: string; title: string; description: string; strategy: string; metrics: string[] }> };

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as ReviewRequest;
    if (!body.designPoints?.length) return Response.json({ error: "没有可评估的设计点" }, { status: 400 });
    const agent = requestAgentRuntime(request, researchEnv(), { timeoutMs: 60000 });
    const prompt = `你是资深营销产品设计评审专家。请评估设计方案能否满足业务诉求，而不是评价视觉美观。判断链必须是：业务诉求 → 研究策略 → 设计点具体变化 → 预期指标。逐项判断策略与设计动作是否有明确因果关系、指标能否验证效果，并识别缺失绑定或证据不足。分数必须有区分度，不因信息不足虚构高分。评价内容必须短而清晰：提炼 2—4 个关键词，每条判断写成独立要点，禁止返回长段落。\n项目：${body.projectName || "未命名"}\n方案：${body.solutionName || "未命名"}\n业务诉求：${JSON.stringify(body.businessGoals || [])}\n设计点：${JSON.stringify(body.designPoints)}\n只返回 JSON：{"schemaVersion":2,"overallScore":0到100整数,"summary":"一句话说明方案满足业务诉求的程度","businessGoals":[{"goal":"业务诉求","score":0到100整数,"finding":"简短判断"}],"reviews":[{"id":"保持设计点原id","score":0到100整数,"verdict":"高度匹配或基本匹配或匹配较弱或信息不足","keywords":["因果明确","指标可验证"],"findings":["一条简短判断","另一条简短判断"],"gaps":["最关键的缺口，无则空数组"],"recommendations":["一条可执行的优化建议"]}]}。`;
    const response = await agent.chatCompletions({ messages: [{ role: "user", content: prompt }], response_format: { type: "json_object" }, stream: false });
    if (!response.ok) throw new Error(`Agent 返回 ${response.status}`);
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, ""));
    if (!Array.isArray(parsed.reviews)) throw new Error("Agent 未返回有效评价");
    return Response.json({ ...parsed, schemaVersion: 2 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "方案评价失败" }, { status: 400 }); }
}

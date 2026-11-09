import { researchEnv } from "../store";
import { requestAgentRuntime } from "../../../lib/agentRuntime";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as {
      projectName?: string;
      designType?: string;
      answers?: Record<string, string[]>;
      customValues?: Record<string, string>;
      meetingContext?: { keyPoints?: string[]; extractedText?: string };
    };
    const agent = requestAgentRuntime(request, researchEnv(), { missingMessage: "Agent 尚未配置，暂时无法生成关键词建议" });
    const response = await agent.chatCompletions({
      messages: [{
        role: "user",
        content: `你是用户研究搜索词助理。根据项目名称、项目表单答案和自定义内容，生成恰好3个适合搜索用户反馈的关键词或短语。优先使用产品/活动名称、具体玩法、用户问题或体验描述；词语应简洁、具体、可在社交平台帖子正文中出现。不要添加项目背景里没有的品牌名，不要输出解释。只输出JSON：{"keywords":["关键词1","关键词2","关键词3"]}。\n项目名称：${String(body.projectName || "").slice(0, 100)}\n设计方向：${String(body.designType || "")}\n表单答案：${JSON.stringify(body.answers || {}).slice(0, 3000)}\n自定义内容：${JSON.stringify(body.customValues || {}).slice(0, 2000)}\n项目背景要点：${JSON.stringify(body.meetingContext?.keyPoints || body.meetingContext?.extractedText || "").slice(0, 2500)}`,
      }],
      stream: false,
    });
    if (!response.ok) throw new Error(`Agent 返回 ${response.status}`);
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content || "";
    const match = content.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) as { keywords?: unknown } : null;
    const keywords = Array.isArray(parsed?.keywords)
      ? [...new Set(parsed.keywords.map((value) => String(value || "").trim()).filter((value) => value.length >= 2 && value.length <= 32))].slice(0, 3)
      : [];
    if (keywords.length !== 3) throw new Error("Agent 未返回3个有效关键词");
    return Response.json({ keywords });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "关键词建议生成失败" }, { status: 400 });
  }
}

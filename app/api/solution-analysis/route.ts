import { researchEnv } from "../research/store";
import { requestAgentRuntime } from "../../lib/agentRuntime";

type AnalysisRequest = { images?: string[]; projectName?: string; solutionName?: string };

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as AnalysisRequest;
    const images = (body.images || []).filter((value) => /^data:image\//.test(value)).slice(0, 5);
    if (!images.length) return Response.json({ error: "请至少上传一张方案图片" }, { status: 400 });
    const agent = requestAgentRuntime(request, researchEnv(), { timeoutMs: 60000 });
    const prompt = `你是资深设计评审助理。分析这些设计方案截图，提取 2—6 个可评价、可验证的关键设计点。不要评价视觉风格，不要虚构截图中不可见的信息。为每个设计点推荐 1—3 个独立指标，并指出它在第几张图以及对应区域。指标必须是通用、简明的名称，每项 4—8 个汉字，例如“按钮点击率”“弹窗曝光率”“任务完成率”；禁止写成长句或把多个指标放进同一个字符串。每个设计点必须根据具体内容，从“突出核心利益、降低参与门槛、简化任务流程、强化即时反馈、增强奖励感知、建立连续目标、促进社交传播、提升信任感”中选择且只选择 1 个最匹配的研究策略，不能留空或返回列表外的内容。裁切区域使用 0—1 的相对坐标。\n项目：${body.projectName || "未命名"}\n方案：${body.solutionName || "未命名"}\n只返回 JSON：{"designPoints":[{"title":"简短名称","location":"页面或流程位置","description":"截图中可观察到的具体设计变化及其可能影响的用户行为","strategy":"从给定列表选择一个策略","metrics":["按钮点击率","任务完成率"],"sourceImageIndex":0,"crop":{"x":0.1,"y":0.1,"width":0.5,"height":0.4}}]}。`;
    const content = [{ type: "text", text: prompt }, ...images.map((image_url) => ({ type: "image_url", image_url: { url: image_url } }))];
    const response = await agent.chatCompletions({ messages: [{ role: "user", content }], response_format: { type: "json_object" }, stream: false });
    if (!response.ok) throw new Error(`Agent 返回 ${response.status}`);
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, ""));
    if (!Array.isArray(parsed.designPoints) || !parsed.designPoints.length) throw new Error("Agent 未识别到可确认的设计点");
    return Response.json({ designPoints: parsed.designPoints.slice(0, 6) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "方案识别失败" }, { status: 400 });
  }
}

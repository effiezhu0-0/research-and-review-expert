import { researchEnv } from "../research/store";
import { requestAgentRuntime } from "../../lib/agentRuntime";

type DesignType = "interaction" | "brand" | "marketing";
type ProjectContextRequest = { link?: string; extractedText?: string; designType?: DesignType };

const fieldOptions = {
  interaction: {
    goal: ["拉新（新增用户数、获客成本）", "促活（DAU、活跃率、参与次数）", "转化（转化率、客单价）", "传播（分享率、拉新人数）", "留存（次日留存、复访率）"],
    game: ["抽奖", "答题", "收集", "养成", "暂不确定"],
    audience: ["小镇青年", "小镇中年", "小镇中产", "小镇家庭", "都市蓝领", "都市家庭", "都市Z世代", "都市中产", "银发一族", "学生族"],
  },
  brand: {
    goal: ["强化品牌识别", "完成品牌升级", "建立数字一致性", "表达智能能力", "提升年轻感知"],
    perception: ["亲和", "智能", "年轻", "可信", "轻盈", "专业"],
    boundary: ["App Icon", "启动屏", "引导页", "核心界面", "品牌 IP", "数字品牌系统"],
    audience: ["大众用户", "年轻用户", "家庭用户", "专业用户", "银发用户"],
  },
  marketing: {
    goal: ["建立大促心智", "突出核心利益", "提升会场分流", "强化商品转化", "保持触点一致"],
    perception: ["热烈", "明确", "可信", "新鲜", "高效", "有品质"],
    boundary: ["电商大促频道会场", "开屏广告"],
    campaign: ["618", "双11", "年货节", "品牌日", "日常大促", "暂不确定"],
  },
} as const;

async function readLink(link: string) {
  let url: URL;
  try { url = new URL(link); } catch { throw new Error("项目背景链接格式不正确"); }
  if (url.protocol !== "https:") throw new Error("项目背景链接需以 https:// 开头");
  const response = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { accept: "text/html,text/plain" } });
  if (!response.ok) throw new Error(`无法读取项目背景链接（${response.status}）。如链接需要登录，请上传 PDF。`);
  const contentType = response.headers.get("content-type") || "";
  if (!/text\/|json/i.test(contentType)) throw new Error("该链接不是可读取的文本页面，请上传 PDF。");
  return (await response.text()).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi, " ").replace(/\s+/g, " ").trim().slice(0, 12000);
}

function parseJsonObject(value: string) {
  const match = value.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]) as { projectName?: unknown; keyPoints?: unknown; answers?: unknown }; } catch { return null; }
}

function validAnswers(value: unknown, designType: DesignType) {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const options = fieldOptions[designType] as Record<string, readonly string[]>;
  return Object.fromEntries(Object.entries(options).map(([key, allowed]) => {
    const selected = Array.isArray(input[key]) ? input[key].map(String).filter((item) => allowed.includes(item)) : [];
    return [key, selected.slice(0, key === "game" || key === "campaign" ? 1 : 3)];
  }));
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as ProjectContextRequest;
    const source = body.extractedText?.trim() || (body.link ? await readLink(body.link) : "");
    if (!source) return Response.json({ error: "请先上传 PDF 或粘贴项目背景链接" }, { status: 400 });
    const designType: DesignType = body.designType === "brand" || body.designType === "marketing" ? body.designType : "interaction";
    const options = fieldOptions[designType];
    const agent = requestAgentRuntime(request, researchEnv(), { missingMessage: "Agent 尚未配置" });
    const response = await agent.chatCompletions({
      messages: [{ role: "user", content: `你是设计研究助理。分析项目背景并自动填写设计研究表单。提炼一个不超过20字的项目名称。只能从给定选项中选择，禁止改写选项文字。多选字段选1至3项，单选字段只选1项；原文没有直接说明时，根据项目目的选择最合理项。另提炼3条不超过28字的项目要点。只输出JSON：{"projectName":"...","keyPoints":["..."],"answers":{"字段":["选项"]}}。\n设计场域：${designType}\n字段与有效选项：${JSON.stringify(options)}\n项目背景：${source}` }],
      stream: false,
    });
    if (!response.ok) throw new Error(`Agent 返回 ${response.status}`);
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = parseJsonObject(data.choices?.[0]?.message?.content || "");
    const projectName = typeof parsed?.projectName === "string" ? parsed.projectName.trim().slice(0, 20) : "";
    const keyPoints = Array.isArray(parsed?.keyPoints) ? parsed.keyPoints.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 3) : [];
    if (!keyPoints.length) throw new Error("Agent 未返回项目要点");
    return Response.json({ projectName, keyPoints, answers: validAnswers(parsed?.answers, designType), sourceText: source });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "项目背景读取失败" }, { status: 400 });
  }
}

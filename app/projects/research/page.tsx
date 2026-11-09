"use client";

import { useEffect, useState } from "react";
import DashboardSidebar from "../../components/DashboardSidebar";
import FlowProgress from "../../components/FlowProgress";
import ProjectRequirementSummary from "../../components/ProjectRequirementSummary";
import ProjectTopbar from "../../components/ProjectTopbar";
import ResearchRunner from "../../components/ResearchRunner";
import CandidateCaseBoard from "../../components/CandidateCaseBoard";
import VisualTrendBoard from "../../components/VisualTrendBoard";
import { saveCurrentProject } from "../../lib/savedProjects";

const cases = [
  { id: "sample-1", name: "淘宝夏日能量收集玩法", brand: "淘宝", platform: "小红书", media: "帖子截图", author: "电商玩法观察", date: "2026.07.18", type: "收集", goal: "促活", match: 94, tone: "lavender", insight: "帖子完整展示了入口、任务页和阶段奖励，适合观察进度反馈如何推动持续参与。", tags: ["进度反馈", "阶段奖励", "低门槛"] },
  { id: "sample-2", name: "美团城市寻宝活动体验", brand: "美团", platform: "小红书", media: "帖子截图", author: "产品体验记录", date: "2026.06.21", type: "收集", goal: "传播", match: 88, tone: "mint", insight: "用户帖子记录了地图探索与成就分享路径，可用于分析任务场景化方式。", tags: ["地图探索", "成就体系", "分享"] },
  { id: "sample-3", name: "拼多多好运翻牌任务", brand: "拼多多", platform: "小红书", media: "视频 · 00:42", author: "羊毛活动研究所", date: "2026.05.09", type: "抽奖", goal: "转化", match: 82, tone: "peach", insight: "视频完整呈现奖励前置、任务完成与翻牌反馈，适合拆解转化链路。", tags: ["奖励前置", "即时反馈", "转化"] },
  { id: "sample-4", name: "抖音品牌人格答题互动", brand: "抖音", platform: "小红书", media: "视频 · 01:06", author: "交互案例库", date: "2026.04.16", type: "答题", goal: "传播", match: 76, tone: "blue", insight: "视频覆盖答题到结果分享的完整流程，便于分析个性化表达价值。", tags: ["个性化结果", "短流程", "分享卡"] },
];

const feedback = [
  { quote: "任务不难，能看到还差多少就愿意继续做。", sentiment: "正向", topic: "进度反馈", platform: "小红书", source: "帖子评论 · 2026.07.18", lesson: "持续展示进度和下一阶段奖励，减少用户对任务成本的不确定。" },
  { quote: "一进来先让我登录，我还不知道这个活动值不值得玩。", sentiment: "负向", topic: "参与门槛", platform: "小红书", source: "用户帖子 · 2026.06.21", lesson: "将登录与授权后置，让用户先理解玩法和奖励。" },
  { quote: "奖励是什么写得很清楚，做完一项就有反馈。", sentiment: "正向", topic: "奖励预期", platform: "小红书", source: "用户帖子 · 2026.05.09", lesson: "首屏说明核心奖励，并在每次任务完成时提供即时反馈。" },
];

const tagTone = (tag: string) => {
  if (["进度反馈", "即时反馈"].includes(tag)) return "feedback";
  if (["阶段奖励", "奖励前置"].includes(tag)) return "reward";
  if (["分享", "分享卡"].includes(tag)) return "share";
  if (["低门槛", "短流程"].includes(tag)) return "friction";
  if (["转化", "成就体系"].includes(tag)) return "outcome";
  return "identity";
};

export default function ResearchPage() {
  const [selected, setSelected] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [researching, setResearching] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [hasGeneratedStrategy, setHasGeneratedStrategy] = useState(false);
  const [researchStatus, setResearchStatus] = useState("queued");
  const [researchMode, setResearchMode] = useState<"play" | "visual">("play");

  useEffect(() => {
    const shouldStart = window.sessionStorage.getItem("design-lab-start-research") === "1";
    try {
      const draft = JSON.parse(window.localStorage.getItem("design-lab-project-draft") || "{}");
      setResearchMode(draft.researchMode === "visual" ? "visual" : "play");
    } catch { /* use gameplay research by default */ }
    setResearching(shouldStart);
    const taskId = window.localStorage.getItem("design-lab-active-research-task") || "";
    if (taskId) {
      if (shouldStart) {
        fetch(`/api/research/tasks/${taskId}`, { cache: "no-store" })
          .then((response) => response.ok ? response.json() : null)
          .then((data) => fetch(`/api/research/tasks/${taskId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              status: "queued",
              activity: { ...(data?.task?.activity || {}), executionRequested: true, executionRequestedAt: new Date().toISOString() },
            }),
          }))
          .catch(() => undefined);
      }
      fetch(`/api/research/tasks/${taskId}/strategies`, { cache: "no-store" })
        .then((response) => { if (response.ok) setHasGeneratedStrategy(true); })
        .catch(() => undefined);
    }
  }, []);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2200);
  };

  const toggleSelected = (id: string) => {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const generateStrategies = (force = false) => {
    if (!selected.length || generating) return;
    if (hasGeneratedStrategy && !force) {
      window.location.href = "/projects/strategy";
      return;
    }
    setGenerating(true);
    window.sessionStorage.setItem("design-lab-generate-strategy", force ? "force" : "create");
    window.location.href = "/projects/strategy";
  };

  const saveResearch = () => {
    const taskId = window.localStorage.getItem("design-lab-active-research-task") || "";
    if (!taskId) return;
    try {
      const project = JSON.parse(window.localStorage.getItem("design-lab-project-draft") || "{}");
      const id = window.localStorage.getItem("design-lab-current-project-id") || taskId;
      saveCurrentProject({ id, taskId, name: String(project.projectName || "未命名项目"), kind: project.designType === "brand" ? "品牌设计" : project.designType === "marketing" ? "大促设计" : "互动设计", stage: researchMode === "visual" ? "视觉调研" : "竞品调研", progress: 40, savedAt: new Date().toISOString(), route: "/projects/research", project });
      flash("用户调研已保存");
    } catch { flash("保存失败，请稍后重试"); }
  };

  const resumeVisualCollection = async () => {
    const taskId = window.localStorage.getItem("design-lab-active-research-task") || "";
    if (!taskId) return;
    const response = await fetch(`/api/research/tasks/${taskId}`, { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok) return;
    await fetch(`/api/research/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: "queued",
        activity: { ...(data?.task?.activity || {}), executionRequested: true, executionRequestedAt: new Date().toISOString(), phase: "visual_reference_queued", message: "已确认视觉方向，开始采集参考图" },
      }),
    });
  };

  return (
    <main className="research-page">
      <DashboardSidebar projectActive />

      <section className="research-main">
        <ProjectTopbar section={researchMode === "visual" ? "竞品视觉与趋势" : "玩法案例与用户反馈调研"} />

        <div className="research-content">
          <FlowProgress active={2} />
          <ProjectRequirementSummary />
          {researching ? (
            <>
              {researchMode === "play" && researchStatus === "awaiting_visual_confirmation" && <CandidateCaseBoard onSelectionChange={setSelected} />}
              <ResearchRunner candidateSelectionCount={selected.length} onStatusChange={setResearchStatus} onConfirmDirections={() => {
                if (researchMode === "visual") {
                  return resumeVisualCollection();
                }
                generateStrategies(false);
              }} onComplete={() => {
                window.sessionStorage.removeItem("design-lab-start-research");
                setResearching(false);
              }} />
            </>
          ) : (
          <>
          {researchMode === "play" && <CandidateCaseBoard onSelectionChange={setSelected} />}
          {researchMode === "visual" && <VisualTrendBoard />}
          {false && <>
          <div className="research-intro">
            <div><p>RESEARCH EVIDENCE</p><h1>为你找到 4 个相关案例。</h1><span>根据“促活、收集、完成率低”等项目条件推荐。选择最值得参考的内容，作为下一步策略依据。</span></div>
            <div className="selection-count"><small>已选择</small><strong>{selected.length}</strong><span>个案例</span></div>
          </div>

          <div className="filter-row">
            <div><button className="active" type="button">全部 4</button><button type="button">高度相关 2</button><button type="button">已收藏 {saved.length}</button></div>
            <button type="button">筛选与排序⌄</button>
          </div>

          <section className="case-grid">
            {cases.filter((item) => !excluded.includes(item.id)).map((item) => (
              <article className={`case-card ${selected.includes(item.id) ? "selected" : ""}`} key={item.id}>
                <div className={`case-visual evidence-shot ${item.tone}`}>
                  <div className="source-bar">
                    <button
                      className={`evidence-check ${selected.includes(item.id) ? "checked" : ""}`}
                      type="button"
                      aria-label={selected.includes(item.id) ? "取消选择案例" : "选择案例"}
                      onClick={() => toggleSelected(item.id)}
                    >
                      {selected.includes(item.id) && <img src="/check-circle-fill.svg" alt="" />}
                    </button>
                    <b>{item.media}</b>
                  </div>
                  <div className="post-mock"><i /><i /><strong>{item.brand}</strong><p>完整来源截图示例占位</p><small>{item.author} · {item.date}</small></div>
                  <em>{item.match}% 相关</em>
                </div>
                <div className="case-body">
                  <div className="case-meta"><span>{item.platform} · {item.author}</span><b>{item.goal} · {item.type}</b></div>
                  <h2>{item.name}</h2>
                  <p>{item.insight}</p>
                  <div className="case-tags">{item.tags.map((tag) => <span className={`tag-${tagTone(tag)}`} key={tag}>{tag}</span>)}</div>
                  <div className="case-reason"><small>推荐原因</small><p>匹配当前项目目标和玩法类型，可参考其{item.tags[0]}方式。</p></div>
                  <div className="case-actions">
                    <button className={selected.includes(item.id) ? "selected-button" : ""} type="button" onClick={() => toggleSelected(item.id)}>
                      {selected.includes(item.id) ? "已选为依据" : "选择为依据"}
                    </button>
                    <button type="button" onClick={() => setSaved((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])}>
                      {saved.includes(item.id) ? "★" : "☆"}
                    </button>
                    <button type="button" onClick={() => setExcluded((current) => [...current, item.id])}>排除</button>
                  </div>
                </div>
              </article>
            ))}
          </section>
          </>}

          {researchMode === "play" && <footer className="research-footer">
              <button type="button" onClick={saveResearch}>保存</button>
            <button className="generate-button" type="button" disabled={!selected.length || generating} onClick={() => { generateStrategies(false); }}>设计方向 <span>→</span></button>
          </footer>}
          </>
          )}
        </div>
      </section>
      {notice && <div className="toast"><i />{notice}</div>}
    </main>
  );
}

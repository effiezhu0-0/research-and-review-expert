"use client";

import { useEffect, useState } from "react";
import DashboardSidebar from "../../components/DashboardSidebar";
import FlowProgress from "../../components/FlowProgress";
import ProjectRequirementSummary from "../../components/ProjectRequirementSummary";
import ProjectTopbar from "../../components/ProjectTopbar";
import ResearchRunner from "../../components/ResearchRunner";
import VisualTrendBoard from "../../components/VisualTrendBoard";
import { personalAgentHeaders } from "../../lib/personalAgentConfig";
import { saveCurrentProject } from "../../lib/savedProjects";

type Opportunity = { title: string; detail: string; metric: string; evidenceCandidateIds: string[] };
type Strategy = { title: string; action: string; metric: string; evidenceCandidateIds: string[]; evidenceQuotes: string[]; risk: string };
type Direction = { title: string; summary: string; flow: string[]; points: string[]; test: string };
type StrategyResult = { summary: string; opportunities: Opportunity[]; strategies: Strategy[]; directions: Direction[] };

export default function StrategyPage() {
  const [result, setResult] = useState<StrategyResult | null>(null);
  const [warning, setWarning] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sourceCount, setSourceCount] = useState(0);
  const [visualReady, setVisualReady] = useState(false);
  const [saved, setSaved] = useState(false);
  const [strategyProgress, setStrategyProgress] = useState(8);

  const saveProject = () => {
    const taskId = window.localStorage.getItem("design-lab-active-research-task") || "";
    if (!taskId) return;
    try {
      const project = JSON.parse(window.localStorage.getItem("design-lab-project-draft") || "{}");
      const name = String(project.projectName || "未命名项目").trim();
      saveCurrentProject({ id: taskId, taskId, name, kind: "互动设计", stage: "归因结论", progress: 100, savedAt: new Date().toISOString(), route: "/projects/strategy", project });
      setSaved(true);
    } catch { setSaved(false); }
  };

  useEffect(() => {
    setWarning(window.sessionStorage.getItem("design-lab-strategy-warning") || "");
    const taskId = window.localStorage.getItem("design-lab-active-research-task") || "";
    if (!taskId) {
      queueMicrotask(() => {
        setError("没有找到当前研究任务，请先返回案例页选择研究依据。");
        setLoading(false);
      });
      return;
    }
    const generationMode = window.sessionStorage.getItem("design-lab-generate-strategy");
    const strategyRequest = generationMode
      ? fetch(`/api/research/tasks/${taskId}/strategies`, {
          method: "POST",
          headers: { "content-type": "application/json", ...personalAgentHeaders() },
          body: JSON.stringify({ force: generationMode === "force" }),
        })
      : fetch(`/api/research/tasks/${taskId}/strategies`, { cache: "no-store" });
    strategyRequest
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "策略读取失败");
        window.sessionStorage.removeItem("design-lab-generate-strategy");
        if (data.warning) setWarning(data.warning);
        setResult(data.strategy);
        setSourceCount(data.sourceCandidateIds?.length || 0);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "策略读取失败"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const taskId = window.localStorage.getItem("design-lab-active-research-task") || "";
    if (!taskId) return;
    const startVisualResearch = async () => {
      const response = await fetch(`/api/research/tasks/${taskId}`, { cache: "no-store" }).catch(() => null);
      if (!response?.ok) return;
      const data = await response.json();
      const task = data.task;
      if (task?.status === "completed") {
        setVisualReady(true);
        return;
      }
      if (task?.status === "awaiting_visual_confirmation" && task?.activity?.visualDirectionsConfirmed) {
        await fetch(`/api/research/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            status: "queued",
            activity: { ...task.activity, executionRequested: true, executionRequestedAt: new Date().toISOString(), phase: "visual_reference_queued", message: "已进入策略页，等待收集视觉案例" },
          }),
        });
      }
    };
    void startVisualResearch();
  }, []);

  useEffect(() => {
    if (!loading) return;
    const timer = window.setInterval(() => {
      setStrategyProgress((current) => Math.min(92, current + Math.max(1, Math.round((92 - current) / 14))));
    }, 900);
    return () => window.clearInterval(timer);
  }, [loading]);

  return (
    <main className="research-page strategy-page">
      <DashboardSidebar projectActive />
      <section className="research-main">
        <ProjectTopbar section="归因结论" />
        <div className="strategy-content">
          <FlowProgress active={3} />
          <ProjectRequirementSummary />
          <div className="strategy-intro">
            <p>DESIGN DIRECTION</p>
            <h1>从证据到可执行的设计方向。</h1>
            <span>{result?.summary || "根据已选择的小红书帖子与用户反馈，交叉提炼设计机会、策略动作和验证方向。"}</span>
          </div>
          {warning && <div className="strategy-warning"><strong>已使用本地证据归纳</strong><span>{warning}。当前结果可继续编辑；恢复网络后可重新生成 Agent 版本。</span></div>}

          {loading && <div className="strategy-generation-progress"><strong>Agent 正在生成设计策略与方向</strong><span>正在提炼所选案例、用户反馈与项目目标，请稍候。</span><i><b style={{ width: `${strategyProgress}%` }} /></i></div>}
          {!loading && error && <div className="evidence-empty"><strong>暂时没有可展示的策略</strong><span>{error}</span></div>}
          {result && <>
            <section className="strategy-evidence-summary">
              <div><small>策略依据</small><strong>{sourceCount} 个案例</strong><span>来自当前任务中人工选定的小红书帖子</span></div>
              <div><small>用户证据</small><strong>{result.strategies.reduce((count, item) => count + item.evidenceQuotes.length, 0)} 条引用</strong><span>保留评论原意，用于支持或质疑策略</span></div>
              <div><small>策略产出</small><strong>{result.strategies.length} 条策略</strong><span>每条包含行动、指标、风险与证据</span></div>
            </section>

            <section className="strategy-section">
              <div className="strategy-heading"><div><small>OPPORTUNITIES</small><h2>{result.opportunities.length} 个设计机会</h2></div><span>由帖子模式与用户反馈交叉归纳</span></div>
              <div className="opportunity-grid">
                {result.opportunities.map((item, index) => <article className="opportunity-card" key={`${item.title}-${index}`}><b>{String(index + 1).padStart(2, "0")}</b><h3>{item.title}</h3><p>{item.detail}</p><span>{item.metric}</span></article>)}
              </div>
            </section>

            <section className="strategy-section">
              <div className="strategy-heading"><div><small>STRATEGY</small><h2>建议优先采用的策略</h2></div><span>每条策略保留依据、风险与验证指标</span></div>
              <div className="strategy-list">
                {result.strategies.map((item, index) => (
                  <article className="strategy-item" key={`${item.title}-${index}`}>
                    <i>{index + 1}</i>
                    <div>
                      <h3>{item.title}</h3><p>{item.action}</p>
                      <div>
                        {item.evidenceQuotes.slice(0, 2).map((quote) => <span title={quote} key={quote}>用户反馈：{quote.slice(0, 24)}{quote.length > 24 ? "…" : ""}</span>)}
                        {item.evidenceCandidateIds.map((id) => <span key={id}>案例证据</span>)}
                        <span title={item.risk}>风险：{item.risk.slice(0, 20)}{item.risk.length > 20 ? "…" : ""}</span>
                      </div>
                    </div>
                    <aside><small>优先指标</small><strong>{item.metric}</strong></aside>
                  </article>
                ))}
              </div>
            </section>

            <section className="strategy-section">
              <div className="strategy-heading"><div><small>DIRECTIONS</small><h2>可参考的初步方向</h2></div><span>作为后续设计起点，不代替设计师判断</span></div>
              <div className="direction-grid">
                {result.directions.map((item, directionIndex) => (
                  <article className="direction-card" key={`${item.title}-${directionIndex}`}>
                    <div className="direction-top"><span>方向 {String.fromCharCode(65 + directionIndex)}</span><small>参考方向</small></div>
                    <h3>{item.title}</h3><p>{item.summary}</p>
                    <div className="direction-flow">{item.flow.map((step, index) => <span key={`${step}-${index}`}>{step}{index < item.flow.length - 1 && <b>→</b>}</span>)}</div>
                    <div className="direction-points">{item.points.map((point) => <span key={point}>{point}</span>)}</div>
                    <footer><small>建议验证</small><strong>{item.test}</strong></footer>
                  </article>
                ))}
              </div>
            </section>
          </>}

          <section className="strategy-visual-research">
            {visualReady ? <VisualTrendBoard /> : <ResearchRunner onComplete={() => setVisualReady(true)} />}
          </section>

          <footer className="strategy-footer">
            <button type="button" onClick={() => { window.location.href = "/projects/research"; }}>返回案例与反馈</button>
            <button className="save-project-button" type="button" disabled={!visualReady || !result || saved} onClick={saveProject}>{saved ? "项目已保存" : "保存项目"}</button>
            <button className="confirm-direction" type="button" disabled={!result} onClick={() => { window.sessionStorage.setItem("design-lab-entry-source", "project-flow"); window.location.href = "/projects/import"; }}>
              进入方案评分 <img src="/arrow-right-regular.svg" alt="" />
            </button>
          </footer>
        </div>
      </section>
    </main>
  );
}

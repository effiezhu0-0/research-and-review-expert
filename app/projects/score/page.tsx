"use client";

import { useCallback, useEffect, useState } from "react";
import DashboardSidebar from "../../components/DashboardSidebar";
import ProjectTopbar from "../../components/ProjectTopbar";
import StageProgress from "../../components/StageProgress";
import { personalAgentHeaders } from "../../lib/personalAgentConfig";
import { readSolution } from "../../lib/localSolutionStore";

type AgentReview = { id: string; score: number; verdict: string; keywords: string[]; findings: string[]; gaps: string[]; recommendations: string[] };
type ReviewResult = { schemaVersion: number; overallScore: number; summary: string; businessGoals: Array<{ goal: string; score: number; finding: string }>; reviews: AgentReview[] };

export default function ScorePage() {
  const [solution, setSolution] = useState<ReturnType<typeof readSolution>>(null);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [status, setStatus] = useState("Agent 正在评估方案…");
  const [evaluating, setEvaluating] = useState(false);

  const evaluate = useCallback(async (current: NonNullable<ReturnType<typeof readSolution>>) => {
    setEvaluating(true); setStatus("Agent 正在结合业务诉求与研究策略评估方案…");
    let draft: { answers?: Record<string, string[]>; customValues?: Record<string, string> } = {};
    try { draft = JSON.parse(window.localStorage.getItem("design-lab-project-draft") || "{}"); } catch { draft = {}; }
    const businessGoals = [...(draft.answers?.goal || []), ...(draft.customValues?.goal?.trim() ? [draft.customValues.goal.trim()] : [])];
    const response = await fetch("/api/solution-review", { method: "POST", headers: { "content-type": "application/json", ...personalAgentHeaders() }, body: JSON.stringify({ projectName: current.projectName, solutionName: current.solutionName, businessGoals, designPoints: current.designPoints.map((point) => ({ id: point.id, title: point.title, description: point.description, strategy: point.strategy, metrics: point.metrics })) }) }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok || !Array.isArray(data?.reviews)) { setStatus(data?.error || "评价失败，请检查 Agent 配置"); setResult(null); }
    else { const next = { ...data, schemaVersion: 2 }; setResult(next); setStatus("评价完成"); window.localStorage.setItem("design-lab-solution-review", JSON.stringify(next)); }
    setEvaluating(false);
  }, []);

  useEffect(() => {
    const current = readSolution(); setSolution(current);
    if (!current) return;
    try { const cached = JSON.parse(window.localStorage.getItem("design-lab-solution-review") || "null"); if (cached?.schemaVersion === 2 && cached?.reviews) { setResult(cached); setStatus("评价完成"); return; } } catch { /* ignore invalid cache */ }
    void evaluate(current);
  }, [evaluate]);

  return <main className="research-page solution-workflow"><DashboardSidebar projectActive /><section className="research-main"><ProjectTopbar section="方案评价" demo="Agent 评估" /><div className="solution-content">
    <StageProgress steps={["方案评价"]} active={1} />
    <header className="solution-hero"><p>DESIGN REVIEW</p><h1>评估方案能否满足业务诉求。</h1><span>Agent 将业务目标、研究策略、设计动作与预期指标放在同一条判断链上。</span></header>
    {!solution ? <section className="workflow-empty"><span>⇧</span><h2>还没有导入方案</h2><p>先录入方案和关键设计点，再进行评价。</p><button type="button" onClick={() => { window.location.href = "/projects/import"; }}>导入已有方案</button></section> : <>
      <section className="review-summary"><div><small>当前方案</small><strong>{solution.solutionName}</strong><span>{solution.version} · {solution.designPoints.length} 个设计点</span></div><div className="coverage"><small>业务诉求匹配度</small><strong>{result ? `${result.overallScore}%` : "—"}</strong><i><b style={{ width: `${result?.overallScore || 0}%` }} /></i></div></section>
      <p className={`agent-review-status ${result ? "ready" : ""}`}><i />{evaluating ? status : result?.summary || status}</p>
      {result?.businessGoals?.length > 0 && <section className="business-fit"><h2>业务诉求</h2><div>{result.businessGoals.map((item) => <article key={item.goal}><strong>{item.goal}</strong><b>{item.score}</b><span>{item.finding}</span></article>)}</div></section>}
      <section className="workflow-section">
        <div className="workflow-heading"><div><small>AGENT REVIEW</small><h2>设计点评价</h2></div><span>分数反映设计动作对策略与业务诉求的匹配程度</span></div>
        <div className="review-list">{solution.designPoints.map((point, index) => {
          const review = result?.reviews.find((item) => item.id === point.id);
          return <article key={point.id}>
            <div className="review-point"><i>{String(index + 1).padStart(2, "0")}</i><div><h3>{point.title}</h3><p>{point.description || "尚未补充具体变化"}</p><span>策略：{point.strategy || "未绑定"}</span>{point.metrics.map((metric) => <span key={metric}>指标：{metric}</span>)}</div></div>
            <div className="agent-score">
              <header><strong>{review ? review.score : "—"}</strong><span>{review?.verdict || (evaluating ? "评估中" : "暂无结果")}</span></header>
              {review && <>
                {review.keywords?.length > 0 && <div className="review-keywords">{review.keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}</div>}
                <ul className="review-bullets">{review.findings?.map((item) => <li key={item}>{item}</li>)}</ul>
                {review.gaps?.length > 0 && <section className="review-detail"><b>主要缺口</b><ul>{review.gaps.map((item) => <li key={item}>{item}</li>)}</ul></section>}
                {review.recommendations?.length > 0 && <section className="review-detail"><b>优化建议</b><ul>{review.recommendations.map((item) => <li key={item}>{item}</li>)}</ul></section>}
              </>}
            </div>
          </article>;
        })}</div>
      </section>
      <footer className="workflow-footer"><button className="secondary-button" type="button" onClick={() => { window.location.href = "/projects/import"; }}>修改方案</button><button className="secondary-button" type="button" disabled={evaluating} onClick={() => { window.localStorage.removeItem("design-lab-solution-review"); void evaluate(solution); }}>{evaluating ? "评估中…" : "重新评估"}</button><button className="primary-workflow-button" type="button" onClick={() => { window.location.href = "/projects/retrospective"; }}>进入上线复盘 →</button></footer>
    </>}
  </div></section></main>;
}

"use client";

import { useEffect, useState } from "react";
import DashboardSidebar from "../../components/DashboardSidebar";
import FlowProgress from "../../components/FlowProgress";
import ProjectRequirementSummary from "../../components/ProjectRequirementSummary";
import ProjectTopbar from "../../components/ProjectTopbar";

type Opportunity = { title: string; detail: string; metric: string; evidenceCandidateIds: string[] };
type Strategy = { title: string; action: string; metric: string; evidenceCandidateIds: string[]; evidenceQuotes: string[]; risk: string };
type Direction = { title: string; summary: string; flow: string[]; points: string[]; test: string };
type StrategyResult = { summary: string; opportunities: Opportunity[]; strategies: Strategy[]; directions: Direction[] };

export default function StrategyPage() {
  const [result, setResult] = useState<StrategyResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sourceCount, setSourceCount] = useState(0);

  useEffect(() => {
    const taskId = window.localStorage.getItem("design-lab-active-research-task") || "";
    if (!taskId) {
      queueMicrotask(() => {
        setError("没有找到当前研究任务，请先返回案例页选择研究依据。");
        setLoading(false);
      });
      return;
    }
    fetch(`/api/research/tasks/${taskId}/strategies`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "策略读取失败");
        setResult(data.strategy);
        setSourceCount(data.sourceCandidateIds?.length || 0);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "策略读取失败"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="research-page strategy-page">
      <DashboardSidebar active="strategy" />
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

          {loading && <div className="evidence-empty"><strong>正在读取策略</strong><span>策略结果和证据关系正在加载。</span></div>}
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

          <footer className="strategy-footer">
            <button type="button" onClick={() => { window.location.href = "/projects/research"; }}>返回案例与反馈</button>
            <button className="confirm-direction" type="button" disabled={!result} onClick={() => { window.location.href = "/projects/score"; }}>
              进入方案评分 <img src="/arrow-right-regular.svg" alt="" />
            </button>
          </footer>
        </div>
      </section>
    </main>
  );
}

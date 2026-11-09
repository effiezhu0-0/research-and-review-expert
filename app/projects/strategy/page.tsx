"use client";

import { useEffect, useState } from "react";
import DashboardSidebar from "../../components/DashboardSidebar";
import FlowProgress from "../../components/FlowProgress";
import ProjectRequirementSummary from "../../components/ProjectRequirementSummary";
import ProjectTopbar from "../../components/ProjectTopbar";
import { personalAgentHeaders } from "../../lib/personalAgentConfig";
import { saveCurrentProject } from "../../lib/savedProjects";

type Opportunity = { title: string; detail: string; metric: string; evidenceCandidateIds: string[] };
type Strategy = { title: string; action: string; metric: string; evidenceCandidateIds: string[]; evidenceQuotes: string[]; risk: string };
type Direction = { title: string; summary: string; flow: string[]; points: string[]; test: string };
type StrategyResult = { summary: string; opportunities: Opportunity[]; strategies: Strategy[]; directions: Direction[] };

const INTERACTION_METRICS = ["参与转化率", "任务完成率", "奖励领取率", "次日回访率", "重复参与率", "关键步骤流失率"];
const METRIC_ALIASES: Record<string, string> = {
  "参与率": "参与转化率", "点击率": "入口点击率", "完成率": "任务完成率", "奖励到账查询率": "奖励领取率",
  "奖励到账率": "奖励领取率", "回访率": "次日回访率", "流失率": "关键步骤流失率", "退出率": "关键步骤流失率",
  "人均参与次数": "人均参与次数", "重复参与": "重复参与率", "投诉率": "体验反馈率", "活跃率": "互动活跃率",
};

function normalizeMetric(metric: string) {
  const value = metric.trim().replace(/^(待验证|优先指标|指标)\s*[：:]\s*/, "");
  return METRIC_ALIASES[value] || (value.length <= 10 ? value : "任务完成率");
}

function splitMonitoringSteps(text: string) {
  return text.split(/[；;。]/).map((step) => step.trim()).filter(Boolean).map((step) => step
    .replace(/方案评审与资源经济、异常状态评估/g, "确认方案可落地，并检查可能影响体验的异常情况")
    .replace(/方案评审并核算阶段奖励与资源预算/g, "确认方案可落地，并对齐阶段奖励与资源安排")
    .replace(/研发联调任务、资产、奖励和弱网幂等链路/g, "与产品、研发确认关键体验、素材与奖励呈现")
    .replace(/研发联调目标进度、发奖和返场兑换/g, "与产品、研发确认目标进度、奖励与返场体验")
    .replace(/进行埋点验收并核对状态漏斗与账本/g, "确认上线后可观察关键步骤是否顺畅")
    .replace(/通过埋点验收确认阶段曝光、开启、完成和流失口径/g, "确认可观察到各阶段的进入、完成与流失情况")
    .replace(/按用户与版本灰度发布/g, "先在有限范围上线，观察用户体验")
    .replace(/小流量灰度发布/g, "先在有限范围上线，观察用户体验")
    .replace(/对现网基线与新闭环进行分流对照/g, "与当前方案对照，观察体验差异")
    .replace(/对现有等级链路进行分流对照/g, "与当前方案对照，观察体验差异")
    .replace(/正式监测/g, "持续观察")
    .replace(/并按异常归因、修复、复盘形成问题闭环/g, "汇总问题并推动后续迭代")
    .replace(/并持续处理异常与策略偏差/g, "并持续处理体验问题")
  );
}

function cleanDirectionTitle(text: string) {
  return text.replace(/^(优先方向|备选方向|有限探索方向|有限替代方向|替代方向|探索方向)\s*[：:]\s*/, "");
}

export default function StrategyPage() {
  const [result, setResult] = useState<StrategyResult | null>(null);
  const [warning, setWarning] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sourceCount, setSourceCount] = useState(0);
  const [saved, setSaved] = useState(false);
  const [strategyProgress, setStrategyProgress] = useState(8);

  const saveProject = () => {
    const taskId = window.localStorage.getItem("design-lab-active-research-task") || "";
    if (!taskId) return;
    try {
      const project = JSON.parse(window.localStorage.getItem("design-lab-project-draft") || "{}");
      const name = String(project.projectName || "未命名项目").trim();
      const id = window.localStorage.getItem("design-lab-current-project-id") || taskId;
      const kind = project.designType === "brand" ? "品牌设计" : project.designType === "marketing" ? "大促设计" : "互动设计";
      saveCurrentProject({ id, taskId, name, kind, stage: "归因结论", progress: 100, savedAt: new Date().toISOString(), route: "/projects/strategy", project });
      setSaved(true);
    } catch { setSaved(false); }
  };

  const openVisualResearch = () => {
    try {
      const project = JSON.parse(window.localStorage.getItem("design-lab-project-draft") || "{}");
      window.localStorage.setItem("design-lab-project-draft", JSON.stringify({ ...project, researchMode: "visual" }));
    } catch { /* keep the current project draft if it cannot be parsed */ }
    window.sessionStorage.setItem("design-lab-start-research", "1");
    window.location.href = "/projects/research";
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
            <span>{result?.summary || "根据已选案例与用户反馈，交叉提炼设计机会、策略动作和验证方向。"}</span>
          </div>
          {warning && <div className="strategy-warning"><strong>已使用本地证据归纳</strong><span>{warning}。当前结果可继续编辑；恢复网络后可重新生成 Agent 版本。</span></div>}

          {loading && <div className="strategy-generation-progress"><strong>Agent 正在生成设计策略与方向</strong><span>正在提炼所选案例、用户反馈与项目目标，请稍候。</span><i><b style={{ width: `${strategyProgress}%` }} /></i></div>}
          {!loading && error && <div className="evidence-empty"><strong>暂时没有可展示的策略</strong><span>{error}</span></div>}
          {result && <>
            <section className="strategy-evidence-summary">
              <div><small>策略依据</small><strong>{sourceCount} 个案例</strong><span>来自当前任务中人工选定的研究案例</span></div>
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
                    </div>
                    <aside>
                      <small>互动体验指标</small>
                      <div className="strategy-metric-labels">
                        {(item.metric.split(/[、，,；;]+/).map(normalizeMetric).filter(Boolean).length ? item.metric.split(/[、，,；;]+/).map(normalizeMetric).filter(Boolean) : INTERACTION_METRICS.slice(0, 3)).map((metric, metricIndex) => <span key={`${metric}-${metricIndex}`}>{metric}</span>)}
                      </div>
                    </aside>
                  </article>
                ))}
              </div>
            </section>

            <section className="strategy-section">
              <div className="strategy-heading"><div><small>DIRECTIONS</small><h2>可参考的初步方向</h2></div><span>作为后续设计起点，不代替设计师判断</span></div>
              <div className="direction-grid">
                {result.directions.map((item, directionIndex) => (
                  <article className="direction-card" key={`${item.title}-${directionIndex}`}>
                    <div className="direction-top"><span>设计方向 {String(directionIndex + 1).padStart(2, "0")}</span></div>
                    <div className="direction-module direction-overview">
                      <h3>{cleanDirectionTitle(item.title)}</h3><p>{item.summary}</p>
                    </div>
                    <div className="direction-module direction-flow-wrap">
                      <small>用户流程</small>
                      <ol className="direction-flow">
                        {item.flow.map((step, index) => <li key={`${step}-${index}`}><i>{index + 1}</i><span>{step}</span></li>)}
                      </ol>
                    </div>
                    <div className="direction-module direction-points-wrap">
                      <small>设计要点</small>
                      <ul className="direction-points">{item.points.map((point) => <li key={point}>{point}</li>)}</ul>
                    </div>
                    <footer className="direction-module direction-monitoring"><small>设计验证与上线观察</small><ol>{splitMonitoringSteps(item.test).map((step, index) => <li key={`${step}-${index}`}>{step}</li>)}</ol></footer>
                  </article>
                ))}
              </div>
            </section>
          </>}

          <footer className="strategy-footer">
            <button className="back-action" type="button" onClick={() => { window.location.href = "/projects/research"; }}>返回</button>
            <button className="visual-research-action" type="button" disabled={loading} onClick={openVisualResearch}>视觉研究</button>
            <button className="confirm-direction" type="button" disabled={loading || !result} onClick={() => { window.sessionStorage.setItem("design-lab-entry-source", "project-flow"); window.location.href = "/projects/import"; }}>方向评分</button>
            <button className="save-project-action" type="button" disabled={loading || !result || saved} onClick={saveProject}>{saved ? "已保存" : "保存"}</button>
          </footer>
        </div>
      </section>
    </main>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import DashboardSidebar from "../../components/DashboardSidebar";
import ProjectTopbar from "../../components/ProjectTopbar";
import StageProgress from "../../components/StageProgress";
import NightingaleIcon from "../../components/NightingaleIcon";
import { DesignPoint, readRetrospectiveForProject, readSolutionForProject, RetrospectiveItem, saveRetrospective, ValidationResult } from "../../lib/localSolutionStore";

const results: ValidationResult[] = ["有效提升", "无明显影响", "负向影响", "数据不足", "无法归因"];
const metricOptions = ["参与率", "点击率", "曝光率", "进入率", "完成率", "转化率", "分享率", "留存率", "流失率", "成功率"];
const normalizeMetric = (metric: string) => metricOptions.find((option) => metric.includes(option.replace("率", ""))) || metric;
const blankItem = (point: DesignPoint, metric: string): RetrospectiveItem => ({ designPointId: point.id, metric, metricType: metric, baseline: "", target: "", actual: "", period: "", result: "数据不足", note: "" });
const pointMetrics = (point: DesignPoint) => [...new Set((point.metrics?.length ? point.metrics : point.metric ? [point.metric] : ["参与率"]).map(normalizeMetric))];

export default function RetrospectivePage() {
  const [solution, setSolution] = useState<ReturnType<typeof readSolutionForProject>>(null);
  const [launchedAt, setLaunchedAt] = useState("");
  const [summary, setSummary] = useState("");
  const [items, setItems] = useState<RetrospectiveItem[]>([]);
  const [saved, setSaved] = useState(false);
  useEffect(() => { const projectId = window.localStorage.getItem("design-lab-current-project-id") || ""; const loaded = readSolutionForProject(projectId); const existing = readRetrospectiveForProject(projectId); setSolution(loaded); if (existing) { setLaunchedAt(existing.launchedAt); setSummary(existing.summary); setItems(existing.items.map((item) => ({ ...item, metricType: normalizeMetric(item.metric || "参与率"), metric: normalizeMetric(item.metric || "参与率") }))); } else if (loaded) setItems(loaded.designPoints.flatMap((point) => pointMetrics(point).map((metric) => blankItem(point, metric)))); }, []);
  const update = (id: string, metric: string, field: keyof RetrospectiveItem, value: string) => setItems((current) => current.map((item) => item.designPointId === id && item.metric === metric ? { ...item, [field]: value } : item));
  const changeMetric = (id: string, previous: string, metric: string) => setItems((current) => current.map((item) => item.designPointId === id && item.metric === previous ? { ...item, metric, metricType: metric } : item));
  const addMetric = (point: DesignPoint) => setItems((current) => { const used = current.filter((item) => item.designPointId === point.id).map((item) => item.metric); const metric = metricOptions.find((option) => !used.includes(option)) || `自定义指标${used.length + 1}`; return [...current, blankItem(point, metric)]; });
  const removeMetric = (id: string, metric: string) => setItems((current) => current.filter((item) => !(item.designPointId === id && item.metric === metric)));
  const effective = useMemo(() => items.filter((item) => item.result === "有效提升").length, [items]);
  const persist = () => { if (!solution) return; saveRetrospective({ projectId: solution.projectId, projectName: solution.projectName, launchedAt, summary, items, savedAt: new Date().toISOString() }); setSaved(true); window.setTimeout(() => setSaved(false), 1800); };

  return <main className="research-page solution-workflow"><DashboardSidebar projectActive /><section className="research-main"><ProjectTopbar section="上线复盘" demo="可编辑" /><div className="solution-content retrospective-content">
    <StageProgress steps={["指标验证", "复盘结论"]} active={1} />
    <header className="solution-hero"><p>POST-LAUNCH VALIDATION</p><h1>用上线数据验证设计判断是否成立。</h1><span>按设计点记录基线、目标和实际结果，区分“没有提升”与“暂时无法归因”。</span></header>
    {!solution ? <section className="workflow-empty"><span><NightingaleIcon name="arrowUpRight" size={24} /></span><h2>复盘需要一个已导入的方案</h2><p>先建立设计点与预期指标，才能在上线后逐项验证。</p><button type="button" onClick={() => { window.location.href = "/projects/import"; }}>先导入方案</button></section> : <>
      <section className="review-summary retrospective-summary"><div><small>复盘对象</small><strong>{solution.solutionName}</strong><span>{solution.version} · {solution.projectName}</span></div><label>上线日期<input type="date" value={launchedAt} onChange={(e) => setLaunchedAt(e.target.value)} /></label><div><small>已验证有效</small><strong>{effective} / {items.length}</strong><span>设计点</span></div></section>
      <section className="workflow-section">
        <div className="workflow-heading"><div><small>VALIDATION</small><h2>指标验证</h2></div><span>结论应基于同一口径与观察周期</span></div>
        <div className="validation-list">{solution.designPoints.map((point, index) => {
          const pointItems = items.filter((item) => item.designPointId === point.id);
          return <article key={point.id}>
            <div className="validation-title"><i>{String(index + 1).padStart(2, "0")}</i><div><h3>{point.title}</h3><p>{point.strategy || "未绑定研究策略"}</p></div></div>
            <div className="point-metrics">{pointItems.map((item) => {
              const used = pointItems.filter((other) => other.metric !== item.metric).map((other) => other.metric);
              const available = metricOptions.filter((metric) => !used.includes(metric));
              const options = available.includes(item.metric) ? available : [item.metric, ...available];
              return <section key={item.metric} className="metric-validation">
                <header><label>指标<select value={item.metric} onChange={(e) => changeMetric(point.id, item.metric, e.target.value)}>{options.map((metric) => <option key={metric}>{metric}</option>)}</select></label><button className="remove-metric" type="button" onClick={() => removeMetric(point.id, item.metric)}>移除</button></header>
                <div className="metric-grid"><label>上线前基线<input value={item.baseline} onChange={(e) => update(point.id, item.metric, "baseline", e.target.value)} placeholder="如 18.4%" /></label><label>目标值<input value={item.target} onChange={(e) => update(point.id, item.metric, "target", e.target.value)} placeholder="如 22%" /></label><label>实际上线值<input value={item.actual} onChange={(e) => update(point.id, item.metric, "actual", e.target.value)} placeholder="如 23.1%" /></label><label>观察周期<input value={item.period} onChange={(e) => update(point.id, item.metric, "period", e.target.value)} placeholder="如 14 天" /></label></div>
                <div className="validation-decision"><label>验证结论<select value={item.result} onChange={(e) => update(point.id, item.metric, "result", e.target.value)}>{results.map((result) => <option key={result}>{result}</option>)}</select></label><label>干扰因素与说明<textarea value={item.note} onChange={(e) => update(point.id, item.metric, "note", e.target.value)} placeholder="记录影响归因的因素" /></label></div>
              </section>;
            })}</div>
            <button className="add-metric" type="button" onClick={() => addMetric(point)}>＋ 添加指标</button>
          </article>;
        })}</div>
      </section>
      <section className="workflow-section conclusion-section"><div className="workflow-heading"><div><small>CONCLUSION</small><h2>复盘结论</h2></div><span>沉淀可被后续项目复用的设计认知</span></div><textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="总结哪些策略成立、哪些需要修正，以及下一版本的行动建议" /></section>
      <footer className="workflow-footer"><button className="secondary-button" type="button" onClick={() => { window.location.href = "/projects/score"; }}>查看方案评价</button><button className="primary-workflow-button" type="button" onClick={persist}>{saved ? "复盘已保存" : "保存复盘"}</button></footer>
    </>}
  </div></section></main>;
}

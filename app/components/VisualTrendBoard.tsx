"use client";

import { useEffect, useMemo, useState } from "react";
import PlatformLogo from "./PlatformLogo";
import { normalizeDesignField, researchProfiles } from "../lib/researchProfiles";

type VisualSample = {
  id: string;
  capturedAt?: string;
  platform: "behance" | "pinterest" | "huaban" | "dribbble" | "zcool";
  projectTitle: string;
  projectUrl: string;
  imageUrl?: string;
  author?: string;
  publishedAt?: string;
  trendLabel: string;
  visualFeatures: string[];
  engagement: number;
  authorityTags: string[];
  gameFit: number;
  visualQuality: number;
  analysisReason?: string;
  selectionReason?: string;
  referenceType?: "inspiration" | "execution";
  relevanceScore?: number;
  screenshotKey?: string;
};

type SourceProgress = Record<string, { browsed?: number; reviewed?: number; eligible?: number; saved?: number }>;
type SelectedTrend = { label?: string; searchTerm?: string; sourceNames?: string[]; rationale?: string };

const authorityReports = [
  { name: "Pinterest Predicts", role: "每次任务重新读取官方趋势入口", url: "https://business.pinterest.com/pinterest-predicts/" },
  { name: "Canva Design Trends", role: "每次任务重新读取官方趋势入口", url: "https://www.canva.com/design-trends/" },
  { name: "Adobe Creative Trends", role: "每次任务重新读取官方趋势入口", url: "https://business.adobe.com/resources/creative-trends-report.html" },
];

const monthsAgo = (date: Date, months: number) => new Date(date.getFullYear(), date.getMonth() - months, date.getDate());
const uniqueCount = (values: string[]) => new Set(values.filter(Boolean)).size;

function trendStats(label: string, samples: VisualSample[], selectedReason = "") {
  const items = samples.filter((item) => item.trendLabel.trim().toLowerCase() === label.toLowerCase());
  const now = new Date();
  const dated = items.filter((item) => item.publishedAt && !Number.isNaN(new Date(item.publishedAt).getTime()));
  const recent12 = dated.filter((item) => new Date(item.publishedAt!) >= monthsAgo(now, 12)).length;
  const projects = uniqueCount(items.map((item) => item.projectUrl));
  const authors = uniqueCount(items.map((item) => item.author || ""));
  const behance = items.filter((item) => item.platform === "behance").length;
  const pinterest = items.filter((item) => item.platform === "pinterest").length;
  const recentRatio = dated.length ? recent12 / dated.length : 0;
  const heatPercentiles = items.filter((item) => item.engagement > 0).map((item) => {
    const peers = samples.filter((sample) => sample.platform === item.platform && sample.engagement > 0)
      .sort((a, b) => a.engagement - b.engagement);
    const rank = peers.findIndex((peer) => peer.id === item.id);
    return peers.length <= 1 ? 1 : rank / (peers.length - 1);
  });
  const publicHeat = heatPercentiles.length
    ? heatPercentiles.reduce((sum, percentile) => sum + percentile, 0) / heatPercentiles.length
    : 0;
  const reports = [...new Set(items.flatMap((item) => item.authorityTags || []))];
  const selectionReason = selectedReason || items.find((item) => item.selectionReason?.trim())?.selectionReason?.trim() || "";
  const averageGameFit = items.length
    ? items.reduce((sum, item) => sum + Number(item.gameFit || 0), 0) / items.length : 0;
  return {
    label, items, projects, authors, behance, pinterest,
    recentRatio, reports, selectionReason, averageGameFit, publicHeat,
    topFeatures: [...new Set(items.flatMap((item) => item.visualFeatures))].slice(0, 6),
  };
}

export default function VisualTrendBoard() {
  const [taskId, setTaskId] = useState("");
  const [samples, setSamples] = useState<VisualSample[]>([]);
  const [taskStatus, setTaskStatus] = useState("");
  const [sourceProgress, setSourceProgress] = useState<SourceProgress>({});
  const [selectedTrends, setSelectedTrends] = useState<SelectedTrend[]>([]);
  const [starting, setStarting] = useState(false);
  const [designField, setDesignField] = useState<"interaction" | "brand" | "marketing">("interaction");

  useEffect(() => {
    const id = window.localStorage.getItem("design-lab-active-research-task") || "";
    try { setDesignField(normalizeDesignField(JSON.parse(window.localStorage.getItem("design-lab-project-draft") || "{}").designType)); } catch { /* keep default */ }
    queueMicrotask(() => setTaskId(id));
    if (!id) return;
    let stopped = false;
    const load = async () => {
      const [sampleResponse, taskResponse] = await Promise.all([
        fetch(`/api/research/tasks/${id}/visual-samples`, { cache: "no-store" }).catch(() => null),
        fetch(`/api/research/tasks/${id}`, { cache: "no-store" }).catch(() => null),
      ]);
      if (stopped) return;
      if (sampleResponse?.ok) setSamples((await sampleResponse.json()).samples || []);
      if (taskResponse?.ok) {
        const taskData = await taskResponse.json();
        setTaskStatus(taskData.task?.status || "");
        setSourceProgress(taskData.task?.activity?.sourceProgress || {});
        setSelectedTrends(taskData.task?.activity?.visualTrendQueries || []);
      }
    };
    void load();
    const timer = window.setInterval(load, 4000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, []);

  const trends = useMemo(() => {
    const selectedLabels = selectedTrends.map((trend) => trend.label?.trim() || "").filter(Boolean);
    const labels = [...new Set([...selectedLabels, ...samples.map((item) => item.trendLabel.trim()).filter(Boolean)])].slice(0, 4);
    return labels.map((label) => trendStats(
      label,
      samples,
      selectedTrends.find((trend) => trend.label?.trim() === label)?.rationale?.trim() || "",
    ));
  }, [samples, selectedTrends]);
  const visualPlatforms = researchProfiles[designField].referenceSources.map((name) => ({
    name,
    id: name === "花瓣" ? "huaban" : name.toLowerCase(),
  })) as Array<{ name: string; id: VisualSample["platform"] }>;

  const startResearch = async () => {
    if (!taskId || starting) return;
    setStarting(true);
    const response = await fetch(`/api/research/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "queued", activity: { executionRequested: true, executionRequestedAt: new Date().toISOString() } }),
    }).catch(() => null);
    if (response?.ok) setTaskStatus("queued");
    setStarting(false);
  };

  const running = ["queued", "running"].includes(taskStatus);
  return (
    <section className="visual-trends">
      <header className="visual-trends-heading">
        <div><small>VISUAL TREND RESEARCH</small><h2>{designField === "brand" ? "数字品牌视觉方向" : designField === "marketing" ? "大促视觉方向" : "互动游戏视觉趋势"}</h2><p>每次选择 4 个方向；每个平台完成 40 个详情页后，择优保留每方向 10 张参考图。</p></div>
        <span>地区不限</span>
      </header>

      <div className="visual-source-status">
        {visualPlatforms.map((platform) => <article className={`${platform.id}-source`} key={platform.id}><PlatformLogo platform={platform.id} /><div><strong>{platform.name}</strong><span>已评估 {sourceProgress[platform.id]?.reviewed || 0}/40 个详情页</span></div><b>{samples.filter((item) => item.platform === platform.id).length} 入选</b></article>)}
        <button type="button" disabled={running || starting || !taskId} onClick={() => void startResearch()}>
          {running ? "正在自动采集…" : samples.length ? "重新采集趋势" : "开始采集趋势"}
        </button>
      </div>

      <div className="visual-authorities">
        <div><strong>宏观趋势证据</strong><span>每次研究重新读取；报告只产生候选方向</span></div>
        {authorityReports.map((report) => <a key={report.name} href={report.url} target="_blank" rel="noreferrer"><b>{report.name}</b><span>{report.role}</span></a>)}
      </div>

      {trends.length ? <div className="visual-trend-list">{trends.map((trend) => (
        <article key={trend.label} className="signal">
          <header><div><span>视觉方向</span><h3>{trend.label}</h3></div></header>
          {trend.selectionReason && <p className="trend-selection-reason"><b>选择原因</b>{trend.selectionReason}</p>}
          <p className="trend-report-line">趋势依据：{trend.reports.join(" · ") || "视觉案例交叉归纳"}</p>
          <div className="trend-reference-groups">{(["inspiration", "execution"] as const).map((type) => {
            const typed = trend.items.filter((item) => (item.referenceType || "inspiration") === type)
              .sort((a, b) => Number(b.relevanceScore || 0) - Number(a.relevanceScore || 0)).slice(0, 5);
            return <section key={type}><h4>{type === "inspiration" ? "灵感参考" : "执行参考"}<span>{type === "inspiration" ? "色彩、材质、构图与形态" : "同类界面、品牌与数字体验"}</span></h4><div className="trend-samples">{typed.map((sample) => <figure key={sample.id}>
              {sample.imageUrl || sample.screenshotKey ? <img src={`/api/research/tasks/${taskId}/visual-samples/${sample.id}/image`} alt={sample.projectTitle} /> : <div />}
              <figcaption><a href={sample.projectUrl} target="_blank" rel="noreferrer">{sample.projectTitle}</a><PlatformLogo platform={sample.platform} /><time>{sample.publishedAt ? sample.publishedAt.slice(0, 10) : "时间未公开"}</time></figcaption>
            </figure>)}</div></section>;
          })}</div>
        </article>
      ))}</div> : <div className="visual-trends-empty"><strong>{running ? "正在采集视觉样本" : "还没有视觉趋势结果"}</strong><span>{running ? `Worker 会同步进入 ${visualPlatforms.map((item) => item.name).join("、")} 详情页。` : "完成研究并确认4个方向后，系统会开始收集参考图。"}</span></div>}
    </section>
  );
}

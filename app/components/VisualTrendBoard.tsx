"use client";

import { useEffect, useMemo, useState } from "react";
import PlatformLogo from "./PlatformLogo";
import { normalizeDesignField, researchProfiles } from "../lib/researchProfiles";
import { downloadVisualMoodboard } from "../lib/exportVisualMoodboard";

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

type SelectedTrend = { label?: string; searchTerm?: string; sourceNames?: string[]; rationale?: string };

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

export default function VisualTrendBoard({ onSave }: { onSave?: () => void }) {
  const [taskId, setTaskId] = useState("");
  const [samples, setSamples] = useState<VisualSample[]>([]);
  const [taskStatus, setTaskStatus] = useState("");
  const [activity, setActivity] = useState<Record<string, unknown>>({});
  const [selectedTrends, setSelectedTrends] = useState<SelectedTrend[]>([]);
  const [designField, setDesignField] = useState<"interaction" | "brand" | "marketing">("interaction");
  const [actionBusy, setActionBusy] = useState<"recollect" | "export" | "">("");
  const [notice, setNotice] = useState("");

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
        setActivity(taskData.task?.activity || {});
        setSelectedTrends(taskData.task?.activity?.visualTrendQueries || []);
      }
    };
    void load();
    const timer = window.setInterval(load, 4000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, []);

  const trends = useMemo(() => {
    const selectedLabels = selectedTrends.map((trend) => trend.label?.trim() || "").filter(Boolean);
    const labels = selectedLabels.length
      ? [...new Set(selectedLabels)]
      : [...new Set(samples.map((item) => item.trendLabel.trim()).filter(Boolean))].slice(0, 4);
    return labels.map((label) => trendStats(
      label,
      samples,
      selectedTrends.find((trend) => trend.label?.trim() === label)?.rationale?.trim() || "",
    ));
  }, [samples, selectedTrends]);
  const visualPlatforms = researchProfiles[designField].referenceSources.map((name) => ({
    name,
    id: name.toLowerCase(),
  })) as Array<{ name: string; id: VisualSample["platform"] }>;

  const running = ["queued", "running"].includes(taskStatus);
  const recollect = async () => {
    if (!taskId || running || actionBusy) return;
    setActionBusy("recollect");
    setNotice("");
    const response = await fetch(`/api/research/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "queued", activity: { ...activity, executionRequested: true, executionRequestedAt: new Date().toISOString(), phase: "visual_reference_queued", message: "已请求重新采集视觉参考" } }),
    }).catch(() => null);
    if (response?.ok) setTaskStatus("queued");
    else setNotice("重新采集未能启动，请稍后重试。");
    setActionBusy("");
  };
  const exportHtml = async () => {
    if (!samples.length || !taskId || actionBusy) return;
    setActionBusy("export");
    setNotice("");
    try {
      const projectName = (() => {
        try {
          const projectId = window.localStorage.getItem("design-lab-current-project-id");
          const projects = JSON.parse(window.localStorage.getItem("design-lab-saved-projects") || "[]");
          const savedName = Array.isArray(projects) ? projects.find((project) => project.id === projectId)?.name : "";
          const draftName = JSON.parse(window.localStorage.getItem("design-lab-project-draft") || "{}").projectName;
          return String(savedName || draftName || "未命名项目").trim();
        } catch { return "未命名项目"; }
      })();
      const result = await downloadVisualMoodboard(projectName, trends.map((trend) => ({
        title: trend.label,
        samples: trend.items.map((sample) => ({ ...sample, taskId })),
      })));
      setNotice(result.unavailableImages ? `HTML 已导出；${result.unavailableImages} 张图片暂时无法读取，已保留文字和来源链接。` : "HTML 文件已导出。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "HTML 导出失败，请稍后重试。");
    } finally { setActionBusy(""); }
  };
  return (
    <section className="visual-trends">
      <header className="visual-trends-heading">
        <div><small>VISUAL TREND RESEARCH</small><h2>{designField === "brand" ? "数字品牌视觉方向" : designField === "marketing" ? "大促视觉方向" : "互动游戏视觉趋势"}</h2></div>
      </header>

      {trends.length ? <div className="visual-trend-list">{trends.map((trend, index) => (
        <article key={trend.label} className="signal">
          <header><div><span>视觉方向 {String(index + 1).padStart(2, "0")}</span><h3>{trend.label}</h3></div></header>
          <div className="trend-reference-gallery"><h4>视觉参考</h4><div className="trend-samples">{trend.items
            .slice().sort((a, b) => Number(b.relevanceScore || 0) - Number(a.relevanceScore || 0)).slice(0, 10).map((sample) => <figure key={sample.id}>
              <div className={`trend-sample-image ${sample.imageUrl || sample.screenshotKey ? "" : "unavailable"}`}>{sample.imageUrl || sample.screenshotKey ? <img src={`/api/research/tasks/${taskId}/visual-samples/${encodeURIComponent(sample.id)}/image`} alt={sample.projectTitle} onError={(event) => { event.currentTarget.style.display = "none"; event.currentTarget.parentElement?.classList.add("unavailable"); }} /> : null}<span>预览暂不可用</span></div>
              <figcaption><a href={sample.projectUrl} target="_blank" rel="noreferrer">{sample.projectTitle}</a><PlatformLogo platform={sample.platform} /><time>{sample.publishedAt ? sample.publishedAt.slice(0, 10) : "时间未公开"}</time></figcaption>
            </figure>)}</div></div>
        </article>
      ))}</div> : <div className="visual-trends-empty"><strong>{running ? "正在采集视觉样本" : "还没有视觉趋势结果"}</strong><span>{running ? `Worker 会同步进入 ${visualPlatforms.map((item) => item.name).join("、")} 详情页。` : "完成研究并确认4个方向后，系统会开始收集参考图。"}</span></div>}
      {notice && <p className="visual-trend-notice" role="status">{notice}</p>}
      <footer className="visual-trend-actions">
        <button type="button" className="project-overview-action project-overview-action-secondary" disabled={!taskId || running || Boolean(actionBusy)} onClick={() => void recollect()}>{actionBusy === "recollect" ? "正在重新采集…" : "重新采集"}</button>
        <button type="button" className="project-overview-action project-overview-action-secondary" disabled={!taskId || Boolean(actionBusy)} onClick={onSave}>保存</button>
        <button type="button" className="project-overview-action project-overview-action-primary" disabled={!samples.length || Boolean(actionBusy)} onClick={() => void exportHtml()}>{actionBusy === "export" ? "正在导出…" : "导出 HTML"}</button>
      </footer>
    </section>
  );
}

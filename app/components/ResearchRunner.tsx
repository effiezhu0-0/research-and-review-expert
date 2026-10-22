"use client";

import { useEffect, useMemo, useState } from "react";
import {
  downloadResearchTask,
  ensureResearchTask,
  ResearchTask,
} from "../lib/localResearchStore";
import PlatformLogo from "./PlatformLogo";
import { normalizeDesignField, researchProfiles } from "../lib/researchProfiles";

type TaskState = "queued" | "running" | "awaiting_visual_confirmation" | "completed" | "failed" | "needs_login" | "local";
type ResearchActivity = {
  phase?: string;
  currentQuery?: string;
  queryIndex?: number;
  queryTotal?: number;
  browsedCount?: number;
  matchedCount?: number;
  detailCount?: number;
  agentRecoveryCalls?: number;
  agentSummaryCalls?: number;
  visualSampleCount?: number;
  visualSourceCounts?: Record<string, number>;
  degraded?: boolean;
  degradationReason?: string;
  visualOnly?: boolean;
  visualDirections?: Array<{ label: string; sourceNames?: string[]; rationale?: string; sampleIds?: string[] }>;
  visualDirectionsConfirmed?: boolean;
  visualPlatforms?: string[];
  sourceProgress?: Record<string, {
    phase?: string;
    progress?: number;
    queryIndex?: number;
    queryTotal?: number;
    browsed?: number;
    reviewed?: number;
    eligible?: number;
    saved?: number;
    currentTitle?: string;
    error?: string;
  }>;
  message?: string;
  updatedAt?: string;
};

const sourceCopy = [
  { id: "xiaohongshu", platform: "xiaohongshu" as const, name: "玩法案例", detail: "进入小红书帖子，采集玩法与真实反馈" },
  { id: "xiaohongshuVisual", platform: "xiaohongshu" as const, name: "竞品视觉", detail: "识别主要竞品并逐个采集视觉案例" },
  { id: "officialTrends", name: "趋势对照", detail: "读取官方趋势并与竞品视觉特征交叉比较" },
];
const referenceSourceCopy = [
  { id: "behance", platform: "behance" as const, name: "Behance", detail: "逐条进入项目详情，分析完整视觉系统" },
  { id: "pinterest", platform: "pinterest" as const, name: "Pinterest", detail: "逐条进入 Pin 详情，采集视觉参考" },
  { id: "huaban", platform: "huaban" as const, name: "花瓣", detail: "逐条进入采集详情，补充中文视觉参考" },
  { id: "dribbble", platform: "dribbble" as const, name: "Dribbble", detail: "进入 Shot 详情，研究界面与动效表达" },
  { id: "zcool", platform: "zcool" as const, name: "ZCOOL", detail: "进入作品详情，补充中文市场执行案例" },
];

export default function ResearchRunner({ onComplete, candidateSelectionCount = 0, onConfirmDirections, onStatusChange }: {
  onComplete: () => void;
  candidateSelectionCount?: number;
  onConfirmDirections?: () => Promise<void> | void;
  onStatusChange?: (status: TaskState) => void;
}) {
  const [taskId, setTaskId] = useState("");
  const [status, setStatus] = useState<TaskState>("queued");
  const [error, setError] = useState("");
  const [blockedSource, setBlockedSource] = useState("");
  const [actionUrl, setActionUrl] = useState("");
  const [candidateCount, setCandidateCount] = useState(0);
  const [activity, setActivity] = useState<ResearchActivity | null>(null);
  const [localTask, setLocalTask] = useState<ResearchTask | null>(null);
  const [clock, setClock] = useState(0);
  const [visualCandidates, setVisualCandidates] = useState<Array<{ id: string; title: string; url?: string; keywords?: string[]; excerpt?: string; mediaKeys?: string[]; screenshotKey?: string }>>([]);
  const [confirming, setConfirming] = useState(false);
  const [selectedDirections, setSelectedDirections] = useState<string[]>([]);
  const [designField, setDesignField] = useState<"interaction" | "brand" | "marketing">("interaction");

  useEffect(() => {
    const id = window.localStorage.getItem("design-lab-active-research-task") || "";
    try { setDesignField(normalizeDesignField(JSON.parse(window.localStorage.getItem("design-lab-project-draft") || "{}").designType)); } catch { /* keep default */ }
    queueMicrotask(() => {
      setTaskId(id);
      if (!id) {
        setLocalTask(ensureResearchTask());
        setStatus("local");
      }
    });
  }, []);

  useEffect(() => {
    const update = () => setClock(Date.now());
    const initial = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 5000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!taskId) return;
    let stopped = false;
    const check = async () => {
      try {
        const response = await fetch(`/api/research/tasks/${taskId}`, { cache: "no-store" });
        if (!response.ok) throw new Error("无法读取任务状态");
        const data = await response.json();
        if (stopped) return;
        setStatus(data.task.status);
        onStatusChange?.(data.task.status);
        setError(data.task.error || "");
        setBlockedSource(data.task.blockedSource || "");
        setActionUrl(data.task.actionUrl || "");
        setCandidateCount(data.candidateCount || 0);
        setActivity(data.task.activity || null);
        if (data.task.status === "awaiting_visual_confirmation") {
          const candidates = await fetch(`/api/research/tasks/${taskId}/candidates`, { cache: "no-store" }).then((result) => result.json()).catch(() => ({ candidates: [] }));
          if (!stopped) setVisualCandidates((candidates.candidates || []).filter((item: { source?: string }) => item.source === "xiaohongshu_visual"));
        }
        if (data.task.status === "completed") {
          window.sessionStorage.removeItem("design-lab-start-research");
          window.setTimeout(onComplete, 650);
        }
      } catch {
        if (!stopped) setError("研究服务连接中断，正在重试");
      }
    };
    check();
    const timer = window.setInterval(check, 2500);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [taskId, onComplete, onStatusChange]);

  useEffect(() => {
    if (status !== "awaiting_visual_confirmation" || !activity?.visualDirections?.length) return;
    setSelectedDirections(activity.visualDirections.slice(0, 4).map((direction) => direction.label));
  }, [status, activity?.visualDirections]);

  const referenceStage = Boolean(activity?.visualDirectionsConfirmed);
  const fieldResearchName = designField === "brand" ? "数字品牌案例与反馈" : designField === "marketing" ? "大促案例与反馈" : "小红书玩法案例";
  const runningHeadline = referenceStage ? `${researchProfiles[designField].referenceSources.length}个视觉平台正在同步研究`
    : activity?.phase === "xhs_competitor_discovery" ? "正在识别主要竞品"
      : activity?.phase === "xhs_visual_searching" ? "竞品视觉案例研究中"
      : activity?.phase === "official_trend_reading" ? "视觉趋势交叉分析中"
        : `${fieldResearchName}研究中`;
  const headline = status === "queued" ? (referenceStage ? "视觉参考收集正在排队" : `${fieldResearchName}研究正在排队`)
    : status === "running" ? runningHeadline
      : status === "awaiting_visual_confirmation" ? "确认4个视觉方向"
      : status === "completed" ? `已找到 ${candidateCount} 个候选案例`
        : status === "needs_login" ? "小红书搜索需要安全验证"
          : status === "failed" ? "研究任务执行失败"
            : "本地研究任务已准备";
  const progress = useMemo(() => {
    if (status === "completed") return 100;
    if (status === "awaiting_visual_confirmation") return 100;
    if (status !== "running" || !activity?.sourceProgress) return 0;
    const sources = Object.values(activity.sourceProgress).filter((source) => source.phase !== "skipped");
    if (!sources.length) return 0;
    return Math.min(99, Math.round(sources.reduce((sum, source) => sum + Number(source.progress || 0), 0) / sources.length));
  }, [status, activity]);
  const sourceLabel = blockedSource === "xiaohongshu" ? "小红书" : "小红书";
  const heartbeatAge = activity?.updatedAt ? clock - new Date(activity.updatedAt).getTime() : 0;
  const slow = status === "running" && heartbeatAge > 45000;
  const profileSources = researchProfiles[designField].researchSources.map((name, index) => ({ id: `profile-${index}`, name, detail: designField === "brand" ? "按数字载体保留完整来源证据" : "按会场与开屏边界保留完整来源证据" }));
  const referenceIds = designField === "interaction" ? ["behance", "pinterest", "zcool"] : ["pinterest", "behance", "zcool"];
  const visibleSources = activity?.visualDirectionsConfirmed ? referenceSourceCopy.filter((source) => referenceIds.includes(source.id)) : designField === "interaction" ? sourceCopy : profileSources;

  const resumeResearch = async () => {
    if (!taskId) return;
    const response = await fetch(`/api/research/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "queued", activity: { ...activity, executionRequested: true, executionRequestedAt: new Date().toISOString() } }),
    });
    if (response.ok) {
      setStatus("queued");
      setError("");
      setBlockedSource("");
      setActionUrl("");
    }
  };

  const confirmVisualDirections = async () => {
    if (!taskId || confirming || selectedDirections.length !== 4 || !candidateSelectionCount) return;
    setConfirming(true);
    const chosenDirections = (activity?.visualDirections || []).filter((direction) => selectedDirections.includes(direction.label));
    const response = await fetch(`/api/research/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: "awaiting_visual_confirmation",
        activity: { ...activity, visualDirections: chosenDirections, visualDirectionsConfirmed: true, phase: "visual_reference_pending", message: "案例与视觉方向已确认" },
      }),
    }).catch(() => null);
    if (response?.ok) await onConfirmDirections?.();
    setConfirming(false);
  };

  return (
    <section className={`research-runner status-${status}`}>
      <div className="runner-heading">
        <div><h1>{headline}</h1></div>
        <strong>{progress}%</strong>
      </div>
      <div className="runner-progress"><i style={{ width: `${progress}%` }} /></div>
      {status === "running" && (
        <div className={`runner-activity ${slow ? "slow" : ""}`} role="status">
          <strong>{slow ? "部分页面响应较慢，Agent正在自动恢复" : runningHeadline}</strong>
          <span>
            {referenceStage ? `${researchProfiles[designField].referenceSources.length}个视觉平台同步进入详情页研究` : designField === "interaction" ? "先收集玩法反馈，再识别竞品并研究其视觉案例" : "先收集标准、案例与反馈，再归纳候选视觉方向"}
            <b>·</b> 玩法案例 {activity?.detailCount || candidateCount} 条
            <b>·</b> 视觉样本 {activity?.visualSampleCount || 0} 条
            {(activity?.agentRecoveryCalls || 0) > 0 && <><b>·</b> Agent协助 {activity?.agentRecoveryCalls} 次</>}
            {(activity?.agentSummaryCalls || 0) > 0 && <><b>·</b> 内容提炼 {activity?.agentSummaryCalls} 次</>}
          </span>
          <em>搜索、进入详情、分析与保存均计入当前阶段进度</em>
        </div>
      )}
      <div className="runner-sources">
        {visibleSources.map((source) => (
          <article className={`source-${source.id} ${activity?.sourceProgress?.[source.id]?.phase && !["queued", "completed", "skipped"].includes(activity.sourceProgress[source.id].phase || "") ? "active" : ""}`} key={source.name}>
            <div className="runner-source-copy"><strong>{"platform" in source && source.platform && <PlatformLogo platform={source.platform} />} {source.name}</strong><small>{source.detail}</small></div>
            <span>{source.id.startsWith("profile-") ? (status === "completed" || status === "awaiting_visual_confirmation" ? "已完成" : "研究中") : source.id === "officialTrends"
              ? (activity?.sourceProgress?.[source.id]?.phase === "completed" ? "已完成" : "研究中")
              : referenceIds.includes(source.id)
                ? `已浏览详情 ${activity?.sourceProgress?.[source.id]?.reviewed || 0}/40 · ${status === "completed" ? "入选" : "有效候选"} ${status === "completed" ? activity?.sourceProgress?.[source.id]?.saved || 0 : activity?.sourceProgress?.[source.id]?.eligible || 0}`
                : `案例 ${activity?.sourceProgress?.[source.id]?.saved || 0} 条`}</span>
          </article>
        ))}
      </div>
      {status === "awaiting_visual_confirmation" && (
        <section className="visual-direction-confirmation">
          <header><div><small>VISUAL DIRECTIONS</small><h2>竞品视觉特征 × 官方趋势</h2></div><span>确认后才生成搜索词</span></header>
          <div className="visual-direction-grid">
            {(activity?.visualDirections || []).map((direction) => {
              const examples = visualCandidates.filter((item) => direction.sampleIds?.includes(item.id));
              const isSelected = selectedDirections.includes(direction.label);
              return <article className={isSelected ? "selected" : ""} key={direction.label} onClick={() => setSelectedDirections((current) => isSelected ? current.filter((label) => label !== direction.label) : [...current, direction.label])}>
                <h3>{direction.label}</h3>
                <p>{direction.rationale}</p>
                <div className="visual-direction-examples">{examples.map((item) => (
                  <a key={item.id} href={item.url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.mediaKeys?.length ? `/api/research/tasks/${taskId}/candidates/${item.id}/media/0` : `/api/research/tasks/${taskId}/candidates/${item.id}/screenshot`} alt={item.title} />
                    <span>{item.title}</span>
                  </a>
                ))}</div>
              </article>;
            })}
          </div>
          <button className="primary" type="button" disabled={confirming || selectedDirections.length !== 4 || !candidateSelectionCount} onClick={() => void confirmVisualDirections()}>{confirming ? "正在进入下一步…" : `确认 ${candidateSelectionCount} 个案例与 4 个视觉方向`}</button>
        </section>
      )}
      {status === "needs_login" && (
        <div className="runner-action-panel login">
          <div><strong>请完成{sourceLabel}安全验证</strong><span>任务已经暂停，不会在后台继续请求。若验证页提示“请求太频繁”，请不要刷新，先等待至少 10 分钟，再从小红书首页确认登录状态。</span></div>
          <div>
            <button type="button" onClick={() => window.open("https://www.xiaohongshu.com/", "_blank", "noopener,noreferrer")}>打开小红书首页</button>
            {actionUrl && <a href={actionUrl} target="_blank" rel="noreferrer">稍后打开验证页</a>}
            <button className="primary" type="button" onClick={resumeResearch}>已完成验证，继续研究</button>
          </div>
        </div>
      )}
      {status === "failed" && (
        <div className="runner-action-panel error">
          <div><strong>研究服务暂时中断</strong><span>{error || "请确认研究服务正在运行后重试。"}</span></div>
          <button className="primary" type="button" onClick={resumeResearch}>重新研究</button>
        </div>
      )}
      <footer>
        <span>{status === "local" ? "研究服务尚未连接。" : status === "queued" || status === "running" ? "你可以先离开，研究完成后再回来查看结果。" : ""}</span>
        <div>
          {localTask && <button type="button" onClick={() => downloadResearchTask(localTask)}>下载本地任务</button>}
          {(status === "failed" || status === "needs_login" || status === "local") && <button type="button" onClick={onComplete}>先查看案例页</button>}
        </div>
      </footer>
    </section>
  );
}

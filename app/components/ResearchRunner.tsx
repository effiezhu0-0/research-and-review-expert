"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  downloadResearchTask,
  ensureResearchTask,
  ResearchTask,
} from "../lib/localResearchStore";
import PlatformLogo from "./PlatformLogo";
import { normalizeDesignField, researchProfiles } from "../lib/researchProfiles";

type TaskState = "queued" | "running" | "awaiting_competitor_confirmation" | "awaiting_visual_confirmation" | "completed" | "failed" | "needs_login" | "local";
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
  officialTrendSources?: Array<{ name: string; url?: string }>;
  degraded?: boolean;
  degradationReason?: string;
  visualOnly?: boolean;
  visualDirections?: Array<{ label: string; sourceNames?: string[]; rationale?: string; sampleIds?: string[] }>;
  visualCompetitors?: Array<{ name: string; reason?: string; source?: string }>;
  visualCompetitorsConfirmed?: boolean;
  visualCompetitorPanelText?: string;
  visualCompetitorExtractionNeedsReview?: boolean;
  visualCompetitorPanelScreenshotCount?: number;
  visualDirectionsConfirmed?: boolean;
  visualPlatforms?: string[];
  sourceProgress?: Record<string, {
    phase?: string;
    progress?: number;
    queryIndex?: number;
    queryTotal?: number;
    browsed?: number;
    reviewed?: number;
    opened?: number;
    eligible?: number;
    saved?: number;
    skipped?: Record<string, number>;
    currentTitle?: string;
    error?: string;
  }>;
  message?: string;
  loginRequiredPlatforms?: string[];
  ignoredPlatforms?: string[];
  selectedFeedbackPlatforms?: string[];
  updatedAt?: string;
};

const sourceCopy = [
  { id: "xiaohongshu", platform: "xiaohongshu" as const, name: "小红书", detail: "采集玩法案例与用户反馈" },
  { id: "weibo", platform: "weibo" as const, name: "微博", detail: "采集相关讨论与真实反馈" },
  { id: "voiceOfUser", platform: "voiceOfUser" as const, name: "用户之声", detail: "采集用户问题与体验反馈" },
  { id: "xiaohongshuVisual", platform: "xiaohongshu" as const, name: "竞品视觉", detail: "识别主要竞品并逐个采集视觉案例" },
  { id: "officialTrends", name: "趋势对照", detail: "读取官方趋势并与竞品视觉特征交叉比较" },
];
const referenceSourceCopy = [
  { id: "behance", platform: "behance" as const, name: "Behance", detail: "逐条进入项目详情，分析完整视觉系统" },
  { id: "pinterest", platform: "pinterest" as const, name: "Pinterest", detail: "逐条进入 Pin 详情，采集视觉参考" },
];

const skipReasonLabels: Record<string, string> = {
  duplicate_in_run: "本轮重复结果",
  missing_post_url: "结果缺少帖子链接",
  detail_feedback_id_not_found: "未能打开用户之声详情",
  feedback_id_missing_after_card_click: "详情地址没有 feedbackId",
  voice_detail_content_not_matched: "详情内容与结果卡片不匹配",
  detail_text_empty_or_login: "详情为空或需要登录",
  weibo_ambiguous_post_match: "微博正文匹配不唯一",
  weibo_post_text_not_found: "未找到对应微博正文",
  joy_trip_keyword_not_found: "内容没有项目关键词",
  post_date_missing_or_out_of_range: "日期缺失或超出范围",
  screenshot_failed: "截图失败",
  voice_permalink_missing: "用户之声详情链接无效",
  duplicate_in_database: "与已有案例重复",
  save_request_rejected: "案例保存失败",
};

const referenceFlow = [
  { phase: "generating_visual_terms", label: "生成检索词" },
  { phase: "visual_searching", label: "采集详情页" },
  { phase: "visual_analysis", label: "分析与筛选" },
  { phase: "completed", label: "保存参考图" },
];

export default function ResearchRunner({ onComplete, candidateSelectionCount = 0, onConfirmDirections, onStatusChange }: {
  onComplete: () => void;
  candidateSelectionCount?: number;
  onConfirmDirections?: () => Promise<void> | void;
  onStatusChange?: (status: TaskState) => void;
}) {
  const [taskId, setTaskId] = useState("");
  const [status, setStatus] = useState<TaskState>("queued");
  const previousStatus = useRef<TaskState>("queued");
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
  const initializedDirectionLabels = useRef("");
  const [selectedCompetitors, setSelectedCompetitors] = useState<string[]>([]);
  const [customCompetitors, setCustomCompetitors] = useState<string[]>([]);
  const [customCompetitor, setCustomCompetitor] = useState("");
  const [confirmingCompetitors, setConfirmingCompetitors] = useState(false);
  const [retryingCompetitorSearch, setRetryingCompetitorSearch] = useState(false);
  const [activeCompetitorScreenshot, setActiveCompetitorScreenshot] = useState<number | null>(null);
  const [designField, setDesignField] = useState<"interaction" | "brand" | "marketing">("interaction");
  const [researchMode, setResearchMode] = useState<"play" | "visual">("play");

  useEffect(() => {
    if (activeCompetitorScreenshot === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveCompetitorScreenshot(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeCompetitorScreenshot]);

  useEffect(() => {
    const id = window.localStorage.getItem("design-lab-active-research-task") || "";
    try {
      const draft = JSON.parse(window.localStorage.getItem("design-lab-project-draft") || "{}");
      setDesignField(normalizeDesignField(draft.designType));
      setResearchMode(draft.researchMode === "visual" ? "visual" : "play");
    } catch { /* keep default */ }
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
        if (data.task.status === "awaiting_competitor_confirmation" && previousStatus.current !== "awaiting_competitor_confirmation") {
          setSelectedCompetitors((data.task.activity?.visualCompetitors || []).map((item: { name: string }) => item.name));
        }
        previousStatus.current = data.task.status;
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

  const directionLabels = (activity?.visualDirections || []).map((direction) => direction.label);
  const directionSignature = directionLabels.join("\u001f");
  useEffect(() => {
    if (status !== "awaiting_visual_confirmation" || !directionSignature || initializedDirectionLabels.current === directionSignature) return;
    initializedDirectionLabels.current = directionSignature;
    setSelectedDirections(directionSignature.split("\u001f").slice(0, 4));
  }, [status, directionSignature]);

  const referenceStage = Boolean(activity?.visualDirectionsConfirmed);
  const visualOnly = Boolean(activity?.visualOnly) || researchMode === "visual";
  const fieldResearchName = visualOnly ? "竞品视觉与趋势" : designField === "brand" ? "数字品牌案例与反馈" : designField === "marketing" ? "大促案例与反馈" : "玩法案例与用户反馈调研";
  const runningHeadline = referenceStage ? `${researchProfiles[designField].referenceSources.length}个视觉平台正在同步研究`
    : activity?.phase === "xhs_competitor_discovery" ? "正在识别主要竞品"
      : activity?.phase === "xhs_visual_searching" ? "竞品视觉案例研究中"
      : activity?.phase === "official_trend_reading" ? "视觉趋势交叉分析中"
        : designField === "interaction" && !visualOnly ? "玩法案例与用户反馈调研中" : `${fieldResearchName}中`;
  const headline = status === "queued" ? (referenceStage ? "视觉参考收集正在排队" : `${fieldResearchName}研究正在排队`)
    : status === "running" ? runningHeadline
      : status === "awaiting_competitor_confirmation" ? "已提取竞品关键词"
      : status === "awaiting_visual_confirmation" ? "确认4个视觉方向"
      : status === "completed" ? `已找到 ${candidateCount} 个候选案例`
      : status === "needs_login" ? "需要完成平台登录"
          : status === "failed" ? "研究任务执行失败"
            : "本地研究任务已准备";
  const progress = useMemo(() => {
    if (status === "completed") return 100;
    if (status === "awaiting_competitor_confirmation") return 25;
    if (status === "awaiting_visual_confirmation") return 100;
    if (status !== "running" && status !== "failed" || !activity?.sourceProgress) return 0;
    const sources = Object.values(activity.sourceProgress).filter((source) => source.phase !== "skipped");
    if (!sources.length) return 0;
    return Math.min(99, Math.round(sources.reduce((sum, source) => sum + Number(source.progress || 0), 0) / sources.length));
  }, [status, activity]);
  const sourceNames: Record<string, string> = { xiaohongshu: "小红书", weibo: "微博", voiceOfUser: "用户之声" };
  const sourceLabel = sourceNames[blockedSource] || "研究平台";
  const loginPlatforms = visualOnly ? ["小红书"] : activity?.loginRequiredPlatforms?.length ? activity.loginRequiredPlatforms : [sourceLabel];
  const heartbeatAge = activity?.updatedAt ? clock - new Date(activity.updatedAt).getTime() : 0;
  const slow = status === "running" && heartbeatAge > 45000;
  const profileSources = researchProfiles[designField].researchSources.map((name, index) => ({ id: `profile-${index}`, name, detail: designField === "brand" ? "按数字载体保留完整来源证据" : "按会场与开屏边界保留完整来源证据" }));
  const referenceIds = ["behance", "pinterest"];
  const visibleSources = activity?.visualDirectionsConfirmed ? referenceSourceCopy.filter((source) => referenceIds.includes(source.id)) : visualOnly ? sourceCopy.filter((source) => source.id !== "xiaohongshu" && source.id !== "weibo" && source.id !== "voiceOfUser") : designField === "interaction" ? sourceCopy.filter((source) => ["xiaohongshu", "weibo", "voiceOfUser"].includes(source.id) && (!activity?.selectedFeedbackPlatforms?.length || activity.selectedFeedbackPlatforms.includes(source.id))) : profileSources;
  const referenceFlowIndex = referenceFlow.findIndex((step) => step.phase === activity?.phase);
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

  const confirmCompetitors = async () => {
    if (!taskId) return;
    const names = [...new Set(selectedCompetitors.filter(Boolean))];
    if (!names.length) return;
    setConfirmingCompetitors(true);
    const response = await fetch(`/api/research/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: "queued",
        activity: {
          ...activity,
          visualCompetitors: names.map((name) => ({ name })),
          visualCompetitorsConfirmed: true,
          executionRequested: true,
          executionRequestedAt: new Date().toISOString(),
          phase: "xhs_visual_searching",
          message: "已确认竞品名称，开始逐个搜索",
        },
      }),
    }).catch(() => null);
    if (response?.ok) {
      setSelectedCompetitors(names);
      setCustomCompetitor("");
      setStatus("queued");
      setError("");
    }
    setConfirmingCompetitors(false);
  };

  const addCustomCompetitor = () => {
    const name = customCompetitor.trim();
    if (!name) return;
    const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase();
    const existing = [
      ...(activity?.visualCompetitors || []).map((competitor) => competitor.name),
      ...customCompetitors,
    ].find((candidate) => normalize(candidate) === normalize(name));
    const resolvedName = existing || name;
    if (!existing) setCustomCompetitors((current) => [...current, name]);
    setSelectedCompetitors((current) => current.includes(resolvedName) ? current : [...current, resolvedName]);
    setCustomCompetitor("");
  };

  const retryCompetitorSearch = async () => {
    if (!taskId || retryingCompetitorSearch) return;
    setRetryingCompetitorSearch(true);
    const response = await fetch(`/api/research/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: "queued",
        activity: {
          ...activity,
          visualCompetitors: [],
          visualCompetitorsConfirmed: false,
          visualCompetitorExtractionNeedsReview: false,
          visualCompetitorPanelScreenshotCount: 0,
          executionRequested: true,
          executionRequestedAt: new Date().toISOString(),
          phase: "xhs_competitor_discovery",
          message: "正在重新搜索并提取竞品关键词",
        },
      }),
    }).catch(() => null);
    if (response?.ok) {
      setSelectedCompetitors([]);
      setCustomCompetitor("");
      setStatus("queued");
      setError("");
    }
    setRetryingCompetitorSearch(false);
  };

  const ignoreBlockedPlatform = async () => {
    if (!taskId || !blockedSource) return;
    const nextActivity = {
      ...activity,
      ignoredPlatforms: [...new Set([...(activity?.ignoredPlatforms || []), blockedSource])],
      executionRequested: true,
      executionRequestedAt: new Date().toISOString(),
      loginRequiredPlatforms: [],
    };
    const response = await fetch(`/api/research/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "queued", activity: nextActivity }),
    });
    if (response.ok) {
      setActivity(nextActivity);
      setStatus("queued");
      setError("");
      setBlockedSource("");
      setActionUrl("");
    }
  };

  const confirmVisualDirections = async () => {
    if (!taskId || confirming || selectedDirections.length < 1 || (!visualOnly && !candidateSelectionCount)) return;
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
    <section className={`research-runner status-${status} ${visualOnly ? "visual-only" : ""} ${status === "awaiting_visual_confirmation" ? "visual-direction-confirmation-stage" : ""}`}>
      {status !== "awaiting_visual_confirmation" && <div className="runner-heading">
        <div><h1>{headline}</h1></div>
        <strong>{progress}%</strong>
      </div>}
      {status !== "awaiting_visual_confirmation" && <div className="runner-progress"><i style={{ width: `${progress}%` }} /></div>}
      {referenceStage && (
        <section className="reference-collection-flow" aria-label="参考图采集流程">
          <header>
            <div><small>REFERENCE COLLECTION</small><h2>参考图采集流程</h2></div>
            <span>平台访问或模型分析受限时，将保留已采集内容并标记降级原因。</span>
          </header>
          <ol>
            {referenceFlow.map((step, index) => {
              const active = status === "running" && (referenceFlowIndex === index || (referenceFlowIndex < 0 && index === 1));
              const done = status === "completed" || (referenceFlowIndex > index);
              return <li className={done ? "done" : active ? "active" : ""} key={step.phase}>
                <i>{done ? "✓" : index+1}</i><strong>{step.label}</strong>
              </li>;
            })}
          </ol>
          {activity?.degraded && <p className="reference-degradation"><b>降级交付：</b>{activity.degradationReason || "部分平台未达到目标样本量，已保留可用参考图。"}</p>}
        </section>
      )}
      {status !== "awaiting_visual_confirmation" && <div className="runner-sources">
        {visibleSources.map((source) => {
          const sourceProgress = activity?.sourceProgress?.[source.id];
          const isOfficialTrendCard = source.id === "officialTrends";
          const isPlatformCard = referenceStage || visualOnly || ["xiaohongshu", "weibo", "voiceOfUser"].includes(source.id);
          const viewed = sourceProgress?.reviewed ?? sourceProgress?.browsed ?? 0;
          const captured = status === "completed" ? sourceProgress?.saved || 0 : sourceProgress?.eligible ?? sourceProgress?.saved ?? 0;
          const skipSummary = Object.entries(sourceProgress?.skipped || {})
            .filter(([, count]) => Number(count) > 0)
            .map(([reason, count]) => `${skipReasonLabels[reason] || reason} ${count} 条`)
            .join("、");
          const sourceDiagnostic = sourceProgress
            ? `已找到 ${sourceProgress.browsed || 0} 条结果，尝试详情 ${sourceProgress.reviewed || 0} 条，成功打开 ${sourceProgress.opened || 0} 条，通过校验 ${sourceProgress.eligible || 0} 条，保存 ${sourceProgress.saved || 0} 条${skipSummary ? `。跳过原因：${skipSummary}` : ""}`
            : undefined;
          return (
            <article title={sourceDiagnostic} aria-label={sourceDiagnostic} className={`source-${source.id} ${isPlatformCard ? "platform-summary" : ""} ${sourceProgress?.phase && !["queued", "completed", "skipped"].includes(sourceProgress.phase) ? "active" : ""}`} key={source.name}>
              {isOfficialTrendCard
                ? <div className="visual-source-minimal"><span className="official-trend-logos"><PlatformLogo platform="pinterest" /><PlatformLogo platform="adobe" /><PlatformLogo platform="canva" /></span><strong>趋势分析</strong></div>
                : isPlatformCard
                  ? <div className="visual-source-minimal"><PlatformLogo platform={"platform" in source && source.platform ? source.platform : "xiaohongshu"} /><strong>{source.id === "xiaohongshuVisual" ? "视觉案例" : source.name}</strong></div>
                  : <div className="runner-source-copy"><strong>{"platform" in source && source.platform && <PlatformLogo platform={source.platform} />} {source.name}</strong><small>{source.detail}</small></div>}
              <span className="visual-source-count">{isOfficialTrendCard
                ? `案例 ${activity?.visualDirections?.length || 0} 条`
                : isPlatformCard ? `案例 ${captured} 条`
                  : sourceProgress?.phase === "skipped" ? "已忽略"
                    : referenceIds.includes(source.id) ? `已浏览 ${viewed} 条 · 采集案例 ${captured} 条`
                      : `案例 ${captured} 条`}</span>
            </article>
          );
        })}
      </div>}
      {status === "awaiting_visual_confirmation" && (
        <section className="visual-direction-confirmation">
          <header><h2>确认视觉方向</h2></header>
          <div className="visual-direction-grid">
            {(activity?.visualDirections || []).map((direction) => {
              const examples = visualCandidates.filter((item) => direction.sampleIds?.includes(item.id)).slice(0, 4);
              const isSelected = selectedDirections.includes(direction.label);
              return <article className={isSelected ? "selected" : ""} key={direction.label} role="button" tabIndex={0} aria-pressed={isSelected} onClick={() => setSelectedDirections((current) => isSelected ? current.filter((label) => label !== direction.label) : [...current, direction.label])} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedDirections((current) => isSelected ? current.filter((label) => label !== direction.label) : [...current, direction.label]); } }}>
                <div className="visual-direction-card-heading"><header><div className="visual-direction-card-index"><span className="visual-direction-selection" aria-hidden="true">{isSelected ? "✓" : ""}</span><small>视觉方向 {String((activity?.visualDirections || []).findIndex((item) => item.label === direction.label) + 1).padStart(2, "0")}</small></div><h3>{direction.label}</h3><p>{direction.rationale || "由竞品截图与官方趋势交叉形成的视觉方向。"}</p></header></div>
                <div className="visual-direction-examples">{examples.map((item) => (
                  <a key={item.id} href={item.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.mediaKeys?.length ? `/api/research/tasks/${taskId}/candidates/${item.id}/media/0` : `/api/research/tasks/${taskId}/candidates/${item.id}/screenshot`} alt={item.title} />
                    <span className="visual-direction-example-caption"><span>{item.title}</span><b>↗ 来源</b></span>
                  </a>
                ))}</div>
              </article>;
            })}
          </div>
          <button className="primary" type="button" disabled={confirming || selectedDirections.length < 1 || (!visualOnly && !candidateSelectionCount)} onClick={() => void confirmVisualDirections()}>{confirming ? "正在进入下一步…" : visualOnly ? `确认 ${selectedDirections.length} 个视觉方向` : `确认 ${candidateSelectionCount} 个案例与 ${selectedDirections.length} 个视觉方向`}</button>
        </section>
      )}
      {status === "awaiting_competitor_confirmation" && (
        <section className="visual-direction-confirmation competitor-confirmation">
          <header><div><h2>已提取竞品关键词</h2></div><div className="competitor-confirmation-actions"><button className="secondary-button" type="button" disabled={retryingCompetitorSearch || confirmingCompetitors} onClick={() => void retryCompetitorSearch()}>{retryingCompetitorSearch ? "正在搜索…" : "重新搜索"}</button></div></header>
          {activity?.visualCompetitorExtractionNeedsReview && <div className="competitor-extraction-note"><strong>需要人工操作</strong><span>暂未从面板卡片中可靠提取出名称。可以重新搜索，或放大截图后手动添加竞品。</span></div>}
          {Boolean(activity?.visualCompetitorPanelScreenshotCount) && <div className="competitor-panel-shots">{Array.from({ length: activity?.visualCompetitorPanelScreenshotCount || 0 }, (_, index) => <button key={index} type="button" className="competitor-panel-shot" onClick={() => setActiveCompetitorScreenshot(index)} aria-label={`放大查看竞品推荐面板截图 ${index + 1}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/research/tasks/${taskId}/competitor-panel?index=${index}`} alt={`竞品推荐面板截图 ${index + 1}`} />
          </button>)}</div>}
          <div className="competitor-choice-list">
            {(activity?.visualCompetitors || []).map((competitor) => {
              const selected = selectedCompetitors.includes(competitor.name);
              return <label className={selected ? "selected" : ""} key={competitor.name}>
                <input type="checkbox" checked={selected} onChange={() => setSelectedCompetitors((current) => selected ? current.filter((name) => name !== competitor.name) : [...current, competitor.name])} />
                <span><strong>{competitor.name}</strong><small>{competitor.source ? `${competitor.source} · ` : ""}{competitor.reason || "来自小红书搜索结果右侧推荐"}</small></span>
              </label>;
            })}
            {customCompetitors.map((name) => {
              const selected = selectedCompetitors.includes(name);
              return <label className={selected ? "selected" : ""} key={`custom-${name}`}>
                <input type="checkbox" checked={selected} onChange={() => setSelectedCompetitors((current) => selected ? current.filter((item) => item !== name) : [...current, name])} />
                <span><strong>{name}</strong><small>自定义</small></span>
              </label>;
            })}
          </div>
          <div className="competitor-custom-entry">
            <input aria-label="自定义竞品名称" value={customCompetitor} onChange={(event) => setCustomCompetitor(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustomCompetitor(); } }} placeholder="输入要补充的竞品名称，按回车添加" />
          </div>
          <button className="primary" type="button" disabled={confirmingCompetitors || !selectedCompetitors.length} onClick={() => void confirmCompetitors()}>{confirmingCompetitors ? "正在继续…" : `确认并搜索 ${selectedCompetitors.length} 个竞品`}</button>
        </section>
      )}
      {activeCompetitorScreenshot !== null && (
        <div className="competitor-image-lightbox" role="dialog" aria-modal="true" aria-label="竞品面板截图预览" onClick={() => setActiveCompetitorScreenshot(null)}>
          <button type="button" className="competitor-image-lightbox-close" aria-label="关闭截图预览" onClick={() => setActiveCompetitorScreenshot(null)}>×</button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/research/tasks/${taskId}/competitor-panel?index=${activeCompetitorScreenshot}`} alt={`放大后的竞品推荐面板截图 ${activeCompetitorScreenshot + 1}`} onClick={(event) => event.stopPropagation()} />
        </div>
      )}
      {status === "needs_login" && (
        <div className="runner-action-panel login">
          <div className="runner-action-copy">
            <i aria-hidden="true">!</i>
            <div><strong>请先登录{loginPlatforms.join("、")}</strong><span>{visualOnly ? "登录后点击“已登录”继续视觉研究。" : "三个平台的页签都会保留，研究已暂停。完成登录后点“已登录”；无法登录的平台可点“忽略该平台”后继续。"}</span></div>
          </div>
          <div className="runner-action-actions">
            {!visualOnly && <button type="button" onClick={() => void ignoreBlockedPlatform()}>忽略该平台</button>}
            <button className="primary" type="button" onClick={resumeResearch}>已登录</button>
          </div>
        </div>
      )}
      {status === "failed" && (
        <div className="runner-action-panel error">
          <div><strong>研究服务暂时中断</strong><span>{error || "请确认研究服务正在运行后重试。"}</span></div>
          <button className="primary" type="button" onClick={resumeResearch}>重新研究</button>
        </div>
      )}
      {(status === "local" || status === "queued" || status === "running" || localTask) && <footer>
        <span>{status === "local" ? "研究服务尚未连接。" : status === "queued" || status === "running" ? "你可以先离开，研究完成后再回来查看结果。" : ""}</span>
        <div>{localTask && <button type="button" onClick={() => downloadResearchTask(localTask)}>下载本地任务</button>}</div>
      </footer>}
    </section>
  );
}

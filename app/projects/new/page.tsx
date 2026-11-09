"use client";

import { ChangeEvent, type CSSProperties, useEffect, useMemo, useState } from "react";
import DashboardSidebar from "../../components/DashboardSidebar";
import FlowProgress from "../../components/FlowProgress";
import StageProgress from "../../components/StageProgress";
import NightingaleIcon from "../../components/NightingaleIcon";
import { createResearchTask } from "../../lib/localResearchStore";
import { extractMeetingPdf, MeetingContext } from "../../lib/meetingNotes";
import { personalIdentityHeaders } from "../../lib/personalIdentity";
import { personalAgentHeaders } from "../../lib/personalAgentConfig";
import { saveSolutionImages } from "../../lib/solutionImageStore";
import { saveCurrentProject } from "../../lib/savedProjects";

type DesignType = "interaction" | "brand" | "marketing";
type ProjectStage = "before" | "review" | "live";
type ResearchMode = "play" | "visual";
type FeedbackPlatform = "xiaohongshu" | "weibo" | "voiceOfUser";
const feedbackPlatforms: { id: FeedbackPlatform; label: string; detail: string }[] = [
  { id: "xiaohongshu", label: "小红书", detail: "帖子与评论" },
  { id: "weibo", label: "微博", detail: "相关讨论" },
  { id: "voiceOfUser", label: "用户之声", detail: "用户问题与体验" },
];
const draftKey = "design-lab-project-draft";
const projectIdKey = "design-lab-current-project-id";

function getProjectId() {
  const existing = window.localStorage.getItem(projectIdKey);
  if (existing) return existing;
  const id = `project-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  window.localStorage.setItem(projectIdKey, id);
  return id;
}

function projectKind(type: DesignType) {
  return type === "brand" ? "品牌设计" : type === "marketing" ? "大促设计" : "互动设计";
}

function DesignDirectionIcon({ type }: { type: DesignType }) {
  return (
    <i className={`direction-icon direction-icon-${type}`} aria-hidden="true">
      <img src={`/icons/direction-card/${type}-24.svg`} alt="" width={24} height={24} />
    </i>
  );
}

const designDirections: { type: DesignType; title: string; description: string }[] = [
  { type: "interaction", title: "互动域", description: "玩法、流程、反馈与激励" },
  { type: "marketing", title: "营销域", description: "大促会场、开屏广告与活动心智" },
  { type: "brand", title: "品牌域", description: "图标、启动屏、品牌 IP 与主视觉" },
];

function DesignDirectionCard({ direction, selected, onSelect }: { direction: typeof designDirections[number]; selected: boolean; onSelect: (type: DesignType) => void }) {
  return <button className={selected ? `selected ${direction.type}-selected` : ""} type="button" aria-pressed={selected} onClick={() => onSelect(direction.type)}>
    <DesignDirectionIcon type={direction.type} /><span><strong>{direction.title}</strong><small>{direction.description}</small></span>
  </button>;
}

const optionGroups = [
  {
    key: "goal",
    title: "营销目标",
    single: false,
    custom: true,
    options: ["拉新（新增用户数、获客成本）", "促活（DAU、活跃率、参与次数）", "转化（转化率、客单价）", "传播（分享率、拉新人数）", "留存（次日留存、复访率）"],
  },
  { key: "game", title: "游戏类型", single: true, custom: true, options: ["抽奖", "答题", "收集", "养成", "暂不确定"] },
  {
    key: "audience",
    title: "目标用户",
    single: false,
    custom: true,
    options: ["小镇青年", "小镇中年", "小镇中产", "小镇家庭", "都市蓝领", "都市家庭", "都市Z世代", "都市中产", "银发一族", "学生族"],
  },
  { key: "problem", title: "当前问题", single: false, custom: true, options: ["玩法不明确", "开始率低", "完成率低", "分享率低", "转化率低"] },
];

const brandOptionGroups = [
  { key: "goal", title: "优先目标", single: false, custom: true, options: ["强化品牌识别", "完成品牌升级", "建立数字一致性", "表达智能能力", "提升年轻感知"] },
  { key: "perception", title: "核心感知", single: false, custom: true, options: ["亲和", "智能", "年轻", "可信", "轻盈", "专业"] },
  { key: "boundary", title: "研究边界", single: false, custom: true, options: ["App Icon", "启动屏", "引导页", "核心界面", "品牌 IP", "数字品牌系统"] },
  { key: "audience", title: "目标用户", single: false, custom: true, options: ["大众用户", "年轻用户", "家庭用户", "专业用户", "银发用户"] },
];

const marketingOptionGroups = [
  { key: "goal", title: "优先目标", single: false, custom: true, options: ["建立大促心智", "突出核心利益", "提升会场分流", "强化商品转化", "保持触点一致"] },
  { key: "perception", title: "核心感知", single: false, custom: true, options: ["热烈", "明确", "可信", "新鲜", "高效", "有品质"] },
  { key: "boundary", title: "研究边界", single: false, custom: true, options: ["电商大促频道会场", "开屏广告"] },
  { key: "campaign", title: "活动节点", single: true, custom: true, options: ["618", "双11", "年货节", "跨年", "中秋节", "端午节", "圣诞节", "七夕", "情人节"] },
];

export default function NewProject() {
  const [designType, setDesignType] = useState<DesignType>("interaction");
  const [stage, setStage] = useState<ProjectStage>("before");
  const [projectName, setProjectName] = useState("");
  const projectMode = "需求项目";
  const [researchMode, setResearchMode] = useState<ResearchMode>("play");
  const [feedbackPlatformsSelected, setFeedbackPlatformsSelected] = useState<FeedbackPlatform[]>(["xiaohongshu", "weibo", "voiceOfUser"]);
  const [feedbackStartDate, setFeedbackStartDate] = useState("");
  const [feedbackEndDate, setFeedbackEndDate] = useState("");
  const [researchKeywords, setResearchKeywords] = useState<string[]>([]);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [recommendedKeywords, setRecommendedKeywords] = useState<string[]>([]);
  const [recommendingKeywords, setRecommendingKeywords] = useState(false);
  const [keywordNotice, setKeywordNotice] = useState("");
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [customOptions, setCustomOptions] = useState<Record<string, string[]>>({});
  const [customOpen, setCustomOpen] = useState<Record<string, boolean>>({});
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [meetingContext, setMeetingContext] = useState<MeetingContext>({});
  const [decisionPosture, setDecisionPosture] = useState(50);
  const [meetingStatus, setMeetingStatus] = useState("");
  const [readingMeeting, setReadingMeeting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [hasExistingResearch, setHasExistingResearch] = useState(false);
  const [entryMode, setEntryMode] = useState<"" | "import" | "retrospective">("");
  const [solutionName, setSolutionName] = useState("");
  const [solutionVersion, setSolutionVersion] = useState("V1.0");
  const [solutionImages, setSolutionImages] = useState<Array<{ name: string; dataUrl: string }>>([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedEntry = params.get("entry") === "retrospective" ? "retrospective" : params.get("entry") === "import" ? "import" : "";
    setEntryMode(requestedEntry);
    if (requestedEntry) setStage(requestedEntry === "retrospective" ? "live" : "review");
    const isFreshProject = params.has("fresh");
    if (isFreshProject) {
      window.localStorage.removeItem(draftKey);
      window.localStorage.removeItem(projectIdKey);
      window.localStorage.removeItem("design-lab-active-research-task");
      window.localStorage.removeItem("design-lab-research-task");
      window.localStorage.removeItem("design-lab-research-evidence");
      window.sessionStorage.removeItem("design-lab-start-research");
      window.history.replaceState(null, "", requestedEntry ? `/projects/new?entry=${requestedEntry}` : "/projects/new");
      setDraftLoaded(true);
      return;
    }
    const savedDraft = window.localStorage.getItem(draftKey);
    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft);
        if (draft.designType) setDesignType(draft.designType);
        if (draft.stage) setStage(draft.stage);
        if (typeof draft.projectName === "string") setProjectName(draft.projectName);
        if (draft.researchMode === "visual" || draft.researchMode === "play") setResearchMode(draft.researchMode);
        if (Array.isArray(draft.feedbackPlatforms)) setFeedbackPlatformsSelected(draft.feedbackPlatforms.filter((item: string) => feedbackPlatforms.some((platform) => platform.id === item)));
        if (typeof draft.feedbackStartDate === "string") setFeedbackStartDate(draft.feedbackStartDate);
        if (typeof draft.feedbackEndDate === "string") setFeedbackEndDate(draft.feedbackEndDate);
        if (Array.isArray(draft.researchKeywords)) setResearchKeywords(draft.researchKeywords.map(String).filter(Boolean));
        if (Array.isArray(draft.recommendedKeywords)) setRecommendedKeywords(draft.recommendedKeywords.map(String).filter(Boolean));
        if (draft.answers) setAnswers(draft.answers);
        if (draft.customOptions) setCustomOptions(draft.customOptions);
        if (draft.customOpen) setCustomOpen(draft.customOpen);
        if (draft.customValues) setCustomValues(draft.customValues);
        if (draft.meetingContext) setMeetingContext(draft.meetingContext);
        if (typeof draft.decisionPosture === "number") setDecisionPosture(draft.decisionPosture);
      } catch {
        window.localStorage.removeItem(draftKey);
      }
    }
    const taskId = window.localStorage.getItem("design-lab-active-research-task") || "";
    if (taskId) {
      fetch(`/api/research/tasks/${taskId}`, { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) return;
          const data = await response.json();
          if (data.task?.status === "completed" || Number(data.candidateCount || 0) > 0) {
            setHasExistingResearch(true);
          }
        })
        .catch(() => undefined);
    }
    setDraftLoaded(true);
  }, []);

  useEffect(() => {
    if (!draftLoaded) return;
    window.localStorage.setItem(draftKey, JSON.stringify({
      designType,
      stage,
      projectName,
      projectMode,
      researchMode,
      feedbackPlatforms: feedbackPlatformsSelected,
      feedbackStartDate,
      feedbackEndDate,
      researchKeywords,
      recommendedKeywords,
      answers,
      customOptions,
      customOpen,
      customValues,
      meetingContext,
      decisionPosture,
    }));
  }, [draftLoaded, designType, stage, projectName, researchMode, feedbackPlatformsSelected, feedbackStartDate, feedbackEndDate, researchKeywords, recommendedKeywords, answers, customOptions, customOpen, customValues, meetingContext, decisionPosture]);

  const canContinue = useMemo(
    () => Boolean(
      projectName.trim()
      && (answers.goal?.length || customValues.goal?.trim())
      && (designType !== "interaction" || answers.game?.length || customValues.game?.trim())
      && (designType === "interaction" || answers.perception?.length || customValues.perception?.trim())
      && (designType === "interaction" || answers.boundary?.length || customValues.boundary?.trim())
      && (!entryMode || (solutionName.trim() && solutionImages.length)),
    ),
    [projectName, answers, customValues, entryMode, solutionName, solutionImages],
  );
  const validFeedbackRange = Boolean(feedbackStartDate && feedbackEndDate && feedbackStartDate <= feedbackEndDate);
  const canStartFeedbackResearch = canContinue && researchKeywords.length > 0 && feedbackPlatformsSelected.length > 0 && validFeedbackRange;
  const addResearchKeyword = (value: string) => {
    const keyword = value.trim().replace(/[，,、;；]+$/g, "");
    if (!keyword) return;
    setResearchKeywords((current) => current.includes(keyword) ? current : [...current, keyword]);
    setKeywordDraft("");
  };
  const recommendResearchKeywords = async () => {
    setRecommendingKeywords(true);
    setKeywordNotice("");
    try {
      const response = await fetch("/api/research/keywords", {
        method: "POST",
        headers: { "content-type": "application/json", ...personalAgentHeaders() },
        body: JSON.stringify({ projectName, designType, answers, customValues, meetingContext }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "关键词建议生成失败");
      setRecommendedKeywords(Array.isArray(data.keywords) ? data.keywords : []);
    } catch (error) {
      setKeywordNotice(error instanceof Error ? error.message : "关键词建议生成失败");
    } finally {
      setRecommendingKeywords(false);
    }
  };

  const toggle = (key: string, option: string, single: boolean) => {
    setAnswers((current) => {
      const selected = current[key] ?? [];
      return {
        ...current,
        [key]: single
          ? [option]
          : selected.includes(option)
            ? selected.filter((item) => item !== option)
            : [...selected, option],
      };
    });
  };

  const saveCustomOption = (key: string, single: boolean) => {
    const value = customValues[key]?.trim();
    if (!value) return;
    setCustomOptions((current) => ({
      ...current,
      [key]: current[key]?.includes(value) ? current[key] : [...(current[key] || []), value],
    }));
    setAnswers((current) => {
      const selected = current[key] ?? [];
      return {
        ...current,
        [key]: single
          ? [value]
          : selected.includes(value)
            ? selected
            : [...selected, value],
      };
    });
    setCustomValues((current) => ({ ...current, [key]: "" }));
    setCustomOpen((current) => ({ ...current, [key]: false }));
  };

  const summarizeMeeting = async () => {
    if (!meetingContext.extractedText && !meetingContext.link?.trim()) { setMeetingStatus("请先上传 PDF 或粘贴项目背景链接"); return; }
    setReadingMeeting(true); setMeetingStatus("Agent 正在读取项目背景并填写需求…");
    const response = await fetch("/api/meeting-context", { method: "POST", headers: { "content-type": "application/json", ...personalAgentHeaders() }, body: JSON.stringify({ ...meetingContext, designType }) }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok) setMeetingStatus(data?.error || "项目背景读取失败");
    else {
      setMeetingContext((current) => ({ ...current, extractedText: data.sourceText || current.extractedText, keyPoints: data.keyPoints }));
      if (!projectName.trim() && typeof data.projectName === "string" && data.projectName.trim()) setProjectName(data.projectName.trim());
      if (data.answers && typeof data.answers === "object") setAnswers((current) => ({ ...current, ...data.answers }));
      setMeetingStatus("已读取项目背景并自动填写下方需求");
    }
    setReadingMeeting(false);
  };

  const readMeetingFile = (file: File) => {
    setMeetingStatus("正在读取项目背景文件…");
    void extractMeetingPdf(file)
      .then((context) => { setMeetingContext((current) => ({ ...current, ...context, keyPoints: undefined })); setMeetingStatus(`已读取 ${context.fileName}`); })
      .catch((error) => setMeetingStatus(error instanceof Error ? error.message : "项目背景文件读取失败"));
  };

  const loadSolutionFiles = async (incoming: File[]) => {
    const files = incoming.filter((file) => file.type.startsWith("image/")).slice(0, 5);
    const loaded = await Promise.all(files.map((file) => new Promise<{ name: string; dataUrl: string }>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve({ name: file.name, dataUrl: String(reader.result || "") }); reader.onerror = reject; reader.readAsDataURL(file);
    })));
    setSolutionImages(loaded);
  };
  const readSolutionFiles = (event: ChangeEvent<HTMLInputElement>) => { void loadSolutionFiles(Array.from(event.target.files || [])); };

  const continueFlow = async (researchMode: ResearchMode, forceNewResearch = false) => {
    if (!canContinue) return;
    setResearchMode(researchMode);
    const draft = { designType, stage, projectName, projectMode, answers, customOpen, customValues, meetingContext, decisionPosture, researchMode, feedbackPlatforms: feedbackPlatformsSelected, feedbackStartDate, feedbackEndDate, researchKeywords };
    window.localStorage.setItem(draftKey, JSON.stringify(draft));
    if (entryMode) {
      try {
        await saveSolutionImages(solutionImages);
        window.sessionStorage.setItem("design-lab-solution-intake", JSON.stringify({ projectName, solutionName, version: solutionVersion, entryMode }));
        window.sessionStorage.setItem("design-lab-entry-source", `homepage-${entryMode}`);
        window.location.href = `/projects/import/identify?entry=${entryMode}`;
      } catch {
        setNotice("方案图片过大，请减少图片数量或尺寸后重试");
      }
      return;
    }
    if (hasExistingResearch && !forceNewResearch) {
      const taskId = window.localStorage.getItem("design-lab-active-research-task") || "";
      if (taskId) {
        const id = getProjectId();
        saveCurrentProject({ id, taskId, name: projectName.trim(), kind: projectKind(designType), stage: researchMode === "visual" ? "视觉调研" : "竞品调研", progress: 40, savedAt: new Date().toISOString(), route: "/projects/research", project: draft });
      }
      window.sessionStorage.removeItem("design-lab-start-research");
      window.location.href = "/projects/research";
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/research/tasks", {
        method: "POST",
        headers: { "content-type": "application/json", ...personalIdentityHeaders() },
        body: JSON.stringify(draft),
      });
      if (!response.ok) throw new Error("任务队列暂时不可用");
      const task = await response.json();
      window.localStorage.setItem("design-lab-active-research-task", task.id);
      const id = getProjectId();
      saveCurrentProject({ id, taskId: task.id, name: projectName.trim(), kind: projectKind(designType), stage: researchMode === "visual" ? "视觉调研" : "竞品调研", progress: 40, savedAt: new Date().toISOString(), route: "/projects/research", project: draft });
      window.sessionStorage.setItem("design-lab-start-research", "1");
      window.location.href = "/projects/research";
    } catch {
      const task = createResearchTask(draft);
      window.localStorage.setItem("design-lab-active-research-task", task.id);
      const id = getProjectId();
      saveCurrentProject({ id, taskId: task.id, name: projectName.trim(), kind: projectKind(designType), stage: researchMode === "visual" ? "视觉调研" : "竞品调研", progress: 40, savedAt: new Date().toISOString(), route: "/projects/research", project: draft });
      setNotice("本机调研尚未连接，任务已保存。请先完成本机调研连接后再开始采集。");
      window.sessionStorage.setItem("design-lab-start-research", "1");
      window.setTimeout(() => { window.location.href = "/projects/research"; }, 700);
    }
  };

  return (
    <main className="new-project-page">
      <DashboardSidebar />

      <section className="project-form-shell">
        <header className="project-topbar">
          <div><span>新建项目</span><b>/</b><strong>项目需求</strong></div>
          <button type="button" onClick={() => {
            const draft = { designType, stage, projectName, projectMode, answers, customOpen, customValues, meetingContext, decisionPosture, researchMode, feedbackPlatforms: feedbackPlatformsSelected, feedbackStartDate, feedbackEndDate, researchKeywords };
            window.localStorage.setItem(draftKey, JSON.stringify(draft));
            if (projectName.trim()) {
              const id = getProjectId();
              saveCurrentProject({ id, taskId: window.localStorage.getItem("design-lab-active-research-task") || id, name: projectName.trim(), kind: projectKind(designType), stage: "背景输入", progress: 20, savedAt: new Date().toISOString(), route: "/projects/new", project: draft });
            }
            window.location.href = "/";
          }}>保存并退出</button>
        </header>

        <div className="project-form">
          {entryMode ? <StageProgress steps={entryMode === "import" ? ["项目与方案", "识别设计点"] : ["项目与方案", "识别设计点", "上线复盘"]} active={1} /> : <FlowProgress active={1} />}
          <div className="form-intro">
            <p>{entryMode ? "START FROM EXISTING WORK" : "NEW PROJECT"}</p>
            <h1>{entryMode === "retrospective" ? "先补齐项目背景与上线方案。" : entryMode === "import" ? "先补齐项目背景并导入方案。" : "告诉我们你正在做什么。"}</h1>
            <span>{entryMode ? "这些信息作为本需求的共同背景，后续识别、评价和复盘都会直接沿用。" : "每个项目对应一项需求；项目背景和目标将在本项目的用户调研、视觉调研、策略与评审中共同使用。"}</span>
          </div>

          <section className="compact-section project-name-section">
            <label htmlFor="project-name">项目名称</label>
            <input id="project-name" value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="例如：618 集卡互动优化" />
          </section>

          {!entryMode && <section className="compact-section">
            <label>设计方向</label>
            <div className="segmented-options">
              {designDirections.map((direction) => <DesignDirectionCard key={direction.type} direction={direction} selected={designType === direction.type} onSelect={setDesignType} />)}
            </div>
          </section>}

          <section className="field-section meeting-context-section">
            <div className="field-heading"><label>项目背景</label></div>
            <p className="meeting-context-copy">上传 PDF 会议纪要、项目需求 PRD，或粘贴会议纪要链接。读取后将自动填写下方项目需求。</p>
            <div className="meeting-context-inputs">
              <div className="meeting-upload" onDragOver={(event) => { event.preventDefault(); event.currentTarget.classList.add("dragging"); }} onDragLeave={(event) => event.currentTarget.classList.remove("dragging")} onDrop={(event) => { event.preventDefault(); event.currentTarget.classList.remove("dragging"); const file = event.dataTransfer.files?.[0]; if (file) readMeetingFile(file); }}>
                <label>
                  <input type="file" accept="application/pdf,.pdf" onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) readMeetingFile(file);
                  }} />
                  <span><img src="/upload-arrow.svg" alt="" /></span><b>{meetingContext.fileName || "拖拽或上传 PDF 会议纪要 / 项目 PRD"}</b>
                </label>
                {meetingContext.extractedText && <button className="remove-pdf" type="button" onClick={() => { setMeetingContext((current) => ({ link: current.link })); setMeetingStatus("已移除 PDF 会议纪要"); }}>移除</button>}
              </div>
              <input className="meeting-link" value={meetingContext.link || ""} onChange={(event) => setMeetingContext((current) => ({ ...current, link: event.target.value }))} placeholder="粘贴会议纪要、Relay、PRD 或网页链接" type="url" aria-label="项目背景链接" />
            </div>
            <div className="meeting-context-actions"><button type="button" disabled={readingMeeting || (!meetingContext.extractedText && !meetingContext.link?.trim())} onClick={() => { void summarizeMeeting(); }}>{readingMeeting ? "读取并填写中…" : "读取并自动填写"}</button></div>
            {meetingStatus && <div className="meeting-context-status"><span>{meetingStatus}</span></div>}
            {meetingContext.keyPoints?.length ? <ol className="meeting-key-points">{meetingContext.keyPoints.map((point) => <li key={point}>{point}</li>)}</ol> : null}
          </section>

          {(stage === "before" || Boolean(entryMode)) ? (
            <>
              {(designType === "interaction" ? optionGroups : designType === "brand" ? brandOptionGroups : marketingOptionGroups).map((group) => (
                <section className="field-section" key={group.key}>
                  <div className="field-heading"><label>{group.title}</label><small>{group.single ? "单选" : "可多选"}</small></div>
                  <div className="chip-row">
                    {group.options.map((option) => (
                      <button
                        className={answers[group.key]?.includes(option) ? "active" : ""}
                        type="button"
                        key={option}
                        onClick={() => toggle(group.key, option, group.single)}
                      >
                        {option}
                      </button>
                    ))}
                    {(customOptions[group.key] ?? []).map((option) => (
                      <button
                        className={`${answers[group.key]?.includes(option) ? "active " : ""}custom-option-chip`}
                        type="button"
                        key={`custom-${option}`}
                        aria-pressed={Boolean(answers[group.key]?.includes(option))}
                        onClick={() => toggle(group.key, option, group.single)}
                      >
                        {option}
                      </button>
                    ))}
                    {group.custom && (
                      <button
                        className="custom-trigger"
                        type="button"
                        onClick={() => setCustomOpen((current) => ({ ...current, [group.key]: true }))}
                      >
                        ＋ 自定义
                      </button>
                    )}
                  </div>
                  {group.custom && customOpen[group.key] && (
                    <div className="custom-input-wrap">
                      <input
                        className="custom-input"
                        value={customValues[group.key] ?? ""}
                        onChange={(event) => setCustomValues((current) => ({ ...current, [group.key]: event.target.value }))}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            saveCustomOption(group.key, group.single);
                          }
                          if (event.key === "Escape") setCustomOpen((current) => ({ ...current, [group.key]: false }));
                        }}
                        placeholder={`输入自定义${group.title}`}
                        autoFocus
                        aria-label={`输入自定义${group.title}，按回车保存`}
                      />
                      <span className="custom-input-enter-hint" aria-hidden="true">↵</span>
                    </div>
                  )}
                </section>
              ))}
            </>
          ) : (
            <section className="branch-placeholder">
              <span>{designType === "brand" ? "✦" : stage === "review" ? "◈" : "↗"}</span>
              <div>
                <strong>{designType === "brand" ? "品牌设计项目框架" : stage === "review" ? "方案评分流程" : "上线复盘流程"}</strong>
                <p>该分支将在互动设计的设计前流程完成后继续搭建。</p>
              </div>
            </section>
          )}

          {entryMode && <section className="field-section entry-solution-section">
            <div className="field-heading"><label>导入已有方案</label><small>必填</small></div>
            <div className="entry-solution-basics"><label>方案名称<input type="text" value={solutionName} onChange={(event) => setSolutionName(event.target.value)} placeholder="例如：集卡主流程优化方案" /></label><label>版本<input type="text" value={solutionVersion} onChange={(event) => setSolutionVersion(event.target.value)} placeholder="V1.0" /></label></div>
            <div className="meeting-upload entry-solution-upload" onDragOver={(event) => { event.preventDefault(); event.currentTarget.classList.add("dragging"); }} onDragLeave={(event) => event.currentTarget.classList.remove("dragging")} onDrop={(event) => { event.preventDefault(); event.currentTarget.classList.remove("dragging"); void loadSolutionFiles(Array.from(event.dataTransfer.files || [])); }}><label><input type="file" accept="image/*" multiple onChange={readSolutionFiles} /><span><img src="/upload-arrow.svg" alt="" /></span><b>{solutionImages.length ? `已上传 ${solutionImages.length} 张方案图` : "拖拽或上传方案图片，最多 5 张"}</b></label>{solutionImages.length > 0 && <button className="remove-pdf" type="button" onClick={() => setSolutionImages([])}>移除</button>}</div>
          </section>}

          <section className="field-section decision-posture-section">
            <div className="field-heading"><label htmlFor="decision-posture">研究开放度</label></div>
            <p className="decision-posture-copy">控制研究更贴近当前需求，或探索更广泛的案例与设计机会。</p>
            <div className="decision-posture-control" style={{ "--slider-value": `${decisionPosture}%` } as CSSProperties}>
              <input id="decision-posture" type="range" min="0" max="100" step="1" value={decisionPosture} aria-valuetext={decisionPosture < 40 ? "方向聚焦" : decisionPosture > 60 ? "开放探索" : "探索与聚焦并行"} onChange={(event) => setDecisionPosture(Number(event.target.value))} />
              <div className="decision-posture-range-labels" aria-hidden="true">
                <span>方向聚焦</span>
                <span>开放探索</span>
              </div>
            </div>
          </section>

          {!entryMode && stage === "before" && <section className="field-section feedback-scope-section">
            <div className="research-keyword-block">
              <div className="field-heading"><label htmlFor="research-keyword-input">搜索关键词</label><span>必填，用户调研只按已选关键词搜索与筛选</span></div>
              <div className="research-keyword-entry">
                <input id="research-keyword-input" value={keywordDraft} onChange={(event) => setKeywordDraft(event.target.value)} onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === "," || event.key === "，") { event.preventDefault(); addResearchKeyword(keywordDraft); }
                }} onBlur={() => addResearchKeyword(keywordDraft)} placeholder="输入关键词后按回车" />
                <button type="button" className="keyword-recommend-button" disabled={recommendingKeywords} onClick={() => { void recommendResearchKeywords(); }}><img src="/icons/star-regular.svg" width={16} height={16} alt="" aria-hidden="true" />{recommendingKeywords ? "生成中…" : "生成"}</button>
              </div>
              {researchKeywords.length > 0 && <div className="research-keyword-chips">{researchKeywords.map((keyword) => <button type="button" key={keyword} onClick={() => setResearchKeywords((current) => current.filter((item) => item !== keyword))}>{keyword}<span aria-hidden="true">×</span></button>)}</div>}
              {recommendedKeywords.length > 0 && <div className="research-keyword-suggestions"><span>推荐关键词</span>{recommendedKeywords.map((keyword) => <button type="button" key={keyword} className={researchKeywords.includes(keyword) ? "added" : ""} onClick={() => addResearchKeyword(keyword)}>{keyword}{researchKeywords.includes(keyword) ? " 已添加" : " +"}</button>)}</div>}
              {keywordNotice && <small className="research-keyword-error">{keywordNotice}</small>}
            </div>
            <div className="feedback-scope-divider" aria-hidden="true" />
            <div className="field-heading"><label>用户调研采集平台</label></div>
            <p className="meeting-context-copy">选择本次要采集的平台，并限定反馈发布时间。</p>
            <div className="feedback-platform-options" role="group" aria-label="选择反馈平台">
              {feedbackPlatforms.map((platform) => {
                const selected = feedbackPlatformsSelected.includes(platform.id);
                return <button type="button" key={platform.id} className={selected ? "selected" : ""} aria-pressed={selected} onClick={() => setFeedbackPlatformsSelected((current) => selected ? current.filter((item) => item !== platform.id) : [...current, platform.id])}>
                  <span className="feedback-platform-check" aria-hidden="true">{selected ? "✓" : ""}</span>
                  <span><strong>{platform.label}</strong><small>{platform.detail}</small></span>
                </button>;
              })}
            </div>
            <div className="feedback-scope-divider" aria-hidden="true" />
            <div className="feedback-date-range">
              <label>采集时间范围</label>
              <div>
                <input aria-label="反馈开始日期" type="date" value={feedbackStartDate} max={feedbackEndDate || undefined} onChange={(event) => setFeedbackStartDate(event.target.value)} />
                <span>至</span>
                <input aria-label="反馈结束日期" type="date" value={feedbackEndDate} min={feedbackStartDate || undefined} onChange={(event) => setFeedbackEndDate(event.target.value)} />
              </div>
              {feedbackStartDate && feedbackEndDate && feedbackStartDate > feedbackEndDate && <small className="feedback-range-error">开始日期不能晚于结束日期</small>}
            </div>
          </section>}

          <footer className="form-footer">
            {(!canContinue || (!entryMode && !canStartFeedbackResearch)) && !entryMode && <span className="form-validation-hint">
              {!canContinue ? (!projectName.trim() ? "请先填写项目名称" : "请完成必填的项目需求")
                : researchKeywords.length === 0 ? "请至少选择一个搜索关键词"
                  : feedbackPlatformsSelected.length === 0 ? "请至少选择一个反馈平台"
                  : !validFeedbackRange ? "请设置有效的反馈时间段" : ""}
            </span>}
            <button className="secondary-button" type="button" onClick={() => { window.location.href = "/"; }}>取消</button>
            {entryMode ? <button className="continue-button" type="button" disabled={submitting || !canContinue} onClick={() => { void continueFlow("play"); }}>
              继续识别设计点 {!submitting && <img src="/arrow-right-regular.svg" alt="" />}
            </button> : <div className="research-mode-actions">
              <button className="research-mode-button" type="button" disabled={submitting || !canStartFeedbackResearch || stage !== "before"} onClick={() => { void continueFlow("play", hasExistingResearch); }}>
                {submitting ? "正在创建研究任务…" : "用户调研"} {!submitting && <img src="/arrow-right-regular.svg" alt="" />}
              </button>
              <button className="research-mode-button" type="button" disabled={submitting || !canContinue || stage !== "before"} onClick={() => { void continueFlow("visual", hasExistingResearch); }}>
                {submitting ? "正在创建研究任务…" : "视觉研究"} {!submitting && <img src="/arrow-right-regular.svg" alt="" />}
              </button>
            </div>}
          </footer>
        </div>
      </section>

      {notice && <div className="toast"><i />{notice}</div>}
    </main>
  );
}

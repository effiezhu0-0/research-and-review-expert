"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import DashboardSidebar from "../../components/DashboardSidebar";
import FlowProgress from "../../components/FlowProgress";
import StageProgress from "../../components/StageProgress";
import { createResearchTask } from "../../lib/localResearchStore";
import { extractMeetingPdf, MeetingContext } from "../../lib/meetingNotes";
import { personalIdentityHeaders } from "../../lib/personalIdentity";
import { personalAgentHeaders } from "../../lib/personalAgentConfig";
import { saveSolutionImages } from "../../lib/solutionImageStore";

type DesignType = "interaction" | "brand" | "marketing";
type ProjectStage = "before" | "review" | "live";
const draftKey = "design-lab-project-draft";

function DesignDirectionIcon({ type }: { type: DesignType }) {
  return (
    <i className={`direction-icon direction-icon-${type}`} aria-hidden="true">
      {type === "interaction" ? (
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M8.2 7.5h7.6c2.2 0 3.8 1.3 4.3 3.5l.9 4.1c.5 2.2-.6 3.9-2.4 3.9-1 0-1.6-.5-2.4-1.5l-1.1-1.4H8.9l-1.1 1.4C7 18.5 6.4 19 5.4 19 3.6 19 2.5 17.3 3 15.1l.9-4.1c.5-2.2 2.1-3.5 4.3-3.5Z" />
          <path d="M8 10.5v3M6.5 12h3M16.4 11.2h.1M18 13h.1" />
        </svg>
      ) : type === "brand" ? (
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="m12 3 7.2 4.2v8.3L12 19.7l-7.2-4.2V7.2L12 3Z" />
          <circle cx="12" cy="11.4" r="3.2" />
          <path d="M9.8 17.9 12 21l2.2-3.1" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" focusable="false">
          <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
          <path d="M3.5 8.5h17M8.5 8.5V20M11.5 12h5.5M11.5 15.5H17" />
          <circle cx="6.1" cy="6.25" r=".55" fill="currentColor" stroke="none" />
        </svg>
      )}
    </i>
  );
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
  { key: "campaign", title: "活动节点", single: true, custom: true, options: ["618", "双11", "年货节", "品牌日", "日常大促", "暂不确定"] },
];

export default function NewProject() {
  const [designType, setDesignType] = useState<DesignType>("interaction");
  const [stage, setStage] = useState<ProjectStage>("before");
  const [projectName, setProjectName] = useState("");
  const [projectMode, setProjectMode] = useState("新互动");
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
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
        if (draft.projectMode) setProjectMode(draft.projectMode);
        if (draft.answers) setAnswers(draft.answers);
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
      answers,
      customOpen,
      customValues,
      meetingContext,
      decisionPosture,
    }));
  }, [draftLoaded, designType, stage, projectName, projectMode, answers, customOpen, customValues, meetingContext, decisionPosture]);

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

  const continueFlow = async (forceNewResearch = false) => {
    if (!canContinue) return;
    const draft = { designType, stage, projectName, projectMode, answers, customOpen, customValues, meetingContext, decisionPosture };
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
      window.sessionStorage.setItem("design-lab-start-research", "1");
      window.location.href = "/projects/research";
    } catch {
      createResearchTask(draft);
      setNotice("未连接到研究 Worker，已保存为本地研究任务");
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
          <button type="button" onClick={() => { window.location.href = "/"; }}>保存并退出</button>
        </header>

        <div className="project-form">
          {entryMode ? <StageProgress steps={entryMode === "import" ? ["项目与方案", "识别设计点"] : ["项目与方案", "识别设计点", "上线复盘"]} active={1} /> : <FlowProgress active={1} />}
          <div className="form-intro">
            <p>{entryMode ? "START FROM EXISTING WORK" : "NEW PROJECT"}</p>
            <h1>{entryMode === "retrospective" ? "先补齐项目背景与上线方案。" : entryMode === "import" ? "先补齐项目背景并导入方案。" : "告诉我们你正在做什么。"}</h1>
            <span>{entryMode ? "这些信息只需填写一次，后续识别、评价和复盘都会直接沿用。" : "使用简单选择描述项目，后续将根据这些条件提供相关案例、反馈与策略。"}</span>
          </div>

          <section className="compact-section project-name-section">
            <label htmlFor="project-name">项目名称</label>
            <input id="project-name" value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="例如：618 集卡互动优化" />
          </section>

          {!entryMode && <section className="compact-section">
            <label>设计方向</label>
            <div className="segmented-options">
              <button className={designType === "interaction" ? "selected" : ""} type="button" onClick={() => setDesignType("interaction")}>
                <DesignDirectionIcon type="interaction" /><span><strong>互动设计</strong><small>玩法、流程、反馈与激励</small></span>
              </button>
              <button className={designType === "brand" ? "selected brand-selected" : ""} type="button" onClick={() => { setDesignType("brand"); setProjectMode("品牌新建/升级"); }}>
                <DesignDirectionIcon type="brand" /><span><strong>品牌设计</strong><small>图标、启动屏、品牌 IP 与主视觉</small></span>
              </button>
              <button className={designType === "marketing" ? "selected marketing-selected" : ""} type="button" onClick={() => { setDesignType("marketing"); setProjectMode("大促设计"); }}>
                <DesignDirectionIcon type="marketing" /><span><strong>大促设计</strong><small>大促会场、开屏广告与活动心智</small></span>
              </button>
            </div>
            <div className="project-mode-under-direction">
              <label>项目模式</label>
              <div className="chip-row">
                {(designType === "interaction" ? ["新互动", "已有互动优化"] : designType === "brand" ? ["品牌新建/升级", "现有品牌优化"] : ["大促设计", "现有会场/开屏优化"]).map((item) => (
                  <button className={projectMode === item ? "active" : ""} type="button" key={item} onClick={() => setProjectMode(item)}>{item}</button>
                ))}
              </div>
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
              {(designType === "interaction" ? optionGroups.filter((group) => group.key !== "problem" || projectMode === "已有互动优化") : designType === "brand" ? brandOptionGroups : marketingOptionGroups).map((group) => (
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
                    {group.custom && (
                      <button
                        className={customOpen[group.key] ? "active custom-trigger" : "custom-trigger"}
                        type="button"
                        onClick={() => setCustomOpen((current) => ({ ...current, [group.key]: !current[group.key] }))}
                      >
                        ＋ 自定义
                      </button>
                    )}
                  </div>
                  {group.custom && customOpen[group.key] && (
                    <input
                      className="custom-input"
                      value={customValues[group.key] ?? ""}
                      onChange={(event) => setCustomValues((current) => ({ ...current, [group.key]: event.target.value }))}
                      placeholder={`输入自定义${group.title}`}
                      autoFocus
                    />
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
            <div className="decision-posture-control">
              <span>方向聚焦</span>
              <div>
                <output htmlFor="decision-posture">
                  {decisionPosture < 40 ? "方向聚焦" : decisionPosture > 60 ? "开放探索" : "探索与聚焦并行"}
                </output>
                <input id="decision-posture" type="range" min="0" max="100" step="1" value={decisionPosture} onChange={(event) => setDecisionPosture(Number(event.target.value))} />
              </div>
              <span>开放探索</span>
            </div>
          </section>

          <footer className="form-footer">
            {!canContinue && !entryMode && <span className="form-validation-hint">
              {!projectName.trim() ? "请先填写项目名称" : "请完成必填的项目需求"}
            </span>}
            <button className="secondary-button" type="button" onClick={() => { window.location.href = "/"; }}>取消</button>
            {hasExistingResearch && <button className="secondary-button" type="button" disabled={submitting || !canContinue} onClick={() => { void continueFlow(true); }}>
              按当前需求重新研究
            </button>}
            <button className="continue-button" type="button" disabled={submitting || !canContinue || (!entryMode && stage !== "before")} onClick={() => { void continueFlow(false); }}>
              {entryMode ? "继续识别设计点" : submitting ? "正在创建研究任务…" : hasExistingResearch ? "查看已有研究" : "开始研究"} {!submitting && <img src="/arrow-right-regular.svg" alt="" />}
            </button>
          </footer>
        </div>
      </section>

      {notice && <div className="toast"><i />{notice}</div>}
    </main>
  );
}

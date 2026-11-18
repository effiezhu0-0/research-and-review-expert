"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import DashboardSidebar from "../../components/DashboardSidebar";
import NightingaleIcon from "../../components/NightingaleIcon";
import { extractMeetingPdf, MeetingContext } from "../../lib/meetingNotes";
import { personalAgentHeaders } from "../../lib/personalAgentConfig";
import { saveCurrentProject } from "../../lib/savedProjects";

type DesignType = "interaction" | "brand" | "marketing";
const draftKey = "design-lab-project-draft";
const projectIdKey = "design-lab-current-project-id";

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
    title: "核心目标",
    single: false,
    custom: true,
    options: ["拉新（新增用户数、获客成本）", "促活（DAU、活跃率、参与次数）", "转化（转化率、客单价）", "传播（分享率、拉新人数）", "留存（次日留存、复访率）"],
  },
  { key: "game", title: "游戏类型", single: true, custom: true, options: ["抽奖", "答题", "收集", "养成", "暂不确定"] },
  { key: "problem", title: "当前问题", input: true, single: true, custom: false, options: [] },
  { key: "audience", title: "目标用户", single: false, custom: true, options: ["小镇青年", "小镇中年", "小镇中产", "小镇家庭", "都市蓝领", "都市家庭", "都市Z世代", "都市中产", "银发一族", "学生族"] },
];

const brandOptionGroups = [
  { key: "goal", title: "核心目标", single: false, custom: true, options: ["强化品牌识别", "完成品牌升级", "建立数字一致性", "表达智能能力", "提升年轻感知"] },
  { key: "perception", title: "核心感知", single: false, custom: true, options: ["亲和", "智能", "年轻", "可信", "轻盈", "专业"] },
  { key: "boundary", title: "研究边界", single: false, custom: true, options: ["App Icon", "启动屏", "引导页", "核心界面", "品牌 IP", "数字品牌系统"] },
  { key: "audience", title: "目标用户", single: false, custom: true, options: ["大众用户", "年轻用户", "家庭用户", "专业用户", "银发用户"] },
];

const marketingOptionGroups = [
  { key: "goal", title: "核心目标", single: false, custom: true, options: ["建立大促心智", "突出核心利益", "提升会场分流", "强化商品转化", "保持触点一致"] },
  { key: "perception", title: "核心感知", single: false, custom: true, options: ["热烈", "明确", "可信", "新鲜", "高效", "有品质"] },
  { key: "boundary", title: "研究边界", single: false, custom: true, options: ["电商大促频道会场", "开屏广告"] },
  { key: "campaign", title: "活动节点", single: true, custom: true, options: ["618", "双11", "年货节", "跨年", "中秋节", "端午节", "圣诞节", "七夕", "情人节"] },
  { key: "audience", title: "目标用户", single: false, custom: true, options: ["大众用户", "年轻用户", "家庭用户", "专业用户", "银发用户"] },
];

export default function NewProject() {
  const [designType, setDesignType] = useState<DesignType>("interaction");
  const [projectName, setProjectName] = useState("");
  const projectMode = "需求项目";
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [customOptions, setCustomOptions] = useState<Record<string, string[]>>({});
  const [customOpen, setCustomOpen] = useState<Record<string, boolean>>({});
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [meetingContext, setMeetingContext] = useState<MeetingContext>({});
  const [meetingStatus, setMeetingStatus] = useState("");
  const [readingMeeting, setReadingMeeting] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);

  useEffect(() => {
    const savedDraft = window.localStorage.getItem(draftKey);
    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft);
        if (draft.designType) setDesignType(draft.designType);
        if (typeof draft.projectName === "string") setProjectName(draft.projectName);
        if (draft.answers) setAnswers(draft.answers);
        if (draft.customOptions) setCustomOptions(draft.customOptions);
        if (draft.customOpen) setCustomOpen(draft.customOpen);
        if (draft.customValues) setCustomValues(draft.customValues);
        if (draft.meetingContext) setMeetingContext(draft.meetingContext);
      } catch {
        window.localStorage.removeItem(draftKey);
      }
    }
    setDraftLoaded(true);
  }, []);

  useEffect(() => {
    if (!draftLoaded) return;
    window.localStorage.setItem(draftKey, JSON.stringify({
      designType,
      projectName,
      projectMode,
      answers,
      customOptions,
      customOpen,
      customValues,
      meetingContext,
    }));
  }, [draftLoaded, designType, projectName, answers, customOptions, customOpen, customValues, meetingContext]);

  const canContinue = useMemo(
    () => Boolean(
      projectName.trim()
      && (answers.goal?.length || customValues.goal?.trim())
      && (designType !== "interaction" || answers.game?.length || customValues.game?.trim())
      && (designType === "interaction" || answers.perception?.length || customValues.perception?.trim())
      && (designType === "interaction" || answers.boundary?.length || customValues.boundary?.trim()),
    ),
    [projectName, answers, customValues],
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

  const createProject = () => {
    if (!canContinue) return;
    const id = `project-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const project = { designType, projectName: projectName.trim(), projectMode, answers, customOpen, customValues, meetingContext };
    const saved = { id, taskId: id, name: projectName.trim(), kind: projectKind(designType), stage: "项目需求", progress: 0, savedAt: new Date().toISOString(), route: "/projects/overview", project };
    saveCurrentProject(saved);
    window.localStorage.setItem(projectIdKey, id);
    window.localStorage.setItem(draftKey, JSON.stringify(project));
    window.localStorage.removeItem("design-lab-active-research-task");
    window.location.href = `/projects/overview?projectId=${encodeURIComponent(id)}`;
  };

  return (
    <main className="new-project-page">
      <DashboardSidebar />

      <section className="project-form-shell">
        <header className="project-topbar">
          <div><span>新建项目</span><b>/</b><strong>项目需求</strong></div>
        </header>

        <div className="project-form">
          <div className="form-intro">
            <p>NEW PROJECT</p>
            <h1>告诉我们你正在做什么。</h1>
            <span>每个项目对应一项需求；项目背景和目标将在本项目的用户调研、视觉调研、策略与评审中共同使用。</span>
          </div>

          <section className="compact-section project-name-section">
            <label htmlFor="project-name">项目名称</label>
            <input id="project-name" value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="例如：618 集卡互动优化" />
          </section>

          <section className="compact-section">
            <label>设计方向</label>
            <div className="segmented-options">
              {designDirections.map((direction) => <DesignDirectionCard key={direction.type} direction={direction} selected={designType === direction.type} onSelect={setDesignType} />)}
            </div>
          </section>

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
                  <span><NightingaleIcon name="arrowUp" size={20} /></span><b>{meetingContext.fileName || "拖拽或上传 PDF 会议纪要 / 项目 PRD"}</b>
                </label>
                {meetingContext.extractedText && <button className="remove-pdf" type="button" onClick={() => { setMeetingContext((current) => ({ link: current.link })); setMeetingStatus("已移除 PDF 会议纪要"); }}>移除</button>}
              </div>
              <input className="meeting-link" value={meetingContext.link || ""} onChange={(event) => setMeetingContext((current) => ({ ...current, link: event.target.value }))} placeholder="粘贴会议纪要、Relay、PRD 或网页链接" type="url" aria-label="项目背景链接" />
            </div>
            <div className="meeting-context-actions"><button type="button" disabled={readingMeeting || (!meetingContext.extractedText && !meetingContext.link?.trim())} onClick={() => { void summarizeMeeting(); }}>{readingMeeting ? "读取并填写中…" : "读取并自动填写"}</button></div>
            {meetingStatus && <div className="meeting-context-status"><span>{meetingStatus}</span></div>}
            {meetingContext.keyPoints?.length ? <ol className="meeting-key-points">{meetingContext.keyPoints.map((point) => <li key={point}>{point}</li>)}</ol> : null}
          </section>

          {(designType === "interaction" ? optionGroups : designType === "brand" ? brandOptionGroups : marketingOptionGroups).map((group) => (
            <Fragment key={group.key}>
            {"input" in group && group.input ? <section className="field-section">
              <div className="field-heading"><label htmlFor={`${group.key}-input`}>{group.title}</label></div>
              <input id={`${group.key}-input`} className="game-type-input" value={customValues[group.key] || answers[group.key]?.join("、") || ""} onChange={(event) => { setCustomValues((current) => ({ ...current, [group.key]: event.target.value })); setAnswers((current) => ({ ...current, [group.key]: [] })); }} placeholder={`请输入${group.title}`} />
            </section> : <section className="field-section">
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
                </section>}
            </Fragment>
          ))}
          <footer className="form-footer">
            {!canContinue && <span className="form-validation-hint">{!projectName.trim() ? "请先填写项目名称" : "请完成必填的项目需求"}</span>}
            <button className="secondary-button" type="button" onClick={() => { window.location.href = "/"; }}>取消</button>
            <button className="continue-button" type="button" disabled={!canContinue} onClick={createProject}>创建项目</button>
          </footer>
        </div>
      </section>

    </main>
  );
}

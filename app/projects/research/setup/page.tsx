"use client";

import { useEffect, useState, type CSSProperties } from "react";
import DashboardSidebar from "../../../components/DashboardSidebar";
import NightingaleIcon from "../../../components/NightingaleIcon";
import ProjectTopbar from "../../../components/ProjectTopbar";
import { personalAgentHeaders } from "../../../lib/personalAgentConfig";
import { personalIdentityHeaders } from "../../../lib/personalIdentity";
import { readSavedProjects, saveCurrentProject } from "../../../lib/savedProjects";
import { normalizeDesignField } from "../../../lib/researchProfiles";

type Mode = "play" | "visual";
type VisualResearchPath = "trend" | "existing";
const platforms = [
  { id: "xiaohongshu", label: "小红书", detail: "帖子与评论" },
  { id: "weibo", label: "微博", detail: "相关讨论" },
  { id: "voiceOfUser", label: "用户之声", detail: "用户问题与体验" },
];

export default function ResearchSetupPage() {
  const [mode, setMode] = useState<Mode>("play");
  const [visualResearchPath, setVisualResearchPath] = useState<VisualResearchPath>("trend");
  const [visualDirections, setVisualDirections] = useState<string[]>([]);
  const [visualDirectionDraft, setVisualDirectionDraft] = useState("");
  const [projectId, setProjectId] = useState("");
  const [project, setProject] = useState<Record<string, unknown>>({});
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [platformsSelected, setPlatformsSelected] = useState<string[]>(["xiaohongshu", "weibo", "voiceOfUser"]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [openness, setOpenness] = useState(50);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextMode = params.get("mode") === "visual" ? "visual" : "play";
    setMode(nextMode);
    const id = params.get("projectId") || window.localStorage.getItem("design-lab-current-project-id") || "";
    setProjectId(id);
    const saved = readSavedProjects().find((item) => item.id === id);
    try {
      const draft = saved?.project || JSON.parse(window.localStorage.getItem("design-lab-project-draft") || "{}");
      setProject(draft);
      setVisualResearchPath(draft.visualResearchPath === "existing" ? "existing" : "trend");
      if (Array.isArray(draft.visualDirections)) setVisualDirections(draft.visualDirections.map((item: unknown) => typeof item === "string" ? item : String((item as { label?: unknown })?.label || "")).filter(Boolean));
      if (typeof draft.decisionPosture === "number") setOpenness(draft.decisionPosture);
    } catch { setProject({}); }
  }, []);

  const designType = normalizeDesignField(String(project.designType || "interaction"));
  const addKeyword = (value: string) => {
    const keyword = value.trim().replace(/[，,、;；]+$/g, "");
    if (!keyword) return;
    setKeywords((current) => current.includes(keyword) ? current : [...current, keyword]);
    setKeywordDraft("");
  };
  const addVisualDirection = (value: string) => {
    const direction = value.trim();
    if (!direction) return;
    setVisualDirections((current) => current.includes(direction) ? current : [...current, direction]);
    setVisualDirectionDraft("");
  };
  const recommendKeywords = async () => {
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/research/keywords", { method: "POST", headers: { "content-type": "application/json", ...personalAgentHeaders() }, body: JSON.stringify(project) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "关键词建议生成失败");
      setRecommendations(Array.isArray(data.keywords) ? data.keywords : []);
    } catch (error) { setNotice(error instanceof Error ? error.message : "关键词建议生成失败"); }
    finally { setBusy(false); }
  };

  const validDateRange = (!startDate && !endDate) || Boolean(startDate && endDate && startDate <= endDate);
  const canStart = mode === "visual"
    ? visualResearchPath === "trend" || visualDirections.length > 0
    : keywords.length > 0 && platformsSelected.length > 0 && validDateRange;
  const startResearch = async () => {
    if (!canStart || busy) return;
    setBusy(true); setNotice("");
    const researchDraft = { ...project, ...(projectId ? { projectMode: "需求项目" } : {}), researchMode: mode, decisionPosture: openness,
      ...(mode === "visual" ? { visualResearchPath, ...(visualResearchPath === "existing" ? { visualDirections: visualDirections.map((label) => ({ label, rationale: "用户提供的已有视觉方向" })) } : {}) } : {}),
      ...(mode === "play" ? { researchKeywords: keywords, feedbackPlatforms: platformsSelected, feedbackStartDate: startDate, feedbackEndDate: endDate } : {}) };
    window.localStorage.setItem("design-lab-project-draft", JSON.stringify(researchDraft));
    try {
      const response = await fetch("/api/research/tasks", { method: "POST", headers: { "content-type": "application/json", ...personalIdentityHeaders() }, body: JSON.stringify({ projectId, project: researchDraft }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "研究任务创建失败");
      window.localStorage.setItem("design-lab-active-research-task", data.id);
      const savedProject = readSavedProjects().find((item) => item.id === projectId);
      if (savedProject) saveCurrentProject({ ...savedProject, taskId: data.id, taskIds: [...(savedProject.taskIds || []), data.id], stage: mode === "visual" ? "视觉研究" : "用户研究", progress: 10, savedAt: new Date().toISOString(), route: "/projects/research", project: savedProject.project });
      window.sessionStorage.setItem("design-lab-start-research", "1");
      window.location.href = "/projects/research";
    } catch (error) { setNotice(error instanceof Error ? error.message : "研究任务创建失败"); setBusy(false); }
  };

  return <main className="research-page research-setup-page">
    <DashboardSidebar projectActive />
    <section className="research-main">
      <ProjectTopbar section={mode === "visual" ? "视觉研究设置" : "用户研究设置"} />
      <div className="research-content research-setup-content">
        <header className="solution-hero"><p>{mode === "visual" ? "VISUAL RESEARCH" : "USER RESEARCH"}</p><h1>{mode === "visual" ? "设置视觉研究范围。" : "设置本次用户研究。"}</h1><span>项目「{String(project.projectName || "未命名项目")}」的需求背景会自动用于本次研究。每次调研的设置和结果单独保存。</span></header>
        {mode === "visual" ? <>
          <section className="workflow-section visual-research-path-section"><div className="workflow-heading"><div><small>01</small><h2>选择视觉研究方式</h2></div></div><div className="visual-research-path-options">
            <button type="button" className={visualResearchPath === "trend" ? "selected" : ""} aria-pressed={visualResearchPath === "trend"} onClick={() => setVisualResearchPath("trend")}><strong>视觉趋势分析</strong><span>结合小红书案例与官方趋势，生成可确认的视觉方向，再采集参考图。</span></button>
            <button type="button" className={visualResearchPath === "existing" ? "selected" : ""} aria-pressed={visualResearchPath === "existing"} onClick={() => setVisualResearchPath("existing")}><strong>已有方向的采集</strong><span>输入已确定的视觉方向，系统直接搜索并收集相关参考图。</span></button>
          </div>{visualResearchPath === "existing" && <div className="visual-direction-input"><label htmlFor="visual-direction-input">已有视觉方向</label><div><input id="visual-direction-input" value={visualDirectionDraft} onChange={(event) => setVisualDirectionDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === "," || event.key === "，") { event.preventDefault(); addVisualDirection(visualDirectionDraft); } }} placeholder="输入一个方向后按回车添加" /><button type="button" disabled={!visualDirectionDraft.trim()} onClick={() => addVisualDirection(visualDirectionDraft)}>添加</button></div>{visualDirections.length > 0 && <ul>{visualDirections.map((direction) => <li key={direction}><span>{direction}</span><button type="button" aria-label={`移除${direction}`} onClick={() => setVisualDirections((current) => current.filter((item) => item !== direction))}>×</button></li>)}</ul>}</div>}</section>
          {visualResearchPath === "trend" && <section className="workflow-section"><div className="workflow-heading"><div><small>02</small><h2>研究开放度</h2></div></div><p className="research-setup-copy">控制趋势分析的探索范围。</p><div className="decision-posture-control" style={{ "--slider-value": `${openness}%` } as CSSProperties}><input type="range" min="0" max="100" value={openness} onChange={(event) => setOpenness(Number(event.target.value))} aria-label="研究开放度" /><div className="decision-posture-range-labels"><span>方向聚焦</span><span>开放探索</span></div></div></section>}
        </> : <>
          <section className="workflow-section"><div className="workflow-heading"><div><small>01</small><h2>搜索关键词</h2></div><span>必填，严格按已选关键词搜索</span></div><div className="research-keyword-entry"><input value={keywordDraft} onChange={(event) => setKeywordDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === "," || event.key === "，") { event.preventDefault(); addKeyword(keywordDraft); } }} placeholder="输入关键词后按回车" /><button type="button" className="keyword-recommend-button" disabled={busy} onClick={() => void recommendKeywords()}>{busy ? "生成中…" : "生成"}</button></div>{keywords.length > 0 && <div className="research-keyword-chips">{keywords.map((keyword) => <button type="button" key={keyword} onClick={() => setKeywords((current) => current.filter((item) => item !== keyword))}>{keyword}<span>×</span></button>)}</div>}{recommendations.length > 0 && <div className="research-keyword-suggestions"><span>推荐关键词</span>{recommendations.map((keyword) => <button type="button" key={keyword} onClick={() => addKeyword(keyword)}>{keyword} +</button>)}</div>}</section>
          <section className="workflow-section"><div className="workflow-heading"><div><small>02</small><h2>采集来源</h2></div></div>{designType === "interaction" ? <><p className="research-setup-copy">选择本次采集的平台。</p><div className="feedback-platform-options">{platforms.map((item) => { const checked = platformsSelected.includes(item.id); return <button type="button" key={item.id} className={checked ? "selected" : ""} aria-pressed={checked} onClick={() => setPlatformsSelected((current) => checked ? current.filter((id) => id !== item.id) : [...current, item.id])}><span className="feedback-platform-check">{checked ? "✓" : ""}</span><span><strong>{item.label}</strong><small>{item.detail}</small></span></button>; })}</div></> : <p className="research-setup-copy">本次按 {designType === "brand" ? "品牌" : "大促"}研究配置的来源采集。</p>}</section>
          <section className="workflow-section"><div className="workflow-heading"><div><small>03</small><h2>采集时间范围</h2></div><span>可选</span></div><div className="feedback-date-range"><div><input aria-label="反馈开始日期" type="date" value={startDate} max={endDate || undefined} onChange={(event) => setStartDate(event.target.value)} /><span>至</span><input aria-label="反馈结束日期" type="date" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} /></div>{!validDateRange && <small className="feedback-range-error">请填写完整且有效的日期范围</small>}</div></section>
        </>}
        {notice && <p className="research-setup-error" role="alert">{notice}</p>}
        <footer className="workflow-footer"><button className="secondary-button" type="button" onClick={() => { window.location.href = `/projects/overview?projectId=${encodeURIComponent(projectId)}`; }}>取消</button><button className="primary-workflow-button" type="button" disabled={!canStart || busy} onClick={() => void startResearch()}>{busy ? "正在创建…" : <>{mode === "visual" ? visualResearchPath === "existing" ? "收集参考图" : "开始趋势分析" : "开始研究"} <NightingaleIcon name="arrowRight" size={18} /></>}</button></footer>
      </div>
    </section>
  </main>;
}

"use client";

import { useEffect, useState } from "react";
import DashboardSidebar from "../../components/DashboardSidebar";
import NightingaleIcon from "../../components/NightingaleIcon";
import PlatformLogo from "../../components/PlatformLogo";
import { readSavedProjects, saveCurrentProject, SavedProject } from "../../lib/savedProjects";
import { readSolutionForProject, solutionReviewStorageKey, SolutionPackage } from "../../lib/localSolutionStore";
import { personalIdentityHeaders } from "../../lib/personalIdentity";
import { downloadVisualMoodboard } from "../../lib/exportVisualMoodboard";

type Candidate = { id: string; taskId?: string; source?: string; title: string; url?: string; author?: string; publishedAt?: string; capturedAt?: string; excerpt?: string; screenshotKey?: string; mediaKeys?: string[]; valuableComments?: string[] };
type Evidence = { id: string; taskId?: string; sourceLabel?: string; title: string; originalText: string; author?: string; publishedAt?: string; url?: string; observableFact?: string; designInterpretation?: string; projectImplication?: string; screenshotKey?: string };
type VisualSample = { id: string; taskId?: string; platform: string; projectTitle: string; projectUrl: string; imageUrl?: string; screenshotKey?: string; author?: string; publishedAt?: string; capturedAt?: string; trendLabel: string; visualFeatures?: string[]; analysisReason?: string; referenceType?: string; relevanceScore?: number };
type ProjectResearchTask = { id: string; createdAt?: string; mode?: string; directions: string[] };
type StrategyResult = { summary?: string; opportunities?: Array<{ title: string; detail: string; metric: string }>; strategies?: Array<{ title: string; action: string; metric: string; risk?: string }>; directions?: Array<{ title: string; summary: string; flow?: string[]; points?: string[]; test?: string }> };

const tabs = ["用户反馈", "设计策略与方向", "视觉参考", "方案与评审"] as const;
const answerLabels: Record<string, string> = { goal: "核心目标", game: "游戏类型", audience: "目标用户", problem: "当前问题", perception: "核心感知", boundary: "研究范围", campaign: "活动节点" };
const formatVisualDate = (value?: string) => {
  const match = value?.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  return match ? `${match[1]}.${match[2].padStart(2, "0")}.${match[3].padStart(2, "0")}` : "";
};
const summarizeVisualDescription = (sample: VisualSample) => {
  const source = (sample.analysisReason || sample.visualFeatures?.join("、") || "").replace(/\s+/g, " ").trim();
  if (!source) return "";
  const sentence = source.split(/[。！？!?]/, 1)[0].trim();
  const concise = sentence.length > 46 ? `${sentence.slice(0, 45).replace(/[，、；：,;:]$/, "")}…` : sentence;
  return concise ? `${concise.replace(/[。！？!?…]$/, "")}。` : "";
};
type OverviewTab = typeof tabs[number];

const editOptionGroups: Record<string, Array<{ key: string; label: string; options: string[]; multiple: boolean }>> = {
  互动设计: [
    { key: "goal", label: "核心目标", multiple: true, options: ["拉新（新增用户数、获客成本）", "促活（DAU、活跃率、参与次数）", "转化（转化率、客单价）", "传播（分享率、拉新人数）", "留存（次日留存、复访率）"] },
    { key: "game", label: "游戏类型", multiple: false, options: [] },
    { key: "problem", label: "当前问题", multiple: true, options: ["玩法不明确", "开始率低", "完成率低", "分享率低", "转化率低"] },
    { key: "audience", label: "目标用户", multiple: true, options: ["小镇青年", "小镇中年", "小镇中产", "小镇家庭", "都市蓝领", "都市家庭", "都市Z世代", "都市中产", "银发一族", "学生族"] },
  ],
  品牌设计: [
    { key: "goal", label: "核心目标", multiple: true, options: ["强化品牌识别", "完成品牌升级", "建立数字一致性", "表达智能能力", "提升年轻感知"] },
    { key: "perception", label: "核心感知", multiple: true, options: ["亲和", "智能", "年轻", "可信", "轻盈", "专业"] },
    { key: "boundary", label: "研究边界", multiple: true, options: ["App Icon", "启动屏", "引导页", "核心界面", "品牌 IP", "数字品牌系统"] },
    { key: "audience", label: "目标用户", multiple: true, options: ["大众用户", "年轻用户", "家庭用户", "专业用户", "银发用户"] },
  ],
  大促设计: [
    { key: "goal", label: "核心目标", multiple: true, options: ["建立大促心智", "突出核心利益", "提升会场分流", "强化商品转化", "保持触点一致"] },
    { key: "perception", label: "核心感知", multiple: true, options: ["热烈", "明确", "可信", "新鲜", "高效", "有品质"] },
    { key: "boundary", label: "研究边界", multiple: true, options: ["电商大促频道会场", "开屏广告"] },
    { key: "campaign", label: "活动节点", multiple: false, options: ["618", "双11", "年货节", "跨年", "中秋节", "端午节", "圣诞节", "七夕", "情人节"] },
    { key: "audience", label: "目标用户", multiple: true, options: ["大众用户", "年轻用户", "家庭用户", "专业用户", "银发用户"] },
  ],
};

function ProjectDropdown({ label, options, values, multiple, onChange }: { label: string; options: string[]; values: string[]; multiple: boolean; onChange: (values: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const menuOptions = [...new Set([...options, ...values])];
  return <div className="project-overview-dropdown-field">
    <label>{label}</label>
    <button type="button" className="project-overview-dropdown-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <span className={values.length ? "" : "placeholder"}>{values.length ? values.join("、") : "请选择"}</span><NightingaleIcon name="chevronDown" size={20} />
    </button>
    {open && <div className={`project-overview-dropdown-menu${multiple ? " multiple" : ""}`} role="listbox" aria-multiselectable={multiple}>{menuOptions.map((option) => {
      const selected = values.includes(option);
      return <button key={option} type="button" role="option" aria-selected={selected} onClick={() => {
        if (multiple) onChange(selected ? values.filter((item) => item !== option) : [...values, option]);
        else { onChange([option]); setOpen(false); }
      }}>{multiple && <span className="project-overview-dropdown-checkbox" aria-hidden="true">{selected && <NightingaleIcon name="check" size={16} />}</span>}<span className="project-overview-dropdown-option-label">{option}</span>{!multiple && selected && <NightingaleIcon name="check" size={16} />}</button>;
    })}</div>}
  </div>;
}

function EmptyTab({ children, action }: { children: string; action?: { label: string; onClick: () => void; icon?: boolean } }) {
  return <div className="project-overview-empty"><NightingaleIcon name="file" size={24} /><strong>这里还没有内容</strong><span>{children}</span>{action && <button className="project-overview-action project-overview-action-primary" type="button" onClick={action.onClick}>{action.label}{action.icon && <NightingaleIcon className="project-overview-action-icon" name="arrowRight" size={16} />}</button>}</div>;
}

function conciseCopy(value: string, limit = 90) {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > limit ? `${compact.slice(0, limit)}…` : compact;
}

function conciseSummary(value: string) {
  const compact = value.replace(/\s+/g, " ").trim();
  const sentences = compact.match(/[^。！？!?；;]+[。！？!?；;]?/g)?.filter((sentence) => sentence.trim()) || [];
  return sentences.length ? conciseCopy(sentences[0].trim(), 90) : conciseCopy(compact, 90);
}

export default function ProjectOverviewPage() {
  const [project, setProject] = useState<SavedProject | null>(null);
  const [tab, setTab] = useState<OverviewTab>("用户反馈");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [visualSamples, setVisualSamples] = useState<VisualSample[]>([]);
  const [researchTasks, setResearchTasks] = useState<ProjectResearchTask[]>([]);
  const [exportingVisuals, setExportingVisuals] = useState(false);
  const [visualExportNotice, setVisualExportNotice] = useState("");
  const [strategy, setStrategy] = useState<StrategyResult | null>(null);
  const [solution, setSolution] = useState<SolutionPackage | null>(null);
  const [review, setReview] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [managingFeedback, setManagingFeedback] = useState(false);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [deletingCandidates, setDeletingCandidates] = useState(false);
  const [editName, setEditName] = useState("");
  const [editKind, setEditKind] = useState("");
  const [editBrief, setEditBrief] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const projectId = new URLSearchParams(window.location.search).get("projectId") || window.localStorage.getItem("design-lab-current-project-id") || "";
    const saved = readSavedProjects().find((item) => item.id === projectId) || null;
    if (!saved) {
      setLoading(false);
      return;
    }
    setProject(saved);
    window.localStorage.setItem("design-lab-current-project-id", saved.id);
    window.localStorage.setItem("design-lab-project-draft", JSON.stringify(saved.project));

    const matchingSolution = readSolutionForProject(saved.id);
    setSolution(matchingSolution);
    try {
      const savedReview = JSON.parse(window.localStorage.getItem(solutionReviewStorageKey(saved.id)) || "null");
      setReview(matchingSolution ? savedReview : null);
    } catch { setReview(null); }
    let stopped = false;
    const load = async () => {
      const linkedResponse = await fetch(`/api/research/projects/${encodeURIComponent(saved.id)}/tasks?name=${encodeURIComponent(saved.name)}`, { cache: "no-store", headers: personalIdentityHeaders() }).catch(() => null);
      const linkedData = linkedResponse?.ok ? await linkedResponse.json().catch(() => null) : null;
      if (Array.isArray(linkedData?.tasks)) setResearchTasks(linkedData.tasks);
      const taskIds = [...new Set([...(Array.isArray(linkedData?.taskIds) ? linkedData.taskIds : []), ...(saved.taskIds || []), saved.taskId].filter((id) => typeof id === "string" && id.startsWith("research-")))];
      if (stopped) return;
      if (taskIds.length) {
        const updated = { ...saved, taskId: taskIds[0], taskIds };
        setProject(updated);
        saveCurrentProject(updated);
        window.localStorage.setItem("design-lab-active-research-task", taskIds[0]);
      }
      const results = await Promise.all(taskIds.map(async (taskId) => {
        const [candidateResponse, evidenceResponse, strategyResponse, visualResponse] = await Promise.all([
          fetch(`/api/research/tasks/${taskId}/candidates`, { cache: "no-store" }).catch(() => null),
          fetch(`/api/research/tasks/${taskId}/evidence`, { cache: "no-store" }).catch(() => null),
          fetch(`/api/research/tasks/${taskId}/strategies`, { cache: "no-store" }).catch(() => null),
          fetch(`/api/research/tasks/${taskId}/visual-samples`, { cache: "no-store" }).catch(() => null),
        ]);
        const [candidateData, evidenceData, strategyData, visualData] = await Promise.all([
          candidateResponse?.ok ? candidateResponse.json() : null,
          evidenceResponse?.ok ? evidenceResponse.json() : null,
          strategyResponse?.ok ? strategyResponse.json() : null,
          visualResponse?.ok ? visualResponse.json() : null,
        ]);
        return { candidates: candidateData?.candidates || [], evidence: evidenceData?.evidence || [], strategy: strategyData?.strategy || null, samples: visualData?.samples || [] };
      }));
      if (stopped) return;
      setCandidates(results.flatMap((result) => result.candidates));
      setEvidence(results.flatMap((result) => result.evidence));
      setStrategy(results.find((result) => result.strategy)?.strategy || null);
      setVisualSamples(results.flatMap((result) => result.samples));
      setLoading(false);
    };
    void load();
    return () => { stopped = true; };
  }, []);

  const draft = project?.project || {};
  const briefValues = Object.entries(answerLabels).flatMap(([key, label]) => {
    const answers = (draft.answers && typeof draft.answers === "object" ? draft.answers : {}) as Record<string, string[]>;
    const custom = (draft.customValues && typeof draft.customValues === "object" ? draft.customValues : {}) as Record<string, string>;
    const values = [...(answers[key] || []), ...(custom[key]?.trim() ? [custom[key].trim()] : [])];
    return values.length ? [{ label, value: values.join("、") }] : [];
  });

  if (!project) return <main className="app-shell"><DashboardSidebar active="projects" /><section className="workspace"><header className="topbar"><div className="crumb"><span>工作空间</span><b>/</b><strong>项目</strong></div></header><div className="project-overview-missing"><strong>没有找到这个项目</strong><span>它可能已被删除，或链接已经失效。</span><button type="button" onClick={() => { window.location.href = "/"; }}>返回首页</button></div></section></main>;

  const candidatesWithFeedback = candidates.filter((item) => item.source !== "xiaohongshu_visual");
  const toggleCandidateSelection = (candidateId: string) => setSelectedCandidateIds((current) => current.includes(candidateId) ? current.filter((id) => id !== candidateId) : [...current, candidateId]);
  const deleteCandidates = async (candidateIds: string[]) => {
    if (!candidateIds.length || !project || deletingCandidates) return;
    const message = candidateIds.length === 1 ? "确定删除这条帖子及其已保存截图吗？" : `确定删除选中的 ${candidateIds.length} 条帖子及其已保存截图吗？`;
    if (!window.confirm(message)) return;
    setDeletingCandidates(true);
    try {
      const grouped = new Map<string, string[]>();
      for (const item of candidatesWithFeedback.filter((candidate) => candidateIds.includes(candidate.id))) {
        const taskId = item.taskId || project.taskId;
        grouped.set(taskId, [...(grouped.get(taskId) || []), item.id]);
      }
      const responses = await Promise.all([...grouped].map(async ([taskId, ids]) => {
        const response = await fetch(`/api/research/tasks/${taskId}/candidates`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidateIds: ids }) });
        if (!response.ok) throw new Error("删除帖子失败");
        return response.json();
      }));
      const deletedIds = responses.flatMap((result) => result.deletedIds || []);
      setCandidates((current) => current.filter((item) => !deletedIds.includes(item.id)));
      setSelectedCandidateIds((current) => current.filter((id) => !deletedIds.includes(id)));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "删除帖子失败，请稍后重试。");
    } finally {
      setDeletingCandidates(false);
    }
  };
  const toggleSelectAllCandidates = () => setSelectedCandidateIds(selectedCandidateIds.length === candidatesWithFeedback.length ? [] : candidatesWithFeedback.map((item) => item.id));
  const sourceLabel = (source?: string) => source === "weibo" ? "微博" : source === "voice_of_user" ? "用户之声" : source === "xiaohongshu" ? "小红书" : source || "研究案例";
  const visualDirectionGroups = (() => {
    const taskOrder = [...researchTasks.filter((task) => task.mode === "visual").map((task) => task.id), ...visualSamples.map((sample) => sample.taskId || project.taskId)].filter((id, index, all) => Boolean(id) && all.indexOf(id) === index);
    return taskOrder.flatMap((taskId) => {
      const taskSamples = visualSamples.filter((sample) => (sample.taskId || project.taskId) === taskId);
      if (!taskSamples.length) return [];
      const task = researchTasks.find((item) => item.id === taskId);
      const labels = [...new Set([...(task?.directions || []), ...taskSamples.map((sample) => sample.trendLabel.trim()).filter(Boolean)])];
      return labels.map((label) => ({
        key: `${taskId}:${label}`,
        taskId,
        label,
        roundDate: task?.createdAt ? new Date(task.createdAt).toLocaleDateString("zh-CN") : "",
        samples: taskSamples.filter((sample) => sample.trendLabel.trim().toLocaleLowerCase() === label.trim().toLocaleLowerCase())
          .slice().sort((a, b) => Number(b.relevanceScore || 0) - Number(a.relevanceScore || 0)),
      })).filter((group) => group.samples.length);
    });
  })();
  const exportVisualReferences = async () => {
    if (!project || !visualDirectionGroups.length || exportingVisuals) return;
    setExportingVisuals(true);
    setVisualExportNotice("");
    try {
      const result = await downloadVisualMoodboard(project.name, visualDirectionGroups.map((group) => ({
        title: group.label,
        samples: group.samples.map((sample) => ({ ...sample, taskId: sample.taskId || group.taskId })),
      })));
      setVisualExportNotice(result.unavailableImages ? `HTML 已导出；${result.unavailableImages} 张图片暂时无法读取，已保留文字和来源链接。` : "HTML 文件已导出，可在浏览器下载记录中打开。");
    } catch (error) {
      setVisualExportNotice(error instanceof Error ? error.message : "HTML 导出失败，请稍后重试。");
    } finally { setExportingVisuals(false); }
  };
  const editGroups = editOptionGroups[editKind] || editOptionGroups["互动设计"];
  const startEditing = () => {
    const sourceAnswers = (draft.answers && typeof draft.answers === "object" ? draft.answers : {}) as Record<string, string[]>;
    const sourceCustom = (draft.customValues && typeof draft.customValues === "object" ? draft.customValues : {}) as Record<string, string>;
    setEditName(project.name);
    setEditKind(project.kind);
    setEditBrief(Object.fromEntries(Object.keys(answerLabels).map((key) => [key, [...(sourceAnswers[key] || []), ...(sourceCustom[key] ? [sourceCustom[key]] : [])]])));
    setEditing(true);
  };
  const saveEdits = () => {
    const answers = Object.fromEntries(editGroups.map(({ key }) => [key, editBrief[key] || []]));
    const updated: SavedProject = { ...project, name: editName.trim() || project.name, kind: editKind, savedAt: new Date().toISOString(), project: { ...project.project, projectName: editName.trim() || project.name, projectMode: "需求项目", designType: editKind === "品牌设计" ? "brand" : editKind === "大促设计" ? "marketing" : "interaction", answers, customValues: {} } };
    saveCurrentProject(updated);
    setProject(updated);
    window.dispatchEvent(new Event("design-lab-projects-updated"));
    window.localStorage.setItem("design-lab-current-project-id", updated.id);
    window.localStorage.setItem("design-lab-project-draft", JSON.stringify(updated.project));
    setEditing(false);
  };
  const openResearch = (mode: "play" | "visual") => {
    const researchProject = { ...project.project, researchMode: mode };
    window.localStorage.setItem("design-lab-current-project-id", project.id);
    window.localStorage.removeItem("design-lab-active-research-task");
    window.localStorage.setItem("design-lab-project-draft", JSON.stringify(researchProject));
    window.location.href = `/projects/research/setup?mode=${mode}&projectId=${encodeURIComponent(project.id)}`;
  };
  const openSolutionReview = () => {
    window.localStorage.removeItem(solutionReviewStorageKey(project.id));
    window.localStorage.setItem("design-lab-current-project-id", project.id);
    window.localStorage.setItem("design-lab-project-draft", JSON.stringify(project.project));
    window.location.href = `/projects/import?projectId=${encodeURIComponent(project.id)}`;
  };

  return <main className="app-shell project-overview-page">
    <DashboardSidebar active="project" />
    <section className="workspace">
      <header className="topbar"><div className="crumb"><a href="/">全部项目</a><b>/</b><strong>{project.name}</strong></div></header>
      <div className="project-overview-content">
        <section className={`project-overview-hero ${editing ? "is-editing" : ""}`}>
          {!editing ? <>
            <div className="project-overview-heading"><div className="project-overview-title-row"><span className={`type-pill ${project.kind === "品牌设计" ? "brand-type" : project.kind === "大促设计" ? "marketing-type" : "interaction-type"}`}>{project.kind}</span><h1>{project.name}</h1></div><div className="project-overview-top-info">{briefValues.map((item) => <span className="project-overview-info-item" key={item.label}><span className="project-overview-info-label">{item.label}</span><span className="project-overview-info-value">{item.value}</span></span>)}</div></div>
            <button className="project-overview-edit" type="button" aria-label="编辑项目背景" title="编辑项目背景" onClick={startEditing}><img src="/pencil-line-1-regular.svg" alt="" /></button>
          </> : <div className="project-overview-inline-editor">
            <label>项目名称<input value={editName} onChange={(event) => setEditName(event.target.value)} /></label>
            <ProjectDropdown label="设计类型" options={["互动设计", "品牌设计", "大促设计"]} values={[editKind]} multiple={false} onChange={(values) => setEditKind(values[0] || "互动设计")} />
            {editGroups.map((group) => group.key === "game" ? <label className="project-overview-dropdown-field" key={group.key}>{group.label}<input className="game-type-input" value={editBrief.game?.join("、") || ""} placeholder="请输入游戏类型" onChange={(event) => setEditBrief((current) => ({ ...current, game: event.target.value ? [event.target.value] : [] }))} /></label> : <ProjectDropdown key={group.key} label={group.label} options={group.options} values={editBrief[group.key] || []} multiple={group.multiple} onChange={(values) => setEditBrief((current) => ({ ...current, [group.key]: values }))} />)}
            <div className="project-overview-edit-actions"><button type="button" onClick={() => setEditing(false)}>取消</button><button type="button" onClick={saveEdits}>保存更改</button></div>
          </div>}
        </section>
        <div className="project-overview-tab-content">
        <nav className="project-overview-tabs" aria-label="项目内容">
          {tabs.map((item) => <button key={item} type="button" className={tab === item ? "active" : ""} aria-current={tab === item ? "page" : undefined} onClick={() => setTab(item)}>{item}</button>)}
        </nav>

        {tab === "用户反馈" && <div className="project-overview-panel"><div className="project-overview-section-heading"><div><small>USER FEEDBACK</small><h2>用户反馈与研究案例</h2></div><div className="project-overview-feedback-actions"><span>{candidatesWithFeedback.length + evidence.length} 条记录</span>{!loading && (candidatesWithFeedback.length || evidence.length) > 0 && <button className="project-overview-action project-overview-action-secondary" type="button" onClick={() => openResearch("play")}>再次采集</button>}{candidatesWithFeedback.length > 0 && (!managingFeedback ? <button className="project-overview-bulk-manage" type="button" aria-label="批量管理" title="批量管理" onClick={() => setManagingFeedback(true)}><NightingaleIcon name="list" size={20} /></button> : <><button type="button" onClick={toggleSelectAllCandidates}>{selectedCandidateIds.length === candidatesWithFeedback.length ? "取消全选" : "全选帖子"}</button><button type="button" disabled={!selectedCandidateIds.length || deletingCandidates} onClick={() => void deleteCandidates(selectedCandidateIds)}>{deletingCandidates ? "删除中…" : `删除所选${selectedCandidateIds.length ? `（${selectedCandidateIds.length}）` : ""}`}</button><button type="button" onClick={() => { setManagingFeedback(false); setSelectedCandidateIds([]); }}>完成</button></>)}</div></div>{loading ? <EmptyTab>正在读取项目已有的反馈和案例。</EmptyTab> : candidatesWithFeedback.length || evidence.length ? <div className="project-overview-card-grid">
          {candidatesWithFeedback.map((item) => <article className={`project-overview-evidence-card${(item.screenshotKey || item.mediaKeys?.length) ? " has-screenshot" : ""}${managingFeedback && selectedCandidateIds.includes(item.id) ? " is-selected" : ""}`} key={item.id}>
            {(item.screenshotKey || item.mediaKeys?.length) && <img src={item.mediaKeys?.length ? `/api/research/tasks/${item.taskId || project.taskId}/candidates/${item.id}/media/0` : `/api/research/tasks/${item.taskId || project.taskId}/candidates/${item.id}/screenshot`} alt="案例截图" loading="lazy" />}
            {managingFeedback && <button type="button" className="project-overview-select-candidate" aria-label={selectedCandidateIds.includes(item.id) ? "取消选择" : "选择帖子"} aria-pressed={selectedCandidateIds.includes(item.id)} onClick={() => toggleCandidateSelection(item.id)}>{selectedCandidateIds.includes(item.id) && <NightingaleIcon name="check" size={16} />}</button>}
            <button type="button" className="project-overview-delete-candidate" aria-label="删除帖子" title="删除帖子" disabled={deletingCandidates} onClick={() => void deleteCandidates([item.id])}><img src="/icons/delete-regular.svg" alt="" /></button>
            <div className="project-overview-candidate-copy">
              <div className="project-overview-candidate-meta"><small>{sourceLabel(item.source)} · {item.publishedAt || item.capturedAt?.slice(0, 10) || "日期未记录"}</small>{item.url && <a href={item.url} target="_blank" rel="noreferrer">查看来源 <NightingaleIcon name="arrowUpRight" size={14} /></a>}</div>
              {item.title ? <h3>{item.title}</h3> : null}<p>{conciseSummary(item.excerpt || "暂无正文摘要。")}</p>
              {item.valuableComments?.slice(0, 2).map((comment) => <blockquote key={comment}>{conciseCopy(comment, 72)}</blockquote>)}
            </div>
          </article>)}
          {evidence.map((item) => <article className="project-overview-evidence-card text-evidence" key={item.id}><div><small>{item.sourceLabel || "用户反馈"} · {item.publishedAt || "日期未记录"}</small><h3>{item.title}</h3><blockquote>{item.originalText}</blockquote>{item.observableFact && <p><b>观察到：</b>{item.observableFact}</p>}{item.designInterpretation && <p><b>设计启发：</b>{item.designInterpretation}</p>}</div>{item.url && <a href={item.url} target="_blank" rel="noreferrer">查看来源 <NightingaleIcon name="arrowUpRight" size={14} /></a>}</article>)}
        </div> : <EmptyTab action={{ label: "开始用户研究", icon: true, onClick: () => openResearch("play") }}>开始用户调研并保存案例后，这里会集中展示帖子、评论和用户之声。</EmptyTab>}</div>}

        {tab === "设计策略与方向" && <div className="project-overview-panel project-overview-strategy-panel"><div className="project-overview-section-heading"><div><small>STRATEGY & DIRECTIONS</small><h2>设计策略与方向</h2></div>{strategy && <button className="project-overview-action project-overview-action-secondary" type="button" onClick={() => { window.sessionStorage.setItem("design-lab-generate-strategy", "force"); window.location.href = "/projects/strategy"; }}>再次分析</button>}</div>{strategy ? <>
          {strategy.summary && <div className="project-overview-summary-block"><span>研究结论</span><p className="project-overview-summary">{strategy.summary}</p></div>}
          {!!strategy.opportunities?.length && <section className="project-overview-subsection"><div className="project-overview-subsection-heading"><span>01</span><h3>设计机会</h3></div><div className="project-overview-opportunities">{strategy.opportunities.map((item, index) => <article className="project-overview-opportunity-card" key={`${item.title}-${index}`}><div className="project-overview-card-index">机会 {String(index + 1).padStart(2, "0")}</div><h4>{item.title}</h4><p>{item.detail}</p><div className="project-overview-opportunity-metric"><small>互动体验指标</small><span>{item.metric}</span></div></article>)}</div></section>}
          {!!strategy.strategies?.length && <section className="project-overview-subsection"><div className="project-overview-subsection-heading"><span>02</span><h3>建议策略</h3></div><div className="project-overview-strategy-grid">{strategy.strategies.map((item, index) => <article className="project-overview-strategy-card" key={`${item.title}-${index}`}><div className="project-overview-card-index">策略 {String(index + 1).padStart(2, "0")}</div><h4>{item.title}</h4><p>{item.action}</p><div className="project-overview-strategy-meta"><div><small>互动体验指标</small><span>{item.metric}</span></div></div></article>)}</div></section>}
          {!!strategy.directions?.length && <section className="project-overview-subsection"><div className="project-overview-subsection-heading"><span>03</span><h3>设计方向</h3></div><div className="project-overview-direction-grid">{strategy.directions.map((item, index) => <article className="direction-card" key={`${item.title}-${index}`}><div className="direction-top"><span>设计方向 {String(index + 1).padStart(2, "0")}</span></div><div className="direction-module direction-overview"><h3>{item.title}</h3><p>{item.summary}</p></div>{!!item.flow?.length && <div className="direction-module direction-flow-wrap"><small>用户流程</small><ol className="direction-flow">{item.flow.map((step, stepIndex) => <li key={`${step}-${stepIndex}`}><i>{stepIndex + 1}</i><span>{step}</span></li>)}</ol></div>}{!!item.points?.length && <div className="direction-module direction-points-wrap"><small>设计要点</small><ul className="direction-points">{item.points.map((point) => <li key={point}>{point}</li>)}</ul></div>}{item.test && <footer className="direction-module direction-monitoring"><small>设计验证与上线观察</small><p>{item.test}</p></footer>}</article>)}</div></section>}
        </> : loading ? <EmptyTab>正在读取项目的策略与设计方向。</EmptyTab> : <EmptyTab action={{ label: "开始研究", icon: true, onClick: () => openResearch("play") }}>完成调研并生成设计策略后，这里会显示策略依据和初步方向。</EmptyTab>}</div>}

        {tab === "视觉参考" && <div className="project-overview-panel">
          <div className="project-overview-section-heading"><div><small>VISUAL REFERENCES</small><h2>视觉参考</h2></div><div className="project-overview-section-actions"><span>{visualSamples.length} 张参考</span>{visualSamples.length > 0 && <><button className="project-overview-action project-overview-action-secondary" type="button" onClick={() => openResearch("visual")}>再次采集</button><button className="project-overview-action project-overview-action-primary" type="button" disabled={exportingVisuals} onClick={() => void exportVisualReferences()}>{exportingVisuals ? "正在导出…" : "导出 HTML"}</button></>}</div></div>
          {visualSamples.length ? <div className="project-overview-visual-directions">{visualDirectionGroups.map((group, index) => <section className="project-overview-visual-direction" key={group.key}>
            <header><div><small>视觉方向 {String(index + 1).padStart(2, "0")}</small><h3>{group.label}</h3></div><span>{group.samples.length} 张参考</span></header>
            <div className="project-overview-visual-grid">{group.samples.map((sample) => <article key={sample.id}>
              <a href={sample.projectUrl} target="_blank" rel="noreferrer" className="project-overview-visual-image">{sample.screenshotKey || sample.imageUrl ? <img src={`/api/research/tasks/${sample.taskId || group.taskId}/visual-samples/${sample.id}/image`} alt={sample.projectTitle} loading="lazy" /> : <span>暂无图片预览</span>}</a>
              <div><small className="project-overview-visual-meta"><PlatformLogo platform={sample.platform.toLowerCase().includes("pinterest") ? "pinterest" : "behance"} />{formatVisualDate(sample.publishedAt) && <time>{formatVisualDate(sample.publishedAt)}</time>}</small><h4>{sample.projectTitle}</h4>{summarizeVisualDescription(sample) && <p>{summarizeVisualDescription(sample)}</p>}{sample.author && <span>来源：{sample.author}</span>}</div>
            </article>)}</div>
          </section>)}</div> : loading ? <EmptyTab>正在读取已保存的视觉参考。</EmptyTab> : <EmptyTab action={{ label: "视觉研究", onClick: () => openResearch("visual"), icon: true }}>视觉研究收集并保存参考图后，会按视觉方向集中展示在这里。</EmptyTab>}
          {visualExportNotice && <p className="project-overview-export-notice" role="status">{visualExportNotice}</p>}
        </div>}

        {tab === "方案与评审" && <div className="project-overview-panel"><div className="project-overview-section-heading"><div><small>SOLUTION & REVIEW</small><h2>方案与评审</h2></div><div className="project-overview-section-actions">{solution && <><span>{`${solution.solutionName} · ${solution.version}`}</span><button className="project-overview-action project-overview-action-secondary" type="button" onClick={openSolutionReview}>重新评审</button></>}</div></div>{solution ? <><div className="project-overview-solution-summary"><strong>{solution.solutionName}</strong><span>{solution.version} · {solution.designPoints.length} 个设计点</span><small>导入时间：{solution.importedAt || "未记录"}</small></div><div className="project-overview-point-list">{solution.designPoints.map((point, index) => <article key={point.id}><i>{String(index + 1).padStart(2, "0")}</i><div><h3>{point.title}</h3><p>{point.description || "尚未补充具体变化"}</p>{point.strategy && <span>关联策略：{point.strategy}</span>}{point.metrics.map((metric) => <span key={metric}>预期指标：{metric}</span>)}</div></article>)}</div>{review && <section className="project-overview-review"><h3>方案评价</h3><p>{String(review.summary || "已保存评价结果")}</p>{Array.isArray(review.reviews) && <div>{(review.reviews as Array<Record<string, unknown>>).map((item, index) => <article key={String(item.id || index)}><strong>{solution.designPoints.find((point) => point.id === item.id)?.title || `设计点 ${index + 1}`}</strong><span>{String(item.verdict || "")}</span>{Array.isArray(item.criteria) && <ul>{(item.criteria as Array<Record<string, unknown>>).map((criterion, criterionIndex) => <li key={criterionIndex}>{String(criterion.name)}：{String(criterion.score)}/5 · {String(criterion.reason || "")}</li>)}</ul>}</article>)}</div>}</section>}</> : loading ? <EmptyTab>正在读取已有方案。</EmptyTab> : <EmptyTab action={{ label: "导入方案", icon: true, onClick: () => { window.location.href = "/projects/import"; } }}>导入方案并确认设计点后，这里会集中展示方案版本、设计点和评价结果。</EmptyTab>}</div>}

        </div>
      </div>
    </section>
  </main>;
}

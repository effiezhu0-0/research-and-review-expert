"use client";

import { useEffect, useId, useRef, useState } from "react";
import DashboardSidebar from "./components/DashboardSidebar";
import NightingaleIcon from "./components/NightingaleIcon";
import { openSavedProject, readSavedProjects, SavedProject, updateProjectStage } from "./lib/savedProjects";

type HomeProject = { saved: SavedProject; name: string; kind: string; stage: string; updated: string; progress: number };

const projectStages = ["背景输入", "竞品调研", "视觉调研", "方案评审", "上线复盘"];

function StageDropdown({ project, onChange }: { project: HomeProject; onChange: (stage: string) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const options = projectStages;

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  return <div className="stage-dropdown" ref={root} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => {
    if (event.key === "Escape" && open) { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
    if (open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      const items = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') || []);
      const index = items.findIndex((item) => item === document.activeElement);
      const next = index < 0 ? (event.key === "ArrowDown" ? 0 : items.length - 1) : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }
  }}>
    <button ref={trigger} className="stage stage-trigger" type="button" aria-label={`${project.name}当前阶段：${project.stage}`} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} onClick={() => setOpen(!open)}>
      <i aria-hidden="true" />{project.stage}<NightingaleIcon name="chevronDown" size={14} />
    </button>
    {open && <div className="stage-menu" id={listId} role="listbox" aria-label={`${project.name}项目阶段`}>
      {options.map((stage) => <button key={stage} type="button" role="option" aria-selected={stage === project.stage} onClick={() => { onChange(stage); setOpen(false); trigger.current?.focus(); }}>
        <span>{stage}</span>{stage === project.stage && <NightingaleIcon name="check" size={16} />}
      </button>)}
    </div>}
  </div>;
}

export default function Home() {
  const [toast, setToast] = useState<string | null>(null);
  const [projects, setProjects] = useState<HomeProject[]>([]);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        setProjects(readSavedProjects().map((saved) => ({
          saved,
          name: saved.name,
          kind: saved.kind,
          stage: saved.stage,
          updated: new Date(saved.savedAt).toLocaleDateString("zh-CN"),
          progress: saved.progress,
        })));
      } catch { setProjects([]); }
    });
  }, []);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2400);
  };

  const openNewProject = () => {
    window.localStorage.removeItem("design-lab-project-draft");
    window.localStorage.removeItem("design-lab-current-project-id");
    window.localStorage.removeItem("design-lab-active-research-task");
    window.localStorage.removeItem("design-lab-research-task");
    window.localStorage.removeItem("design-lab-research-evidence");
    window.sessionStorage.removeItem("design-lab-start-research");
    window.sessionStorage.removeItem("design-lab-entry-source");
    window.sessionStorage.removeItem("design-lab-solution-intake");
    window.location.href = `/projects/new?fresh=${Date.now()}`;
  };
  const openStageProject = (entry: "import" | "retrospective") => {
    window.localStorage.removeItem("design-lab-project-draft");
    window.localStorage.removeItem("design-lab-current-project-id");
    window.sessionStorage.removeItem("design-lab-solution-intake");
    window.sessionStorage.setItem("design-lab-entry-source", `homepage-${entry}`);
    window.location.href = `/projects/new?fresh=${Date.now()}&entry=${entry}`;
  };

  return (
    <main className="app-shell">
      <DashboardSidebar active="home" />

      <section className="workspace">
        <header className="topbar">
          <div className="crumb"><span>工作空间</span><b>/</b><strong>首页</strong></div>
          <div className="top-actions">
            <button className="search" type="button">搜索项目和研究资产<kbd>⌘ K</kbd></button>
          </div>
        </header>

        <div className="content">
          <section className="welcome">
            <div>
              <p><span>早上好，<b>Effie</b></span><i className="coffee-icon" aria-hidden="true" /></p>
              <h1>让每一次设计都有迹可循</h1>
            </div>
          </section>

          <section className="new-project-group">
            <div className="section-heading">
              <div><h2>新建项目</h2><span>根据当前项目阶段选择开始方式</span></div>
            </div>
            <div className="quick-start" aria-label="新建项目方式">
              <button className="quick-start-primary" type="button" onClick={openNewProject}>
                <div><span className="quick-card-kicker">从需求开始</span><strong>创建新项目</strong><span className="quick-card-description"><small>建立研究、策略与方案的共同上下文</small><img src="/arrow-right-regular.svg" alt="" aria-hidden="true" /></span></div>
              </button>
              <button type="button" onClick={() => openStageProject("import")}>
                <div><span className="quick-card-kicker">已有产出</span><strong>导入已有方案</strong><span className="quick-card-description"><small>进入方案评分与优化流程</small><img src="/arrow-right-regular.svg" alt="" aria-hidden="true" /></span></div>
              </button>
              <button type="button" onClick={() => openStageProject("retrospective")}>
                <div><span className="quick-card-kicker">验证判断</span><strong>创建上线复盘</strong><span className="quick-card-description"><small>录入指标并回看设计效果</small><img src="/arrow-right-regular.svg" alt="" aria-hidden="true" /></span></div>
              </button>
            </div>
          </section>

          <section className="projects-section">
            <div className="section-heading">
              <div><h2>最近项目</h2><span>最近使用和创建的项目</span></div>
              <div className="view-actions">
                <button type="button" onClick={() => notify("全部项目")}>查看全部</button>
              </div>
            </div>

            {projects.length ? <div className="project-list">
              <div className="list-header">
                <span>项目</span><span>类型</span><span>当前阶段</span><span>进度</span><span>最近更新</span><span />
              </div>
              {projects.map((project) => (
                <div className="project-row" key={project.saved.id} onClick={() => openSavedProject(project.saved)}>
                  <span className="project-name">
                    <i className="project-icon"><NightingaleIcon name="file" size={20} /></i>
                    <span><strong>{project.name}</strong><small>设计团队 · 内部项目</small></span>
                  </span>
                  <span><em className={`type-pill ${project.kind === "品牌设计" ? "brand-type" : project.kind === "大促设计" ? "marketing-type" : "interaction-type"}`}>{project.kind}</em></span>
                  <StageDropdown project={project} onChange={(stage) => {
                      updateProjectStage(project.saved.id, stage);
                      setProjects((current) => current.map((item) => item.saved.id === project.saved.id ? { ...item, stage, saved: { ...item.saved, stage, manualStage: stage } } : item));
                    }} />
                  <span className="progress"><i><b style={{ width: `${project.progress}%` }} /></i><small>{project.progress}%</small></span>
                  <span className="updated">{project.updated}</span>
                  <button className="more" type="button" aria-label={`编辑项目 ${project.name}`} onClick={(event) => { event.stopPropagation(); openSavedProject(project.saved); }}>编辑</button>
                </div>
              ))}
            </div> : <div className="projects-empty"><span>项目会聚合调研、策略和方案</span><strong>还没有项目</strong><p>创建项目后，你可以在同一上下文中沉淀证据并推进方案。</p><button type="button" onClick={openNewProject}>创建第一个项目</button></div>}
          </section>

        </div>
      </section>

      {toast && <div className="toast" role="status"><i />{toast}</div>}
    </main>
  );
}

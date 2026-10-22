"use client";

import { useEffect, useState } from "react";
import DashboardSidebar from "./components/DashboardSidebar";
import { openSavedProject, readSavedProjects, SavedProject } from "./lib/savedProjects";

type HomeProject = { saved: SavedProject; name: string; kind: string; stage: string; updated: string; color: string; progress: number; icon: string };

const projectStages = ["策略探索", "设计中", "方案评估", "上线复盘"];

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
          color: "violet",
          progress: saved.progress,
          icon: saved.name.slice(0, 1),
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
            <button className="search" type="button"><span>⌕</span>搜索项目和研究资产<kbd>⌘ K</kbd></button>
            <button className="round-action" type="button" aria-label="通知">○</button>
          </div>
        </header>

        <div className="content">
          <section className="welcome">
            <div>
              <p>2026年8月3日 · 星期一</p>
              <h1>下午好，开始今天的设计研究。</h1>
              <span>从新项目开始，或继续最近的工作。</span>
            </div>
          </section>

          <section className="new-project-group">
            <div className="section-heading">
              <div><h2>新建项目</h2><span>根据当前项目阶段选择开始方式</span></div>
            </div>
            <div className="quick-start">
              <button type="button" onClick={openNewProject}>
                <span className="quick-icon violet-bg">＋</span>
                <div><strong>创建空白项目</strong><small>从项目需求开始建立研究</small></div>
                <b>→</b>
              </button>
              <button type="button" onClick={() => openStageProject("import")}>
                <span className="quick-icon orange-bg">⇧</span>
                <div><strong>导入已有方案</strong><small>进入方案评分与优化流程</small></div>
                <b>→</b>
              </button>
              <button type="button" onClick={() => openStageProject("retrospective")}>
                <span className="quick-icon green-bg">↗</span>
                <div><strong>创建上线复盘</strong><small>录入指标并验证设计判断</small></div>
                <b>→</b>
              </button>
            </div>
          </section>

          <section className="projects-section">
            <div className="section-heading">
              <div><h2>最近项目</h2><span>最近使用和创建的项目</span></div>
              <div className="view-actions">
                <button type="button" aria-label="列表视图">☷</button>
                <button type="button" aria-label="卡片视图">▦</button>
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
                    <i className={`project-icon ${project.color}`}>{project.icon}</i>
                    <span><strong>{project.name}</strong><small>设计团队 · 内部项目</small></span>
                  </span>
                  <span><em className={`type-pill ${project.kind === "品牌设计" ? "brand-type" : ""}`}>{project.kind}</em></span>
                  <button className="stage" type="button" onClick={(event) => { event.stopPropagation(); setProjects((current) => current.map((item) => item.name === project.name ? { ...item, stage: projectStages[(projectStages.indexOf(item.stage) + 1) % projectStages.length] } : item)); }} title="点击切换状态"><i />{project.stage}<b>⌄</b></button>
                  <span className="progress"><i><b style={{ width: `${project.progress}%` }} /></i><small>{project.progress}%</small></span>
                  <span className="updated">{project.updated}</span>
                  <span className="more">•••</span>
                </div>
              ))}
            </div> : <div className="projects-empty"><strong>还没有项目</strong><span>创建项目后，它会出现在这里。</span><button type="button" onClick={openNewProject}>创建第一个项目</button></div>}
          </section>

          {projects.length > 0 && <section className="insight-strip">
            <div><span className="spark">✦</span><p><strong>研究资产本周新增 12 条</strong><small>5 个竞品案例、4 条用户反馈、3 条设计策略</small></p></div>
            <button type="button" onClick={() => notify("查看本周新增研究资产")}>查看更新 →</button>
          </section>}
        </div>
      </section>

      {toast && <div className="toast" role="status"><i />{toast}</div>}
    </main>
  );
}

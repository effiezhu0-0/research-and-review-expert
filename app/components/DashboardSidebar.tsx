"use client";

import { useEffect, useState } from "react";
import PersonalAISettings from "./PersonalAISettings";
import { openSavedProject, readSavedProjects, SavedProject } from "../lib/savedProjects";

type DashboardSidebarProps = {
  active?: "home" | "projects" | "tasks" | "favorites" | "cases" | "feedback" | "strategy" | "standards";
  projectActive?: boolean;
};

export default function DashboardSidebar({ active, projectActive = false }: DashboardSidebarProps) {
  const [displayName, setDisplayName] = useState("当前使用者");
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [activeTaskId, setActiveTaskId] = useState("");
  const go = (path: string) => { window.location.href = path; };
  const createNewProject = () => {
    window.localStorage.removeItem("design-lab-project-draft");
    window.localStorage.removeItem("design-lab-active-research-task");
    window.localStorage.removeItem("design-lab-research-task");
    window.localStorage.removeItem("design-lab-research-evidence");
    window.sessionStorage.removeItem("design-lab-start-research");
    window.location.href = `/projects/new?fresh=${Date.now()}`;
  };

  useEffect(() => {
    queueMicrotask(() => {
      try {
        setProjects(readSavedProjects());
        setActiveTaskId(window.localStorage.getItem("design-lab-active-research-task") || "");
      } catch { setProjects([]); }
    });
    fetch("/api/account", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((data) => { if (data?.displayName) setDisplayName(data.displayName); })
      .catch(() => undefined);
  }, []);

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="lab-mark" aria-hidden="true"><i /><i /><i /><i /></span>
        <div><strong>设计调研与评审专家</strong><span>AI 设计工作台</span></div>
        <button type="button" aria-label="切换空间">⌄</button>
      </div>
      <button className="new-project-side" type="button" onClick={createNewProject}><span>＋</span>新建项目<kbd>N</kbd></button>
      <nav className="nav" aria-label="主导航">
        <button className={`nav-item ${active === "home" ? "active" : ""}`} type="button" onClick={() => go("/")}><span>⌂</span>首页</button>
        <button className={`nav-item ${active === "projects" ? "active" : ""}`} type="button" onClick={() => go("/")}><span>▱</span>全部项目<small>{projects.length}</small></button>
        {projects.map((project) => (
          <button className={`nav-current-project ${projectActive && project.taskId === activeTaskId ? "active" : ""}`} type="button" key={project.id} onClick={() => openSavedProject(project)}>
            <i aria-hidden="true" />
            <span>{project.name}</span>
          </button>
        ))}
        <button className={`nav-item ${active === "tasks" ? "active" : ""}`} type="button"><span>✓</span>我的任务<small>3</small></button>
        <button className={`nav-item ${active === "favorites" ? "active" : ""}`} type="button"><span>☆</span>我的收藏</button>
      </nav>
      <div className="nav-group">
        <p>研究资产</p>
        <button className={`nav-item ${active === "cases" ? "active" : ""}`} type="button"><span>◫</span>案例库</button>
        <button className={`nav-item ${active === "feedback" ? "active" : ""}`} type="button"><span>◌</span>用户反馈</button>
        <button className={`nav-item ${active === "strategy" ? "active" : ""}`} type="button"><span>✦</span>设计策略</button>
        <button className={`nav-item ${active === "standards" ? "active" : ""}`} type="button"><span>≡</span>规范与依据</button>
      </div>
      <div className="sidebar-footer">
        <button className="nav-item" type="button"><span>?</span>使用说明</button>
        <div className="profile"><span className="avatar">{displayName.slice(0, 1)}</span><div><strong>{displayName}</strong><span>当前使用者</span></div><PersonalAISettings trigger="menu" /></div>
      </div>
    </aside>
  );
}

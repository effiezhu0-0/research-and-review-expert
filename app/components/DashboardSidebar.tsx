"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PersonalAISettings from "./PersonalAISettings";
import NightingaleIcon, { NightingaleIconName } from "./NightingaleIcon";
import { deleteSavedProject, openSavedProject, readSavedProjects, renameSavedProject, SavedProject } from "../lib/savedProjects";

type DashboardSidebarProps = {
  active?: "home" | "projects" | "project" | "tasks" | "favorites" | "cases" | "feedback" | "strategy" | "standards";
  projectActive?: boolean;
};

function SidebarBrand() {
  return <div className="brand">
    <span className="lab-mark" aria-hidden="true"><img src="/design-lab-logo-purple.png" alt="" /></span>
    <div><strong>设计调研与评审专家</strong><span>AI 设计工作台</span></div>
  </div>;
}

function SidebarNavItem({ label, icon, active, count, onClick }: { label: string; icon: NightingaleIconName; active?: boolean; count?: number; onClick?: () => void }) {
  return <button className={`nav-item ${active ? "active" : ""}`} type="button" onClick={onClick}>
    <NightingaleIcon name={icon} size={20} />{label}{count !== undefined && <small>{count}</small>}
  </button>;
}

function SidebarProjectItem({ project, active }: { project: SavedProject; active: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState(project.name);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, [menuOpen]);

  const saveName = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName) { setError("请输入项目名称"); return; }
    if (nextName !== project.name) renameSavedProject(project.id, nextName);
    setRenameOpen(false);
    setMenuOpen(false);
    setError("");
  };

  const confirmDelete = () => {
    deleteSavedProject(project.id);
    setDeleteOpen(false);
    if (active) window.location.href = "/";
  };

  return <div className="sidebar-project-item" ref={root}>
    <div className={`sidebar-project-row ${active ? "active" : ""}`}>
      <button className={`nav-current-project ${active ? "active" : ""}`} type="button" onClick={() => openSavedProject(project)}>
        <NightingaleIcon name="file" size={18} /><span>{project.name}</span>
      </button>
      <button className="sidebar-project-more" type="button" aria-label={`${project.name}项目菜单`} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
        <span className="sidebar-project-more-icon" aria-hidden="true" />
      </button>
    </div>
    {menuOpen && <div className="sidebar-project-menu" role="menu">
      <button type="button" role="menuitem" onClick={() => { setName(project.name); setError(""); setRenameOpen(true); setMenuOpen(false); }}>重命名</button>
      <button className="danger" type="button" role="menuitem" onClick={() => { setDeleteOpen(true); setMenuOpen(false); }}>删除项目</button>
    </div>}
    {renameOpen && typeof document !== "undefined" && createPortal(<div className="sidebar-project-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setRenameOpen(false); }}>
      <form className="sidebar-project-dialog" role="dialog" aria-modal="true" aria-labelledby={`rename-project-title-${project.id}`} onSubmit={saveName}>
        <h2 id={`rename-project-title-${project.id}`}>重命名项目</h2>
        <label htmlFor={`rename-project-input-${project.id}`}>项目名称</label>
        <input id={`rename-project-input-${project.id}`} autoFocus value={name} onChange={(event) => { setName(event.target.value); setError(""); }} />
        {error && <small role="alert">{error}</small>}
        <footer><button type="button" onClick={() => setRenameOpen(false)}>取消</button><button className="primary" type="submit">保存</button></footer>
      </form>
    </div>, document.body)}
    {deleteOpen && typeof document !== "undefined" && createPortal(<div className="sidebar-project-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteOpen(false); }}>
      <div className="sidebar-project-dialog" role="alertdialog" aria-modal="true" aria-labelledby={`delete-project-title-${project.id}`}>
        <h2 id={`delete-project-title-${project.id}`}>删除项目</h2>
        <p>确定删除“{project.name}”吗？删除后项目将从项目列表中移除。</p>
        <footer><button type="button" onClick={() => setDeleteOpen(false)}>取消</button><button className="danger-button" type="button" onClick={confirmDelete}>删除</button></footer>
      </div>
    </div>, document.body)}
  </div>;
}

function SidebarProfile({ displayName }: { displayName: string }) {
  return <div className="sidebar-footer"><div className="profile"><span className="avatar">E</span><div><strong>{displayName}</strong></div><PersonalAISettings trigger="menu" /></div></div>;
}

export default function DashboardSidebar({ active, projectActive = false }: DashboardSidebarProps) {
  const [displayName] = useState("Effie");
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState("");
  const go = (path: string) => { window.location.href = path; };
  useEffect(() => {
    queueMicrotask(() => {
      try {
        setProjects(readSavedProjects());
        setActiveProjectId(window.localStorage.getItem("design-lab-current-project-id") || "");
      } catch { setProjects([]); }
    });
    const refreshProjects = () => {
      setProjects(readSavedProjects());
      setActiveProjectId(window.localStorage.getItem("design-lab-current-project-id") || "");
    };
    window.addEventListener("design-lab-projects-updated", refreshProjects);
    return () => window.removeEventListener("design-lab-projects-updated", refreshProjects);
  }, []);

  const navItem = (id: DashboardSidebarProps["active"], label: string, icon: NightingaleIconName, count?: number) => (
    <SidebarNavItem label={label} icon={icon} active={active === id} count={count} onClick={() => id === "home" || id === "projects" ? go("/") : undefined} />
  );

  return (
    <aside className="sidebar">
      <SidebarBrand />
      <nav className="nav" aria-label="主导航">
        {navItem("home", "首页", "home")}
        <SidebarNavItem label="全部项目" icon="folder" active={active === "projects" && !projectActive} count={projects.length} onClick={() => go("/")} />
        {projects.map((project) => (
          <SidebarProjectItem key={project.id} project={project} active={(projectActive || active === "project") && project.id === activeProjectId} />
        ))}
        {navItem("favorites", "我的收藏", "star")}
      </nav>
      <div className="nav-group" hidden>
        <p>研究资产</p>
        {navItem("cases", "案例库", "archive")}
        {navItem("feedback", "用户反馈", "message")}
        {navItem("strategy", "设计策略", "sparkles")}
        {navItem("standards", "规范与依据", "list")}
      </div>
      <SidebarProfile displayName={displayName} />
    </aside>
  );
}

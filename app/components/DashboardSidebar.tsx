"use client";

type DashboardSidebarProps = {
  active?: "home" | "projects" | "tasks" | "favorites" | "cases" | "feedback" | "strategy" | "standards";
};

export default function DashboardSidebar({ active }: DashboardSidebarProps) {
  const go = (path: string) => { window.location.href = path; };
  const createNewProject = () => {
    window.localStorage.removeItem("design-lab-project-draft");
    window.location.href = `/projects/new?fresh=${Date.now()}`;
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="lab-mark" aria-hidden="true"><i /><i /><i /><i /></span>
        <div><strong>Design Lab</strong><span>设计归因看板</span></div>
        <button type="button" aria-label="切换空间">⌄</button>
      </div>
      <button className="new-project-side" type="button" onClick={createNewProject}><span>＋</span>新建项目<kbd>N</kbd></button>
      <nav className="nav" aria-label="主导航">
        <button className={`nav-item ${active === "home" ? "active" : ""}`} type="button" onClick={() => go("/")}><span>⌂</span>首页</button>
        <button className={`nav-item ${active === "projects" ? "active" : ""}`} type="button"><span>▱</span>全部项目<small>5</small></button>
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
        <div className="profile"><span className="avatar">设</span><div><strong>设计团队</strong><span>内部工作空间</span></div><button type="button" aria-label="账户菜单">•••</button></div>
      </div>
    </aside>
  );
}

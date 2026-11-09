"use client";

import { useEffect, useState } from "react";

export default function ProjectTopbar({ section, demo }: { section: string; demo?: string }) {
  const [projectName, setProjectName] = useState("未命名项目");

  useEffect(() => {
    try {
      const draft = JSON.parse(window.localStorage.getItem("design-lab-project-draft") || "{}");
      if (draft.projectName?.trim()) setProjectName(draft.projectName.trim());
    } catch {
      setProjectName("未命名项目");
    }
  }, []);

  return (
    <header className="project-topbar">
      <div><span>{projectName}</span><b>/</b><strong>{section}</strong></div>
      {demo === "可编辑" ? <button type="button" onClick={() => { window.location.href = "/"; }}>保存并退出</button> : demo ? <span className="demo-label">{demo}</span> : null}
    </header>
  );
}

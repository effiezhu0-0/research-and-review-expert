"use client";

import { useEffect, useState } from "react";
import PersonalAISettings from "./PersonalAISettings";

export default function ProjectTopbar({ section, demo = "静态演示数据" }: { section: string; demo?: string }) {
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
      <div className="project-topbar-actions"><span className="demo-label">{demo}</span><PersonalAISettings /></div>
    </header>
  );
}

"use client";

import { useEffect, useState } from "react";
import NightingaleIcon from "./NightingaleIcon";

export default function ProjectTopbar({ section, demo }: { section: string; demo?: string }) {
  const [projectId, setProjectId] = useState("");

  useEffect(() => {
    setProjectId(window.localStorage.getItem("design-lab-current-project-id") || "");
  }, []);

  const returnToProject = () => {
    if (projectId) window.location.href = `/projects/overview?projectId=${encodeURIComponent(projectId)}`;
    else window.history.back();
  };

  return (
    <header className="project-topbar">
      <button className="project-topbar-back" type="button" onClick={returnToProject}><NightingaleIcon name="arrowLeft" size={20} />返回</button>
      {demo === "可编辑" ? <button type="button" onClick={() => { window.location.href = "/"; }}>保存并退出</button> : demo ? <span className="demo-label">{demo}</span> : null}
    </header>
  );
}

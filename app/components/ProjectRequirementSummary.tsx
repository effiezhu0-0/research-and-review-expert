"use client";

import { useEffect, useState } from "react";

type Draft = {
  projectName?: string;
  designType?: string;
  projectMode?: string;
  stage?: string;
  answers?: Record<string, string[]>;
  customValues?: Record<string, string>;
};

const groupNames: Record<string, string> = { goal: "营销目标", game: "游戏类型", audience: "目标用户", problem: "当前问题", reference: "希望获得" };

export default function ProjectRequirementSummary() {
  const [draft, setDraft] = useState<Draft>({});

  useEffect(() => {
    try {
      setDraft(JSON.parse(window.localStorage.getItem("design-lab-project-draft") || "{}"));
    } catch {
      setDraft({});
    }
  }, []);

  const groups = Object.entries(groupNames).map(([key, label]) => {
    const values = [...(draft.answers?.[key] || [])];
    if (draft.customValues?.[key]?.trim()) values.push(draft.customValues[key].trim());
    return { key, label, values };
  }).filter((group) => group.values.length);

  return (
    <section className="synced-requirements">
      <div className="synced-requirements-heading"><div><small>PROJECT BRIEF</small><h2>{draft.projectName || "未命名项目"}</h2></div><button type="button" aria-label="修改需求" onClick={() => { window.location.href = "/projects/new"; }}><img src="/pencil-line-1-regular.svg" alt="" /></button></div>
      <div className="requirement-basics">
        <span>{draft.designType === "brand" ? "品牌设计" : "互动设计"}</span>
        <span>{draft.projectMode || "新互动"}</span>
        <span>{draft.stage === "review" ? "已有设计方案" : draft.stage === "live" ? "项目已经上线" : "还没有设计方案"}</span>
      </div>
      <div className="requirement-groups">
        {groups.map((group) => <div key={group.key}><small>{group.label}</small><p>{group.values.map((value) => <span key={value}>{value}</span>)}</p></div>)}
      </div>
    </section>
  );
}

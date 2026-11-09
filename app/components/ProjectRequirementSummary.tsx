"use client";

import { useEffect, useState } from "react";

type Draft = {
  projectName?: string;
  designType?: string;
  projectMode?: string;
  stage?: string;
  answers?: Record<string, string[]>;
  customValues?: Record<string, string>;
  meetingContext?: { link?: string; fileName?: string; extractedText?: string; keyPoints?: string[] };
  decisionPosture?: number;
};

const groupNames: Record<string, string> = { goal: "优先目标", game: "游戏类型", perception: "核心感知", boundary: "研究边界", campaign: "活动节点", audience: "目标用户", problem: "当前问题" };

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
      <div className="synced-requirements-heading"><div><small>PROJECT BRIEF</small><div className="brief-project-title"><span className={`brief-direction brief-direction-${draft.designType || "interaction"}`}>{draft.designType === "brand" ? "品牌设计" : draft.designType === "marketing" ? "大促设计" : "互动设计"}</span><h2>{draft.projectName || "未命名项目"}</h2></div></div><button type="button" aria-label="修改需求" onClick={() => { window.location.href = `/projects/new?from=research&t=${Date.now()}`; }}><img src="/pencil-line-1-regular.svg" alt="" /></button></div>
      <div className="requirement-groups">
        {groups.map((group) => <div key={group.key}><small>{group.label}</small><p>{group.values.join("、")}</p></div>)}
      </div>
    </section>
  );
}

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

const groupNames: Record<string, string> = { goal: "核心目标", game: "游戏类型", perception: "核心感知", boundary: "研究边界", campaign: "活动节点", audience: "目标用户", problem: "当前问题" };

export default function ProjectRequirementSummary({ visualMode = false, visualDirections = [] }: { visualMode?: boolean; visualDirections?: string[] }) {
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

  const kind = draft.designType === "brand" ? "品牌设计" : draft.designType === "marketing" ? "大促设计" : "互动设计";
  const kindClass = draft.designType === "brand" ? "brand-type" : draft.designType === "marketing" ? "marketing-type" : "interaction-type";

  return (
    <section className={`synced-requirements project-overview-hero${visualMode ? " synced-requirements-visual" : ""}`}>
      {!visualMode ? <>
        <div className="project-overview-heading synced-requirements-heading">
          <div className="project-overview-title-row">
            <span className={`type-pill ${kindClass}`}>{kind}</span>
            <h1>{draft.projectName || "未命名项目"}</h1>
          </div>
          <div className="project-overview-top-info synced-requirements-info">
            {groups.map((group) => <span className="project-overview-info-item" key={group.key}>
              <span className="project-overview-info-label">{group.label}</span>
              <span className="project-overview-info-value">{group.values.join("、")}</span>
            </span>)}
          </div>
        </div>
        <button className="project-overview-edit" type="button" aria-label="修改需求" title="修改需求" onClick={() => { window.location.href = `/projects/new?from=research&t=${Date.now()}`; }}>
          <img src="/pencil-line-1-regular.svg" alt="" />
        </button>
      </> : <>
        <div className="synced-requirements-heading"><small>SELECTED VISUAL DIRECTIONS</small></div>
        <div className="selected-visual-direction-list">{visualDirections.map((direction) => <span key={direction}>{direction}</span>)}</div>
      </>}
    </section>
  );
}

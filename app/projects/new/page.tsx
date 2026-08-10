"use client";

import { useEffect, useMemo, useState } from "react";
import DashboardSidebar from "../../components/DashboardSidebar";
import FlowProgress from "../../components/FlowProgress";
import { createResearchTask } from "../../lib/localResearchStore";
import { personalIdentityHeaders } from "../../lib/personalIdentity";

type DesignType = "interaction" | "brand";
type ProjectStage = "before" | "review" | "live";
const draftKey = "design-lab-project-draft";

const optionGroups = [
  {
    key: "goal",
    title: "营销目标",
    single: false,
    custom: true,
    options: ["拉新（新增用户数、获客成本）", "促活（DAU、活跃率、参与次数）", "转化（转化率、客单价）", "传播（分享率、拉新人数）", "留存（次日留存、复访率）"],
  },
  { key: "game", title: "游戏类型", single: true, custom: true, options: ["抽奖", "答题", "收集", "养成", "暂不确定"] },
  {
    key: "audience",
    title: "目标用户",
    single: false,
    custom: true,
    options: ["小镇青年", "小镇中年", "小镇中产", "小镇家庭", "都市蓝领", "都市家庭", "都市Z世代", "都市中产", "银发一族", "学生族"],
  },
  { key: "problem", title: "当前问题", single: false, custom: true, options: ["玩法不明确", "开始率低", "完成率低", "分享率低", "转化率低"] },
  { key: "reference", title: "希望获得", single: false, custom: true, options: ["玩法参考", "流程参考", "交互反馈", "激励策略", "分享策略"] },
];

export default function NewProject() {
  const [designType, setDesignType] = useState<DesignType>("interaction");
  const [stage, setStage] = useState<ProjectStage>("before");
  const [projectName, setProjectName] = useState("");
  const [projectMode, setProjectMode] = useState("新互动");
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [customOpen, setCustomOpen] = useState<Record<string, boolean>>({});
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [hasExistingResearch, setHasExistingResearch] = useState(false);

  useEffect(() => {
    const savedDraft = window.localStorage.getItem(draftKey);
    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft);
        if (draft.designType) setDesignType(draft.designType);
        if (draft.stage) setStage(draft.stage);
        if (typeof draft.projectName === "string") setProjectName(draft.projectName);
        if (draft.projectMode) setProjectMode(draft.projectMode);
        if (draft.answers) setAnswers(draft.answers);
        if (draft.customOpen) setCustomOpen(draft.customOpen);
        if (draft.customValues) setCustomValues(draft.customValues);
      } catch {
        window.localStorage.removeItem(draftKey);
      }
    }
    const taskId = window.localStorage.getItem("design-lab-active-research-task") || "";
    if (taskId) {
      fetch(`/api/research/tasks/${taskId}`, { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) return;
          const data = await response.json();
          if (data.task?.status === "completed" || Number(data.candidateCount || 0) > 0) {
            setHasExistingResearch(true);
          }
        })
        .catch(() => undefined);
    }
    setDraftLoaded(true);
  }, []);

  useEffect(() => {
    if (!draftLoaded) return;
    window.localStorage.setItem(draftKey, JSON.stringify({
      designType,
      stage,
      projectName,
      projectMode,
      answers,
      customOpen,
      customValues,
    }));
  }, [draftLoaded, designType, stage, projectName, projectMode, answers, customOpen, customValues]);

  const canContinue = useMemo(
    () => Boolean(
      projectName.trim()
      && (answers.goal?.length || customValues.goal?.trim())
      && (answers.game?.length || customValues.game?.trim()),
    ),
    [projectName, answers, customValues],
  );

  const toggle = (key: string, option: string, single: boolean) => {
    setAnswers((current) => {
      const selected = current[key] ?? [];
      return {
        ...current,
        [key]: single
          ? [option]
          : selected.includes(option)
            ? selected.filter((item) => item !== option)
            : [...selected, option],
      };
    });
  };

  const continueFlow = async (forceNewResearch = false) => {
    if (!canContinue) return;
    const draft = { designType, stage, projectName, projectMode, answers, customOpen, customValues };
    window.localStorage.setItem(draftKey, JSON.stringify(draft));
    if (hasExistingResearch && !forceNewResearch) {
      window.sessionStorage.removeItem("design-lab-start-research");
      window.location.href = "/projects/research";
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/research/tasks", {
        method: "POST",
        headers: { "content-type": "application/json", ...personalIdentityHeaders() },
        body: JSON.stringify(draft),
      });
      if (!response.ok) throw new Error("任务队列暂时不可用");
      const task = await response.json();
      window.localStorage.setItem("design-lab-active-research-task", task.id);
      window.sessionStorage.setItem("design-lab-start-research", "1");
      window.location.href = "/projects/research";
    } catch {
      createResearchTask(draft);
      setNotice("未连接到研究 Worker，已保存为本地研究任务");
      window.sessionStorage.setItem("design-lab-start-research", "1");
      window.setTimeout(() => { window.location.href = "/projects/research"; }, 700);
    }
  };

  return (
    <main className="new-project-page">
      <DashboardSidebar />

      <section className="project-form-shell">
        <header className="project-topbar">
          <div><span>新建项目</span><b>/</b><strong>项目需求</strong></div>
          <button type="button" onClick={() => { window.location.href = "/"; }}>保存并退出</button>
        </header>

        <div className="project-form">
          <FlowProgress active={1} />
          <div className="form-intro">
            <p>NEW PROJECT</p>
            <h1>告诉我们你正在做什么。</h1>
            <span>使用简单选择描述项目，后续将根据这些条件提供相关案例、反馈与策略。</span>
          </div>

          <section className="compact-section">
            <label>设计方向</label>
            <div className="segmented-options">
              <button className={designType === "interaction" ? "selected" : ""} type="button" onClick={() => setDesignType("interaction")}>
                <i className="purple-symbol game-symbol" aria-hidden="true"><img src="/game-controller-fill.svg" alt="" /></i><span><strong>互动设计</strong><small>玩法、流程、反馈与激励</small></span>
              </button>
              <button className={designType === "brand" ? "selected brand-selected" : ""} type="button" onClick={() => setDesignType("brand")}>
                <i className="orange-symbol brand-symbol" aria-hidden="true"><b /></i><span><strong>品牌设计</strong><small>图标、启动屏、品牌 IP 与主视觉</small></span>
              </button>
            </div>
          </section>

          <section className="field-section project-basics project-basics-before-stage">
            <div>
              <label htmlFor="project-name">项目名称</label>
              <input id="project-name" value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="例如：618 集卡互动优化" />
            </div>
            <div>
              <label>项目模式</label>
              <div className="chip-row">
                {["新互动", "已有互动优化"].map((item) => (
                  <button className={projectMode === item ? "active" : ""} type="button" key={item} onClick={() => setProjectMode(item)}>{item}</button>
                ))}
              </div>
            </div>
          </section>

          <section className="compact-section">
            <label>当前阶段</label>
            <div className="stage-options">
              {[
                ["before", "还没有设计方案", "获取策略与初步方向"],
                ["review", "已有设计方案", "进行评分与优化"],
                ["live", "项目已经上线", "查看指标与复盘"],
              ].map(([value, title, description]) => (
                <button key={value} className={stage === value ? "selected" : ""} type="button" onClick={() => setStage(value as ProjectStage)}>
                  <i>{stage === value ? "●" : "○"}</i><span><strong>{title}</strong><small>{description}</small></span>
                </button>
              ))}
            </div>
          </section>

          {designType === "interaction" && stage === "before" ? (
            <>
              {optionGroups.filter((group) => group.key !== "problem" || projectMode === "已有互动优化").map((group) => (
                <section className="field-section" key={group.key}>
                  <div className="field-heading"><label>{group.title}</label><small>{group.single ? "单选" : "可多选"}</small></div>
                  <div className="chip-row">
                    {group.options.map((option) => (
                      <button
                        className={answers[group.key]?.includes(option) ? "active" : ""}
                        type="button"
                        key={option}
                        onClick={() => toggle(group.key, option, group.single)}
                      >
                        {option}
                      </button>
                    ))}
                    {group.custom && (
                      <button
                        className={customOpen[group.key] ? "active custom-trigger" : "custom-trigger"}
                        type="button"
                        onClick={() => setCustomOpen((current) => ({ ...current, [group.key]: !current[group.key] }))}
                      >
                        ＋ 自定义
                      </button>
                    )}
                  </div>
                  {group.custom && customOpen[group.key] && (
                    <input
                      className="custom-input"
                      value={customValues[group.key] ?? ""}
                      onChange={(event) => setCustomValues((current) => ({ ...current, [group.key]: event.target.value }))}
                      placeholder={`输入自定义${group.title}`}
                      autoFocus
                    />
                  )}
                </section>
              ))}
            </>
          ) : (
            <section className="branch-placeholder">
              <span>{designType === "brand" ? "✦" : stage === "review" ? "◈" : "↗"}</span>
              <div>
                <strong>{designType === "brand" ? "品牌设计项目框架" : stage === "review" ? "方案评分流程" : "上线复盘流程"}</strong>
                <p>该分支将在互动设计的设计前流程完成后继续搭建。</p>
              </div>
            </section>
          )}

          <footer className="form-footer">
            <button className="secondary-button" type="button" onClick={() => { window.location.href = "/"; }}>取消</button>
            {hasExistingResearch && <button className="secondary-button" type="button" disabled={submitting || !canContinue} onClick={() => { void continueFlow(true); }}>
              按当前需求重新研究
            </button>}
            <button className="continue-button" type="button" disabled={submitting || !canContinue || designType !== "interaction" || stage !== "before"} onClick={() => { void continueFlow(false); }}>
              {submitting ? "正在创建研究任务…" : hasExistingResearch ? "查看已有研究" : "开始研究"} {!submitting && <img src="/arrow-right-regular.svg" alt="" />}
            </button>
          </footer>
        </div>
      </section>

      {notice && <div className="toast"><i />{notice}</div>}
    </main>
  );
}

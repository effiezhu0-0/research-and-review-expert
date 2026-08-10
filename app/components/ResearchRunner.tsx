"use client";

import { useEffect, useMemo, useState } from "react";
import {
  downloadResearchTask,
  ensureResearchTask,
  ResearchTask,
} from "../lib/localResearchStore";

type TaskState = "queued" | "running" | "completed" | "failed" | "needs_login" | "local";
type Draft = { answers?: Record<string, string[]>; customValues?: Record<string, string> };
type ResearchActivity = {
  phase?: "starting" | "searching" | "filtering" | "reading" | "saved" | "retrying" | "cooldown" | "completed" | "needs_login" | "failed";
  currentQuery?: string;
  queryIndex?: number;
  queryTotal?: number;
  browsedCount?: number;
  matchedCount?: number;
  detailCount?: number;
  agentCalls?: number;
  message?: string;
  updatedAt?: string;
};

const sourceCopy = [
  { id: "xiaohongshu", name: "小红书", detail: "竞品帖子、正文、截图与评论" },
];

export default function ResearchRunner({ onComplete }: { onComplete: () => void }) {
  const [taskId, setTaskId] = useState("");
  const [status, setStatus] = useState<TaskState>("queued");
  const [error, setError] = useState("");
  const [blockedSource, setBlockedSource] = useState("");
  const [actionUrl, setActionUrl] = useState("");
  const [candidateCount, setCandidateCount] = useState(0);
  const [activity, setActivity] = useState<ResearchActivity | null>(null);
  const [localTask, setLocalTask] = useState<ResearchTask | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [clock, setClock] = useState(0);

  useEffect(() => {
    let nextDraft: Draft = {};
    try {
      nextDraft = JSON.parse(window.localStorage.getItem("design-lab-project-draft") || "{}");
    } catch {}
    const id = window.localStorage.getItem("design-lab-active-research-task") || "";
    queueMicrotask(() => {
      setDraft(nextDraft);
      setTaskId(id);
      if (!id) {
        setLocalTask(ensureResearchTask());
        setStatus("local");
      }
    });
  }, []);

  useEffect(() => {
    const update = () => setClock(Date.now());
    const initial = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 5000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!taskId) return;
    let stopped = false;
    const check = async () => {
      try {
        const response = await fetch(`/api/research/tasks/${taskId}`, { cache: "no-store" });
        if (!response.ok) throw new Error("无法读取任务状态");
        const data = await response.json();
        if (stopped) return;
        setStatus(data.task.status);
        setError(data.task.error || "");
        setBlockedSource(data.task.blockedSource || "");
        setActionUrl(data.task.actionUrl || "");
        setCandidateCount(data.candidateCount || 0);
        setActivity(data.task.activity || null);
        if (data.task.status === "completed") {
          window.sessionStorage.removeItem("design-lab-start-research");
          window.setTimeout(onComplete, 650);
        }
      } catch {
        if (!stopped) setError("研究服务连接中断，正在重试");
      }
    };
    check();
    const timer = window.setInterval(check, 2500);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [taskId, onComplete]);

  const keywords = useMemo(() => {
    const values = Object.values(draft.answers || {}).flat().map((item) => item.replace(/（.*?）/g, ""));
    const customs = Object.values(draft.customValues || {}).filter(Boolean);
    return [...new Set([...values, ...customs])].slice(0, 8);
  }, [draft]);

  const headline = status === "queued" ? "研究任务正在排队"
    : status === "running" ? "Agent收集案例和反馈中..."
      : status === "completed" ? `已找到 ${candidateCount} 个候选案例`
        : status === "needs_login" ? "小红书搜索需要安全验证"
          : status === "failed" ? "研究任务执行失败"
            : "本地研究任务已准备";
  const progress = useMemo(() => {
    if (status === "completed") return 100;
    if (status !== "running" || !activity?.queryTotal) return 0;
    const phaseWeight = activity.phase === "searching" ? 0.18
      : activity.phase === "filtering" ? 0.48
        : activity.phase === "reading" ? 0.7
          : activity.phase === "saved" ? 0.9
            : activity.phase === "retrying" ? 0.12 : 0;
    const completedQueries = Math.max(0, (activity.queryIndex || 1) - 1);
    return Math.min(96, Math.round(((completedQueries + phaseWeight) / activity.queryTotal) * 100));
  }, [status, activity]);
  const sourceLabel = blockedSource === "xiaohongshu" ? "小红书" : "小红书";
  const heartbeatAge = activity?.updatedAt ? clock - new Date(activity.updatedAt).getTime() : 0;
  const slow = status === "running" && heartbeatAge > 45000;

  const resumeResearch = async () => {
    if (!taskId) return;
    const response = await fetch(`/api/research/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "queued" }),
    });
    if (response.ok) {
      setStatus("queued");
      setError("");
      setBlockedSource("");
      setActionUrl("");
    }
  };

  return (
    <section className={`research-runner status-${status}`}>
      <div className="runner-heading">
        <div><h1>{headline}</h1></div>
        <strong>{progress}%</strong>
      </div>
      <div className="runner-progress"><i style={{ width: `${progress}%` }} /></div>
      {status === "running" && (
        <div className={`runner-activity ${slow ? "slow" : ""}`} role="status">
          <strong>{slow ? "页面响应较慢，Agent正在自动恢复" : activity?.message || "正在准备小红书研究"}</strong>
          <span>
            关键词 {activity?.queryIndex || 0}/{activity?.queryTotal || 0}
            <b>·</b> 已浏览 {activity?.browsedCount || 0} 条
            <b>·</b> 相关 {activity?.matchedCount || 0} 条
            <b>·</b> 候选 {activity?.detailCount || candidateCount} 条
            {(activity?.agentCalls || 0) > 0 && <><b>·</b> Agent恢复 {activity?.agentCalls} 次</>}
          </span>
          {activity?.currentQuery && <em>当前：{activity.currentQuery}</em>}
        </div>
      )}
      <div className="runner-keywords"><small>本次检索条件</small><div>{(keywords.length ? keywords : ["营销互动", "用户反馈", "竞品案例"]).map((word) => <span key={word}>{word}</span>)}</div></div>
      <div className="runner-sources">
        {sourceCopy.map((source, index) => (
          <article className={`source-${source.id} ${status === "completed" ? "done" : status === "running" ? "active" : ""}`} key={source.name}>
            <i>{status === "completed" ? "✓" : index + 1}</i>
            <div><strong>{source.name}</strong><small>{source.detail}</small></div>
            <span>{status === "completed" ? "已完成" : status === "running" ? "采集中" : "等待中"}</span>
          </article>
        ))}
      </div>
      {status === "needs_login" && (
        <div className="runner-action-panel login">
          <div><strong>请完成{sourceLabel}安全验证</strong><span>任务已经暂停，不会在后台继续请求。若验证页提示“请求太频繁”，请不要刷新，先等待至少 10 分钟，再从小红书首页确认登录状态。</span></div>
          <div>
            <button type="button" onClick={() => window.open("https://www.xiaohongshu.com/", "_blank", "noopener,noreferrer")}>打开小红书首页</button>
            {actionUrl && <a href={actionUrl} target="_blank" rel="noreferrer">稍后打开验证页</a>}
            <button className="primary" type="button" onClick={resumeResearch}>已完成验证，继续研究</button>
          </div>
        </div>
      )}
      {status === "failed" && (
        <div className="runner-action-panel error">
          <div><strong>研究服务暂时中断</strong><span>{error || "请确认研究服务正在运行后重试。"}</span></div>
          <button className="primary" type="button" onClick={resumeResearch}>重新研究</button>
        </div>
      )}
      <footer>
        <span>{status === "local" ? "研究服务尚未连接。" : status === "queued" || status === "running" ? "你可以先离开，研究完成后再回来查看结果。" : ""}</span>
        <div>
          {localTask && <button type="button" onClick={() => downloadResearchTask(localTask)}>下载本地任务</button>}
          {(status === "failed" || status === "needs_login" || status === "local") && <button type="button" onClick={onComplete}>先查看案例页</button>}
        </div>
      </footer>
    </section>
  );
}

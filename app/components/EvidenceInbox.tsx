"use client";

import { useEffect, useState } from "react";
import {
  ensureResearchTask,
  readResearchEvidence,
  ResearchEvidence,
  ResearchTask,
} from "../lib/localResearchStore";

export default function EvidenceInbox() {
  const [task, setTask] = useState<ResearchTask | null>(null);
  const [items, setItems] = useState<ResearchEvidence[]>([]);
  const [activeTaskId, setActiveTaskId] = useState("");

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    const load = async (storedTaskId: string) => {
      try {
        const response = await fetch(`/api/research/tasks/${storedTaskId}/evidence`, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (!stopped) setItems(data.evidence || []);
      } catch {
        // The local fallback remains visible if the worker service is offline.
      }
    };
    const initialize = async () => {
      const storedTaskId = window.localStorage.getItem("design-lab-active-research-task");
      await Promise.resolve();
      if (stopped) return;
      if (!storedTaskId) {
        setTask(ensureResearchTask());
        setItems(readResearchEvidence());
        return;
      }
      setActiveTaskId(storedTaskId);
      await load(storedTaskId);
      timer = window.setInterval(() => void load(storedTaskId), 4000);
    };
    void initialize();
    return () => {
      stopped = true;
      if (timer) window.clearInterval(timer);
    };
  }, []);

  return (
    <section className="evidence-inbox">
      <div className="evidence-inbox-heading">
        <div>
          <small>小红书 · 真实来源</small>
          <h2>Agent 收集的案例和反馈</h2>
          <p>完整帖子截图与原文信息保存在一起，供你核对并作为后续归因依据。</p>
        </div>
        <span className="evidence-total">{items.length} 条证据</span>
      </div>
      {items.length ? (
        <div className="evidence-imported-list">
          {items.map((item) => (
            <article key={item.id}>
              <div className="evidence-media">
                {activeTaskId && item.screenshotKey ? (
                  // Screenshots are private R2 evidence served through this app, not optimizable public assets.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/research/tasks/${activeTaskId}/evidence/${item.id}/screenshot`}
                    alt={`${item.title}的完整小红书帖子截图`}
                    loading="lazy"
                  />
                ) : (
                  <div className="evidence-media-missing">当前证据没有保存完整截图</div>
                )}
              </div>
              <div className="evidence-card-body">
                <div className="evidence-card-meta">
                  <div>
                    <span className="source-pill">小红书</span>
                    {item.primaryDimension && <span className="dimension-pill">{item.primaryDimension}</span>}
                    {item.mediaType === "video" && <span className="media-pill video">视频 · 已浏览前 10 秒</span>}
                    {item.mediaType === "carousel" && <span className="media-pill carousel">多图 · 已逐张浏览</span>}
                  </div>
                  <span>{item.evidenceStrength || "单点观察"}</span>
                </div>
                <h3>{item.title}</h3>
                <p className="evidence-byline">
                  {[
                    item.author,
                    item.publishedAt || item.capturedAt.slice(0, 10),
                    item.likes ? `${item.likes} 赞` : "",
                    item.comments ? `${item.comments} 评` : "",
                  ].filter(Boolean).join(" · ")}
                </p>
                <div className="evidence-quotes">
                  {item.originalText.split("\n").filter(Boolean).slice(0, 3).map((sentence) => (
                    <p key={sentence}>“{sentence}”</p>
                  ))}
                </div>
                <div className="evidence-insight">
                  <p><b>表层</b><span>{item.observableFact || "帖子画面或原文直接展示了具体玩法机制。"}</span></p>
                  <p><b>深层</b><span>{item.designInterpretation || "这条证据仅支持单点判断，需要与其他帖子交叉核验。"}</span></p>
                  <p><b>可借鉴</b><span>{item.projectImplication || "将机制拆成可验证节点，再判断是否适合当前项目。"}</span></p>
                </div>
                {item.url && <a className="evidence-source-link" href={item.url} target="_blank" rel="noreferrer">查看完整来源</a>}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="evidence-empty">
          <strong>等待 Chrome Agent 回传证据</strong>
          <span>{task ? "Agent 完成帖子详情核验后，证据会自动出现在这里。" : "请先从项目需求页点击“开始研究”。"}</span>
        </div>
      )}
    </section>
  );
}

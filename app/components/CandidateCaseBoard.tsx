"use client";

import { useEffect, useState } from "react";
import { normalizeDesignField, researchProfiles } from "../lib/researchProfiles";

type Candidate = {
  id: string;
  source?: string;
  title: string;
  url?: string;
  author?: string;
  publishedAt?: string;
  capturedAt: string;
  excerpt?: string;
  screenshotKey?: string;
  mediaType?: string;
  keywords?: string[];
  relevance?: number;
  mediaKeys?: string[];
  valuableComments?: string[];
  selected?: boolean;
  excluded?: boolean;
};

const sourceNames: Record<string, string> = {
  xiaohongshu: "小红书",
  weibo: "微博",
  voice_of_user: "用户之声",
};

export default function CandidateCaseBoard({
  onSelectionChange,
}: {
  onSelectionChange: (ids: string[]) => void;
}) {
  const [items, setItems] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [taskId, setTaskId] = useState("");
  const [designField, setDesignField] = useState<"interaction" | "brand" | "marketing">("interaction");

  useEffect(() => {
    let stopped = false;
    const id = window.localStorage.getItem("design-lab-active-research-task") || "";
    try { setDesignField(normalizeDesignField(JSON.parse(window.localStorage.getItem("design-lab-project-draft") || "{}").designType)); } catch { /* keep default */ }
    queueMicrotask(() => {
      if (!stopped) setTaskId(id);
    });
    if (!id) return;
    const load = async () => {
      const response = await fetch(`/api/research/tasks/${id}/candidates`, { cache: "no-store" }).catch(() => null);
      if (!response?.ok || stopped) return;
      const data = await response.json();
      const sourceOrder: Record<string, number> = { xiaohongshu: 0, weibo: 1, voice_of_user: 2 };
      const candidates = (data.candidates || [])
        .filter((item: Candidate) => !item.excluded && item.source !== "xiaohongshu_visual")
        .sort((left: Candidate, right: Candidate) => {
          const platformDifference = (sourceOrder[left.source || ""] ?? 3) - (sourceOrder[right.source || ""] ?? 3);
          if (platformDifference) return platformDifference;
          return String(right.capturedAt || "").localeCompare(String(left.capturedAt || ""));
        });
      const chosen = candidates.filter((item: Candidate) => item.selected).map((item: Candidate) => item.id);
      setItems(candidates);
      setSelected(chosen);
      onSelectionChange(chosen);
    };
    void load();
    const timer = window.setInterval(load, 6000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [onSelectionChange]);

  const patch = async (candidateId: string, changes: { selected?: boolean; excluded?: boolean }) => {
    if (!taskId) return;
    await fetch(`/api/research/tasks/${taskId}/candidates`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ candidateId, ...changes }),
    });
  };

  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id];
    setSelected(next);
    onSelectionChange(next);
    void patch(id, { selected: next.includes(id) });
  };

  const renderCases = (candidates: Candidate[], emptyMessage: string) => candidates.length ? (
    <section className="case-grid">
      {candidates.map((item) => {
        const isStoreCase = item.source === "app_store" || item.source === "google_play";
        const isSelected = selected.includes(item.id);
        return <article
          className={`case-card evidence-card-detailed ${isSelected ? "selected" : ""}`}
          key={item.id}
          role="button"
          tabIndex={0}
          aria-pressed={isSelected}
          aria-label={`${isSelected ? "取消选择" : "选择"}${item.title}作为研究依据`}
          onClick={() => toggle(item.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              toggle(item.id);
            }
          }}
        >
          <div className="evidence-card-meta">
            <span className="evidence-selection-mark" aria-hidden="true">{isSelected ? "✓" : ""}</span>
            <div>
              <span>{`${sourceNames[item.source || ""] || "来源"} · ${(item.publishedAt || item.capturedAt).slice(0, 10)}`}</span>
              {item.url ? <a className="case-source-link" href={item.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>↗ 查看来源</a> : null}
            </div>
          </div>
          <div className="case-visual evidence-shot">
            {(item.mediaKeys?.length || item.screenshotKey) && taskId ? (
              // Private research screenshot served through the local app.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="candidate-case-image"
                src={item.mediaKeys?.length
                  ? `/api/research/tasks/${taskId}/candidates/${item.id}/media/0`
                  : `/api/research/tasks/${taskId}/candidates/${item.id}/screenshot`}
                alt={`${item.title}的来源截图`}
                loading="lazy"
              />
            ) : (
              <div className="post-mock"><strong>候选</strong><p>详情截图暂不可用</p></div>
            )}
          </div>
          <div className="case-body">
            <h2>{item.title}</h2>
            <p>{item.excerpt?.slice(0, 180) || "打开完整来源查看候选案例。"}</p>
            {!isStoreCase && <div className="candidate-feedback">
              <small>用户评论</small>
              {(item.valuableComments || []).length ? (
                (item.valuableComments || []).slice(0, 3).map((comment) => <blockquote key={comment}>{comment}</blockquote>)
              ) : (
                <p>该帖子暂未抓取到有价值的评论。</p>
              )}
            </div>}
            <div className="case-actions" onClick={(event) => event.stopPropagation()}>
              <button className={isSelected ? "selected-button" : ""} type="button" onClick={() => toggle(item.id)}>{isSelected ? "取消选择" : "选择此案例"}</button>
              <button type="button" onClick={() => {
                setItems((current) => current.filter((candidate) => candidate.id !== item.id));
                setSelected((current) => current.filter((id) => id !== item.id));
                void patch(item.id, { excluded: true, selected: false });
              }} aria-label={`删除案例 ${item.title}`}><img src="/icons/delete-regular.svg" width={24} height={24} alt="" /></button>
            </div>
          </div>
        </article>;
      })}
    </section>
  ) : <div className="evidence-empty brand-evidence-empty"><span>{emptyMessage}</span></div>;

  const feedbackItems = designField === "brand"
    ? items.filter((item) => item.source !== "app_store" && item.source !== "google_play") : items;
  const storeItems = items.filter((item) => item.source === "app_store" || item.source === "google_play");

  return (
    <>
      <div className="research-intro">
        <div>
          <p>{designField === "brand" ? "DIGITAL BRAND RESEARCH" : designField === "marketing" ? "CAMPAIGN RESEARCH" : "GAMEPLAY CASES & USER FEEDBACK"}</p>
          <h1>{researchProfiles[designField].caseTitle}</h1>
        </div>
      </div>

      <div className="filter-row">
        <div>
          <button className="active" type="button">全部 {items.length}</button>
        </div>
      </div>

      {designField === "brand" ? <div className="brand-evidence-sections">
        <section>
          <header><small>JD DESIGN FEEDBACK</small><h2>京东设计反馈</h2><p>启动图标、启动屏与 App 内界面的真实用户反馈。</p></header>
          {renderCases(feedbackItems, "暂未收集到与京东设计载体直接相关的反馈。")}
        </section>
        <section>
          <header><small>COMPETITOR STORE CASES</small><h2>App 商店竞品案例</h2><p>进入 App Store 与 Google Play 竞品详情页采集的可追溯案例。</p></header>
          {renderCases(storeItems, "暂未成功进入 App Store 或 Google Play 的竞品详情页。")}
        </section>
      </div> : items.length ? renderCases(items, "暂时没有候选案例") : (
        <div className="evidence-empty">
          <strong>暂时没有候选案例</strong>
          <span>请先开始研究；Playwright 成功打开帖子后，候选会自动出现在这里。</span>
        </div>
      )}
    </>
  );
}

"use client";

import { useEffect, useState } from "react";

type Candidate = {
  id: string;
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

export default function CandidateCaseBoard({
  onSelectionChange,
}: {
  onSelectionChange: (ids: string[]) => void;
}) {
  const [items, setItems] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [taskId, setTaskId] = useState("");

  useEffect(() => {
    let stopped = false;
    const id = window.localStorage.getItem("design-lab-active-research-task") || "";
    queueMicrotask(() => {
      if (!stopped) setTaskId(id);
    });
    if (!id) return;
    const load = async () => {
      const response = await fetch(`/api/research/tasks/${id}/candidates`, { cache: "no-store" }).catch(() => null);
      if (!response?.ok || stopped) return;
      const data = await response.json();
      const candidates = (data.candidates || []).filter((item: Candidate) => !item.excluded);
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

  return (
    <>
      <div className="research-intro">
        <div>
          <p>RESEARCH CANDIDATES</p>
          <h1>为你找到 {items.length} 个候选案例。</h1>
          <span>Playwright 已打开帖子详情并保存截图。请自行勾选采用哪些案例。</span>
        </div>
        <div className="selection-count"><small>已选择</small><strong>{selected.length}</strong><span>个案例</span></div>
      </div>

      <div className="filter-row">
        <div>
          <button className="active" type="button">全部 {items.length}</button>
          <button type="button">高度相关 {items.filter((item) => (item.relevance || 0) >= 80).length}</button>
          <button type="button">已收藏 {saved.length}</button>
        </div>
        <button type="button">筛选与排序⌄</button>
      </div>

      {items.length ? (
        <section className="case-grid">
          {items.map((item) => (
            <article className={`case-card ${selected.includes(item.id) ? "selected" : ""}`} key={item.id}>
              <div className="case-visual evidence-shot">
                <div className="source-bar">
                  <button
                    className={`evidence-check ${selected.includes(item.id) ? "checked" : ""}`}
                    type="button"
                    aria-label={selected.includes(item.id) ? "取消选择案例" : "选择案例"}
                    onClick={() => toggle(item.id)}
                  >
                    {selected.includes(item.id) && <img src="/check-circle-fill.svg" alt="" aria-hidden="true" />}
                  </button>
                  <div className="source-actions">
                    <b>{item.mediaType === "video" ? "视频帖子" : item.mediaType === "carousel" ? "多图帖子" : "帖子截图"}</b>
                    {item.url && <a className="case-source-link" href={item.url} target="_blank" rel="noreferrer">来源</a>}
                  </div>
                </div>
                {(item.mediaKeys?.length || item.screenshotKey) && taskId ? (
                  // Private research screenshot served through the local app.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="candidate-case-image"
                    src={item.mediaKeys?.length
                      ? `/api/research/tasks/${taskId}/candidates/${item.id}/media/0`
                      : `/api/research/tasks/${taskId}/candidates/${item.id}/screenshot`}
                    alt={`${item.title}的帖子详情截图`}
                    loading="lazy"
                  />
                ) : (
                  <div className="post-mock"><strong>候选</strong><p>详情截图暂不可用</p></div>
                )}
                <em>{item.relevance || 60}% 相关</em>
              </div>
              <div className="case-body">
                <div className="case-meta">
                  <span>小红书 · {item.author || "小红书用户"}</span>
                  <b>{(item.publishedAt || item.capturedAt).slice(0, 10)}</b>
                </div>
                <h2>{item.title}</h2>
                <p>{item.excerpt?.slice(0, 180) || "打开完整来源查看候选案例。"}</p>
                <div className="case-tags">
                  {(item.keywords || []).slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}
                </div>
                <div className="candidate-feedback">
                  <small>用户评论</small>
                  {(item.valuableComments || []).length ? (
                    (item.valuableComments || []).slice(0, 3).map((comment) => (
                      <blockquote key={comment}>{comment}</blockquote>
                    ))
                  ) : (
                    <p>该帖子暂未抓取到有价值的评论。</p>
                  )}
                </div>
                <div className="case-actions">
                  <button className={selected.includes(item.id) ? "selected-button" : ""} type="button" onClick={() => toggle(item.id)}>
                    {selected.includes(item.id) ? "已选为依据" : "选择为依据"}
                  </button>
                  <button type="button" onClick={() => setSaved((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])}>
                    {saved.includes(item.id) ? "★" : "☆"}
                  </button>
                  <button type="button" onClick={() => {
                    setItems((current) => current.filter((candidate) => candidate.id !== item.id));
                    setSelected((current) => current.filter((id) => id !== item.id));
                    void patch(item.id, { excluded: true, selected: false });
                  }}>排除</button>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <div className="evidence-empty">
          <strong>暂时没有候选案例</strong>
          <span>请先开始研究；Playwright 成功打开帖子后，候选会自动出现在这里。</span>
        </div>
      )}
    </>
  );
}

"use client";

export type ProjectDraft = {
  designType?: string;
  stage?: string;
  projectName?: string;
  projectMode?: string;
  answers?: Record<string, string[]>;
  customValues?: Record<string, string>;
};

export type ResearchTask = {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  status: "queued" | "running" | "completed";
  project: ProjectDraft;
  keywords: string[];
  sources: Array<{
    id: "xiaohongshu";
    label: string;
    access: "chrome-agent";
    requiredEvidence: string[];
  }>;
};

export type ResearchEvidence = {
  id: string;
  taskId: string;
  source: "xiaohongshu";
  sourceLabel: string;
  title: string;
  url?: string;
  author?: string;
  publishedAt?: string;
  capturedAt: string;
  originalText: string;
  screenshotPath?: string;
  mediaType: "post" | "carousel" | "comment" | "video" | "internal-feedback";
  keywords: string[];
  screenshotKey?: string;
  observableFact?: string;
  designInterpretation?: string;
  projectImplication?: string;
  evidenceStrength?: string;
  likes?: number;
  comments?: number;
  collects?: number;
  primaryDimension?: string;
};

const taskKey = "design-lab-research-task";
const evidenceKey = "design-lab-research-evidence";

export function buildResearchKeywords(draft: ProjectDraft) {
  const selected = Object.values(draft.answers || {})
    .flat()
    .map((item) => item.replace(/（.*?）/g, "").trim());
  const custom = Object.values(draft.customValues || {}).filter(Boolean);
  return [...new Set([draft.projectName || "", ...selected, ...custom].filter(Boolean))].slice(0, 12);
}

export function createResearchTask(draft: ProjectDraft): ResearchTask {
  const task: ResearchTask = {
    schemaVersion: 1,
    id: `research-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    status: "queued",
    project: draft,
    keywords: buildResearchKeywords(draft),
    sources: [
      {
        id: "xiaohongshu",
        label: "小红书",
        access: "chrome-agent",
        requiredEvidence: ["完整帖子截图", "原文", "作者", "发布日期", "来源链接", "代表性评论"],
      },
    ],
  };
  window.localStorage.setItem(taskKey, JSON.stringify(task));
  window.localStorage.removeItem(evidenceKey);
  return task;
}

export function readResearchTask(): ResearchTask | null {
  try {
    return JSON.parse(window.localStorage.getItem(taskKey) || "null");
  } catch {
    return null;
  }
}

export function ensureResearchTask(): ResearchTask | null {
  const existing = readResearchTask();
  if (existing) return existing;
  try {
    const draft = JSON.parse(window.localStorage.getItem("design-lab-project-draft") || "null");
    if (!draft?.projectName) return null;
    return createResearchTask(draft);
  } catch {
    return null;
  }
}

export function updateResearchTask(task: ResearchTask) {
  window.localStorage.setItem(taskKey, JSON.stringify(task));
}

export function readResearchEvidence(): ResearchEvidence[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(evidenceKey) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function saveResearchEvidence(items: ResearchEvidence[]) {
  window.localStorage.setItem(evidenceKey, JSON.stringify(items));
}

export function downloadResearchTask(task: ResearchTask) {
  const blob = new Blob([JSON.stringify(task, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${task.id}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function parseEvidenceFile(value: unknown, taskId: string): ResearchEvidence[] {
  const items = Array.isArray(value)
    ? value
    : typeof value === "object" && value && "evidence" in value
      ? (value as { evidence?: unknown }).evidence
      : [];
  if (!Array.isArray(items)) throw new Error("证据文件中没有 evidence 数组");

  return items.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`第 ${index + 1} 条证据格式不正确`);
    const raw = item as Partial<ResearchEvidence>;
    if (!raw.title || !raw.originalText || !raw.source) {
      throw new Error(`第 ${index + 1} 条证据缺少 title、originalText 或 source`);
    }
    return {
      id: raw.id || `evidence-${Date.now()}-${index}`,
      taskId,
      source: raw.source,
      sourceLabel: raw.sourceLabel || raw.source,
      title: raw.title,
      url: raw.url,
      author: raw.author,
      publishedAt: raw.publishedAt,
      capturedAt: raw.capturedAt || new Date().toISOString(),
      originalText: raw.originalText,
      screenshotPath: raw.screenshotPath,
      mediaType: raw.mediaType || "post",
      keywords: Array.isArray(raw.keywords) ? raw.keywords : [],
    };
  });
}

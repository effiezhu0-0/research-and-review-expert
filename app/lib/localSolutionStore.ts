"use client";

export type DesignPoint = {
  id: string;
  title: string;
  location: string;
  description: string;
  strategy: string;
  metric: string;
  metrics: string[];
  screenshot?: string;
  sourceImageIndex?: number;
  crop?: { x: number; y: number; width: number; height: number };
};

export type SolutionPackage = {
  projectId?: string;
  projectName: string;
  solutionName: string;
  version: string;
  sourceLink: string;
  fileName: string;
  importedAt: string;
  designPoints: DesignPoint[];
};

export type ValidationResult = "有效提升" | "无明显影响" | "负向影响" | "数据不足" | "无法归因";

export type RetrospectiveItem = {
  designPointId: string;
  metric: string;
  metricType: string;
  baseline: string;
  target: string;
  actual: string;
  period: string;
  result: ValidationResult;
  note: string;
};

export type Retrospective = {
  projectId?: string;
  projectName: string;
  launchedAt: string;
  summary: string;
  items: RetrospectiveItem[];
  savedAt: string;
};

const solutionKey = "design-lab-solution-package";
const retrospectiveKey = "design-lab-retrospective";
export const solutionReviewStorageKey = (projectId: string) => `design-lab-solution-review-${projectId}`;
const retrospectiveStorageKey = (projectId: string) => `${retrospectiveKey}-${projectId}`;

export function readSolution(): SolutionPackage | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(solutionKey) || "null") as SolutionPackage | null;
    if (!value) return null;
    return { ...value, designPoints: value.designPoints.map((point) => ({ ...point, metrics: point.metrics?.length ? point.metrics : point.metric ? [point.metric] : [] })) };
  } catch { return null; }
}

export function readSolutionForProject(projectId: string): SolutionPackage | null {
  if (!projectId) return readSolution();
  try {
    const value = JSON.parse(window.localStorage.getItem(`${solutionKey}-${projectId}`) || "null") as SolutionPackage | null;
    if (!value || value.projectId !== projectId) return null;
    return { ...value, designPoints: value.designPoints.map((point) => ({ ...point, metrics: point.metrics?.length ? point.metrics : point.metric ? [point.metric] : [] })) };
  } catch { return null; }
}

export function saveSolution(value: SolutionPackage) {
  window.localStorage.setItem(solutionKey, JSON.stringify(value));
  if (value.projectId) window.localStorage.setItem(`${solutionKey}-${value.projectId}`, JSON.stringify(value));
}

export function readRetrospective(): Retrospective | null {
  try { return JSON.parse(window.localStorage.getItem(retrospectiveKey) || "null"); } catch { return null; }
}

export function readRetrospectiveForProject(projectId: string): Retrospective | null {
  if (!projectId) return readRetrospective();
  try { return JSON.parse(window.localStorage.getItem(retrospectiveStorageKey(projectId)) || "null"); } catch { return null; }
}

export function saveRetrospective(value: Retrospective) {
  window.localStorage.setItem(retrospectiveKey, JSON.stringify(value));
  if (value.projectId) window.localStorage.setItem(retrospectiveStorageKey(value.projectId), JSON.stringify(value));
}

export function newDesignPoint(index = 0): DesignPoint {
  return { id: `point-${Date.now()}-${index}`, title: "", location: "", description: "", strategy: "", metric: "", metrics: [] };
}

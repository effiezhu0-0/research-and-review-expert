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
  projectName: string;
  launchedAt: string;
  summary: string;
  items: RetrospectiveItem[];
  savedAt: string;
};

const solutionKey = "design-lab-solution-package";
const retrospectiveKey = "design-lab-retrospective";

export function readSolution(): SolutionPackage | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(solutionKey) || "null") as SolutionPackage | null;
    if (!value) return null;
    return { ...value, designPoints: value.designPoints.map((point) => ({ ...point, metrics: point.metrics?.length ? point.metrics : point.metric ? [point.metric] : [] })) };
  } catch { return null; }
}

export function saveSolution(value: SolutionPackage) {
  window.localStorage.setItem(solutionKey, JSON.stringify(value));
}

export function readRetrospective(): Retrospective | null {
  try { return JSON.parse(window.localStorage.getItem(retrospectiveKey) || "null"); } catch { return null; }
}

export function saveRetrospective(value: Retrospective) {
  window.localStorage.setItem(retrospectiveKey, JSON.stringify(value));
}

export function newDesignPoint(index = 0): DesignPoint {
  return { id: `point-${Date.now()}-${index}`, title: "", location: "", description: "", strategy: "", metric: "", metrics: [] };
}

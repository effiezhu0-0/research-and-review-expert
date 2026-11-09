export type DesignField = "interaction" | "brand" | "marketing";

export const researchProfiles = {
  interaction: {
    caseTitle: "玩法案例与用户反馈调研",
    researchSources: ["小红书玩法与反馈", "小红书竞品视觉", "官方视觉趋势"],
    referenceSources: ["Behance", "Pinterest"],
  },
  brand: {
    caseTitle: "数字品牌案例与真实反馈",
    researchSources: ["Apple HIG / Material Design", "App Store / Google Play / Mobbin", "小红书 / 微博 / Voice of User"],
    referenceSources: ["Pinterest", "Behance"],
  },
  marketing: {
    caseTitle: "大促案例观察与真实反馈",
    researchSources: ["大促会场与开屏规范", "小红书 / 微博 / Voice of User", "公开视觉案例"],
    referenceSources: ["Pinterest", "Behance"],
  },
} as const;

export function normalizeDesignField(value?: string): DesignField {
  return value === "brand" || value === "marketing" ? value : "interaction";
}

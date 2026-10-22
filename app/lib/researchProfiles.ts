export type DesignField = "interaction" | "brand" | "marketing";

export const researchProfiles = {
  interaction: {
    caseTitle: "玩法案例与真实反馈",
    caseDescription: "先研究小红书中的真实玩法、体验问题与用户态度，再独立归纳视觉方向。",
    researchSources: ["小红书玩法与反馈", "小红书同类玩法视觉", "官方视觉趋势"],
    referenceSources: ["Behance", "Pinterest", "ZCOOL"],
  },
  brand: {
    caseTitle: "数字品牌案例与真实反馈",
    caseDescription: "按载体分别研究平台规范、官方商店与真实界面，再结合近两年公开反馈归纳方向。",
    researchSources: ["Apple HIG / Material Design", "App Store / Google Play / Mobbin", "小红书 / 微博 / Voice of User"],
    referenceSources: ["Pinterest", "Behance", "ZCOOL"],
  },
  marketing: {
    caseTitle: "大促案例观察与真实反馈",
    caseDescription: "会场与开屏保持独立载体判断，依据大促规范、小红书、微博与 Voice of User 形成方向。",
    researchSources: ["大促会场与开屏规范", "小红书 / 微博 / Voice of User", "公开视觉案例"],
    referenceSources: ["Pinterest", "Behance", "ZCOOL"],
  },
} as const;

export function normalizeDesignField(value?: string): DesignField {
  return value === "brand" || value === "marketing" ? value : "interaction";
}

import { getChatGPTUser } from "../../chatgpt-auth";

export type ResearchOwner = { id: string; name: string };

export async function researchOwner(request: Request): Promise<ResearchOwner> {
  const user = await getChatGPTUser();
  if (user) return { id: `chatgpt:${user.email}`, name: user.displayName };
  const deviceId = request.headers.get("x-design-lab-device-id")?.trim();
  const deviceName = request.headers.get("x-design-lab-device-name")?.trim();
  if (!deviceId || !/^device:[a-z0-9-]{8,80}$/i.test(deviceId)) {
    throw new Error("无法识别当前使用者，请刷新页面后重试");
  }
  return { id: deviceId, name: (deviceName || "当前使用者").slice(0, 80) };
}

export async function tokenHash(token: string) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
}

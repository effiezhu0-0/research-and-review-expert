import { getChatGPTUser } from "../../chatgpt-auth";

export async function GET() {
  const user = await getChatGPTUser();
  return Response.json({ displayName: user?.displayName || "当前使用者" });
}

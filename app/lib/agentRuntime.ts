export type AgentRuntimeConfig = {
  apiBase: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
  source: "personal" | "environment";
};

type AgentEnvironment = {
  AGENT_API_BASE?: string;
  AGENT_MODEL?: string;
  AGENT_API_KEY?: string;
  AGENT_TIMEOUT_MS?: string;
};

type ChatCompletionBody = Record<string, unknown> & { messages: unknown[] };

const headers = {
  apiBase: "x-design-lab-agent-api-base",
  model: "x-design-lab-agent-model",
  apiKey: "x-design-lab-agent-api-key",
} as const;

function normalizeEndpoint(apiBase: string) {
  const normalized = apiBase.replace(/\/$/, "");
  return normalized.endsWith("/chat/completions") ? normalized : `${normalized}/chat/completions`;
}

export function resolveAgentRuntime(
  request: Request,
  environment: AgentEnvironment,
  options: { timeoutMs?: number; missingMessage?: string } = {},
): AgentRuntimeConfig {
  const personal = {
    apiBase: request.headers.get(headers.apiBase)?.trim() || "",
    model: request.headers.get(headers.model)?.trim() || "",
    apiKey: request.headers.get(headers.apiKey)?.trim() || "",
  };
  const hasPersonalValue = Boolean(personal.apiBase || personal.model || personal.apiKey);
  if (hasPersonalValue && (!personal.apiBase || !personal.model || !personal.apiKey)) {
    throw new Error("个人 AI 配置不完整");
  }

  const apiBase = hasPersonalValue ? personal.apiBase : environment.AGENT_API_BASE?.trim() || "";
  const model = hasPersonalValue ? personal.model : environment.AGENT_MODEL?.trim() || "";
  const apiKey = hasPersonalValue ? personal.apiKey : environment.AGENT_API_KEY?.trim() || "";
  if (!apiBase || !model || !apiKey) {
    throw new Error(options.missingMessage || "Agent 尚未配置，请先在个人设置中连接 Agent");
  }

  let url: URL;
  try { url = new URL(apiBase); } catch { throw new Error("AI 服务地址格式不正确"); }
  if (hasPersonalValue && (url.protocol !== "https:" || /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(url.hostname))) {
    throw new Error("浏览器个人 AI 配置仅支持 HTTPS 公网接口；HTTP 内网模型继续由本地 Worker 配置");
  }
  if (!hasPersonalValue && !["http:", "https:"].includes(url.protocol)) {
    throw new Error("AGENT_API_BASE 必须是 HTTP 或 HTTPS 地址");
  }

  return {
    apiBase: url.toString().replace(/\/$/, ""),
    model,
    apiKey,
    timeoutMs: Number(environment.AGENT_TIMEOUT_MS || options.timeoutMs || 45000),
    source: hasPersonalValue ? "personal" : "environment",
  };
}

export function createAgentRuntime(config: AgentRuntimeConfig) {
  return {
    config,
    async chatCompletions(body: ChatCompletionBody) {
      const response = await fetch(normalizeEndpoint(config.apiBase), {
        method: "POST",
        signal: AbortSignal.timeout(config.timeoutMs),
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({ ...body, model: config.model }),
      });
      return response;
    },
  };
}

export function requestAgentRuntime(
  request: Request,
  environment: AgentEnvironment,
  options?: { timeoutMs?: number; missingMessage?: string },
) {
  return createAgentRuntime(resolveAgentRuntime(request, environment, options));
}

function endpoint(apiBase) {
  const normalized = String(apiBase || "").replace(/\/$/, "");
  return normalized.endsWith("/chat/completions") ? normalized : `${normalized}/chat/completions`;
}

export function createLocalAgentRuntime(options = {}) {
  const config = {
    apiBase: options.apiBase || process.env.AGENT_API_BASE || "",
    apiKey: options.apiKey || process.env.AGENT_API_KEY || "",
    model: options.model || process.env.AGENT_MODEL || "",
    timeoutMs: Number(options.timeoutMs || process.env.AGENT_TIMEOUT_MS || 45000),
  };
  const enabled = process.env.AGENT_ENABLED !== "false"
    && Boolean(config.apiBase && config.apiKey && config.model);

  return {
    config,
    enabled,
    async chatCompletions(body) {
      if (!enabled) throw new Error("本地 Agent Runtime 尚未配置");
      return fetch(endpoint(config.apiBase), {
        method: "POST",
        signal: AbortSignal.timeout(config.timeoutMs),
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({ ...body, model: config.model }),
      });
    },
  };
}

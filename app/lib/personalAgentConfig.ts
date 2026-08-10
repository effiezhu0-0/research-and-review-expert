export type PersonalAgentConfig = { apiBase: string; model: string; apiKey: string };

const storageKey = "design-lab-personal-ai-config";

export function readPersonalAgentConfig(): PersonalAgentConfig | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey) || "{}") as Partial<PersonalAgentConfig>;
    if (!value.apiBase || !value.model || !value.apiKey) return null;
    return { apiBase: value.apiBase, model: value.model, apiKey: value.apiKey };
  } catch { return null; }
}

export function savePersonalAgentConfig(config: PersonalAgentConfig) {
  window.localStorage.setItem(storageKey, JSON.stringify(config));
}

export function clearPersonalAgentConfig() {
  window.localStorage.removeItem(storageKey);
}

export function personalAgentHeaders(): Record<string, string> {
  const config = readPersonalAgentConfig();
  if (!config) return {};
  return {
    "x-design-lab-agent-api-base": config.apiBase,
    "x-design-lab-agent-model": config.model,
    "x-design-lab-agent-api-key": config.apiKey,
  };
}

"use client";

import { useEffect, useState } from "react";
import { clearPersonalAgentConfig, readPersonalAgentConfig, savePersonalAgentConfig } from "../lib/personalAgentConfig";

export default function PersonalAISettings({ trigger = "button" }: { trigger?: "button" | "menu" }) {
  const [open, setOpen] = useState(false);
  const [apiBase, setApiBase] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const config = readPersonalAgentConfig();
    if (config) queueMicrotask(() => { setApiBase(config.apiBase); setModel(config.model); setApiKey(config.apiKey); });
  }, []);
  const save = () => {
    try {
      const url = new URL(apiBase.trim());
      if (url.protocol !== "https:") throw new Error("个人 API 地址必须以 https:// 开头");
      if (!model.trim() || !apiKey.trim()) throw new Error("请填写模型名称和 API Key");
      savePersonalAgentConfig({ apiBase: apiBase.trim().replace(/\/$/, ""), model: model.trim(), apiKey: apiKey.trim() });
      setNotice("已仅保存到当前浏览器");
      window.setTimeout(() => { setNotice(""); setOpen(false); }, 700);
    } catch (error) { setNotice(error instanceof Error ? error.message : "配置格式不正确"); }
  };
  const clear = () => { clearPersonalAgentConfig(); setApiBase(""); setModel(""); setApiKey(""); setNotice("已清除本机个人配置"); };
  return <>
    <button className={trigger === "menu" ? "personal-ai-menu-trigger" : "personal-ai-trigger"} type="button" aria-label="个人 AI 配置" onClick={() => setOpen(true)}>{trigger === "menu" ? "•••" : "个人 AI 配置"}</button>
    {open && <div className="personal-ai-layer" role="dialog" aria-modal="true" aria-labelledby="personal-ai-title"><div className="personal-ai-panel">
      <div className="personal-ai-heading"><div><small>PERSONAL AI</small><h2 id="personal-ai-title">个人 AI 配置</h2><p>仅保存在当前浏览器；生成策略时临时使用，不写入团队数据库。</p></div><button type="button" aria-label="关闭" onClick={() => setOpen(false)}>×</button></div>
      <label>模型接口地址<input value={apiBase} onChange={(event) => setApiBase(event.target.value)} placeholder="https://api.example.com/v1" autoComplete="url" /></label>
      <label>模型名称<input value={model} onChange={(event) => setModel(event.target.value)} placeholder="例如 gpt-4.1-mini" autoComplete="off" /></label>
      <label>个人 API Key<input value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="仅保存在本机" type="password" autoComplete="off" /></label>
      <p className="personal-ai-note">仅支持兼容 OpenAI Chat Completions 的 HTTPS 接口。你的 Key 不会被保存到项目或服务器。</p>{notice && <p className="personal-ai-notice">{notice}</p>}
      <footer><button type="button" onClick={clear}>清除本机配置</button><button className="personal-ai-save" type="button" onClick={save}>保存配置</button></footer>
    </div></div>}
  </>;
}

"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { clearPersonalAgentConfig, readPersonalAgentConfig, savePersonalAgentConfig } from "../lib/personalAgentConfig";
import { personalIdentityHeaders } from "../lib/personalIdentity";

export default function PersonalAISettings({ trigger = "button" }: { trigger?: "button" | "menu" }) {
  const [open, setOpen] = useState(false);
  const [apiBase, setApiBase] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [notice, setNotice] = useState("");
  const [workerConfig, setWorkerConfig] = useState("");
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
  const createWorkerPair = async () => {
    setNotice("正在生成本机配对信息…");
    let response: Response | null = null;
    try {
      response = await fetch("/api/workers/pair", {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json", ...personalIdentityHeaders() },
        body: "{}",
      });
    } catch (error) {
      setNotice(`无法连接配对服务：${error instanceof Error ? error.message : "请检查网络后重试"}`);
      return;
    }
    const data = await response?.json().catch(() => null);
    if (!response.ok) { setNotice(data?.error || (response.status === 401 ? "登录状态已失效，请刷新页面后重新登录" : `生成本机配对信息失败（服务返回 ${response.status}）`)); return; }
    setWorkerConfig(`DASHBOARD_URL=${window.location.origin}\nWORKER_OWNER_ID=${data.ownerId}\nWORKER_PAIR_TOKEN=${data.pairToken}`);
    setNotice("已生成，仅用于你的本机 Worker");
  };
  const copyWorkerPair = async () => {
    if (!workerConfig) return;
    await navigator.clipboard?.writeText(workerConfig).catch(() => undefined);
    setNotice("已复制到剪贴板");
  };
  return <>
    <button className={trigger === "menu" ? "personal-ai-menu-trigger" : "personal-ai-trigger"} type="button" aria-label="个人 AI 配置" onClick={() => setOpen(true)}>{trigger === "menu" ? "•••" : "个人 AI 配置"}</button>
    {open && typeof document !== "undefined" && createPortal(<div className="personal-ai-layer" role="dialog" aria-modal="true" aria-labelledby="personal-ai-title"><div className="personal-ai-panel">
      <button className="personal-ai-close" type="button" aria-label="关闭" onClick={() => setOpen(false)}>×</button>
      <div className="personal-ai-heading"><div><small>PERSONAL AI</small><h2 id="personal-ai-title">个人 AI 配置</h2><p>仅保存在当前浏览器；生成策略时临时使用，不写入团队数据库。</p></div></div>
      <label><span>AI 服务地址<small>从你购买或申请 API 的服务商文档中复制。</small></span><input value={apiBase} onChange={(event) => setApiBase(event.target.value)} placeholder="例如 https://api.openai.com/v1" autoComplete="url" /></label>
      <label><span>要使用的模型<small>API Key 只证明你有权限；还需要告诉系统用哪一个模型。</small></span><input value={model} onChange={(event) => setModel(event.target.value)} placeholder="例如 gpt-4.1-mini" autoComplete="off" /></label>
      <label>个人 API Key<input value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="仅保存在本机" type="password" autoComplete="off" /></label>
      <p className="personal-ai-note">仅支持兼容 OpenAI Chat Completions 的 HTTPS 接口。你的 Key 不会被保存到项目或服务器。</p>{notice && <p className="personal-ai-notice">{notice}</p>}
      <section className="worker-pairing"><div><strong>本机研究 Worker</strong><p>让你电脑上已登录小红书的 Worker 只处理你创建的任务。</p></div><button type="button" onClick={() => { void createWorkerPair(); }}>生成本机配对信息</button>{workerConfig && <><pre>{workerConfig}</pre><button type="button" onClick={() => { void copyWorkerPair(); }}>复制配对信息</button></>}</section>
      <footer><button type="button" onClick={clear}>清除本机配置</button><button className="personal-ai-save" type="button" onClick={save}>保存配置</button></footer>
    </div></div>, document.body)}
  </>;
}

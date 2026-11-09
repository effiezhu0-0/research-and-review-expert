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
    setNotice("连接信息已生成，请妥善保管，不要分享给其他人。");
  };
  const copyWorkerPair = async () => {
    if (!workerConfig) return;
    try {
      if (!navigator.clipboard) throw new Error();
      await navigator.clipboard.writeText(workerConfig);
      setNotice("已复制连接信息，请按下方说明完成连接。");
    } catch { setNotice("复制失败，请手动复制下方连接信息。"); }
  };
  return <>
    <button className={trigger === "menu" ? "personal-ai-menu-trigger" : "personal-ai-trigger"} type="button" aria-label="个人 AI 配置" onClick={() => setOpen(true)}>{trigger === "menu" ? <img src="/figma-more.svg" alt="" /> : "个人 AI 配置"}</button>
    {open && typeof document !== "undefined" && createPortal(<div className="personal-ai-layer" role="dialog" aria-modal="true" aria-labelledby="personal-ai-title"><div className="personal-ai-panel">
      <button className="personal-ai-close" type="button" aria-label="关闭" onClick={() => setOpen(false)}>×</button>
      <div className="personal-ai-heading"><div><small>PERSONAL AI</small><h2 id="personal-ai-title">连接你的 AI 服务</h2><p>填写服务商提供的地址、模型名称和密钥，让看板使用你自己的 AI 服务。配置仅保存在当前浏览器中。</p></div></div>
      <label><span>1. AI 服务地址<small>在服务商的开发者文档中找到 API 地址并复制到这里。地址需以 https:// 开头；如示例中包含 /v1，请保留它。</small></span><input value={apiBase} onChange={(event) => setApiBase(event.target.value)} placeholder="例如 https://api.openai.com/v1" autoComplete="url" /></label>
      <label><span>2. 模型名称<small>在服务商的模型列表中找到要使用的模型，复制其完整名称。</small></span><input value={model} onChange={(event) => setModel(event.target.value)} placeholder="例如 gpt-4.1-mini" autoComplete="off" /></label>
      <label><span>3. API 密钥<small>在服务商的开发者控制台创建并复制密钥。请勿将密钥分享给其他人。</small></span><input value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="输入你的 API 密钥" type="password" autoComplete="off" /></label>
      <p className="personal-ai-note">目前支持兼容 OpenAI Chat Completions 的 HTTPS 服务。</p>{notice && <p className="personal-ai-notice" role="status">{notice}</p>}
      <section className="worker-pairing"><div><strong>连接本机调研</strong><p>点击“生成本机配对信息”，然后复制并粘贴到看板项目文件夹里的 .env 文件中。若文件已有同名内容，请替换原来的内容；保存后重新启动看板并登录小红书。</p><p>配对信息包含密钥，请勿分享或上传。</p></div><button type="button" onClick={() => { void createWorkerPair(); }}>生成本机配对信息</button>{workerConfig && <><pre>{workerConfig}</pre><button type="button" onClick={() => { void copyWorkerPair(); }}>复制连接信息</button></>}</section>
      <footer><button type="button" onClick={clear}>清除本机配置</button><button className="personal-ai-save" type="button" onClick={save}>保存配置</button></footer>
    </div></div>, document.body)}
  </>;
}

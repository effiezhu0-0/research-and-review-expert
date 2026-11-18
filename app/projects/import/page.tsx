"use client";

import { ChangeEvent, useEffect, useState } from "react";
import DashboardSidebar from "../../components/DashboardSidebar";
import ProjectTopbar from "../../components/ProjectTopbar";
import FlowProgress from "../../components/FlowProgress";
import StageProgress from "../../components/StageProgress";
import NightingaleIcon from "../../components/NightingaleIcon";
import { DesignPoint, newDesignPoint, readSolutionForProject, saveSolution } from "../../lib/localSolutionStore";
import { personalAgentHeaders } from "../../lib/personalAgentConfig";
import { saveSolutionImages } from "../../lib/solutionImageStore";

const strategyOptions = ["突出核心利益", "降低参与门槛", "简化任务流程", "强化即时反馈", "增强奖励感知", "建立连续目标", "促进社交传播", "提升信任感", "自定义策略"];

const compactMetric = (value: string) => {
  const text = value.trim();
  if (/弹窗.*曝光|曝光.*弹窗/.test(text)) return "弹窗曝光率";
  if (/弹窗.*任务|进入任务|任务流程.*转化/.test(text)) return "任务进入率";
  if (/兑换.*完成|最终兑换/.test(text)) return "兑换完成率";
  if (/任务.*完成/.test(text)) return "任务完成率";
  if (/按钮.*点击|点击.*按钮|用户点击|点击.*比例/.test(text)) return "按钮点击率";
  if (/参与/.test(text)) return "参与率";
  if (/分享/.test(text)) return "分享率";
  if (/留存/.test(text)) return "留存率";
  return text.length > 10 ? text.slice(0, 8).replace(/[、，,；;。]$/, "") + "率" : text;
};
const normalizeMetrics = (metrics: string[]) => [...new Set(metrics.flatMap((metric) => metric.split(/[、，,；;。]+/)).map(compactMetric).filter(Boolean))].slice(0, 4);

export default function ImportSolutionPage() {
  const [projectName, setProjectName] = useState("");
  const [solutionName, setSolutionName] = useState("");
  const [version, setVersion] = useState("");
  const [sourceLink, setSourceLink] = useState("");
  const [fileName, setFileName] = useState("");
  const [points, setPoints] = useState<DesignPoint[]>([]);
  const [toast, setToast] = useState("");
  const [images, setImages] = useState<Array<{ name: string; dataUrl: string }>>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState("等待上传方案图片");
  const [metricDrafts, setMetricDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    const projectId = window.localStorage.getItem("design-lab-current-project-id") || "";
    const existing = readSolutionForProject(projectId);
    if (existing) {
      setProjectName(existing.projectName); setSolutionName(existing.solutionName); setVersion(existing.version);
      setSourceLink(existing.sourceLink); setFileName(existing.fileName); setPoints(existing.designPoints.map((point) => ({ ...point, metrics: normalizeMetrics(point.metrics || []) })));
      return;
    }
    try {
      const draft = JSON.parse(window.localStorage.getItem("design-lab-project-draft") || "{}");
      setProjectName(draft.projectName || "");
      setSolutionName(draft.solutionName || "");
      setVersion(draft.version || "");
    } catch { /* use empty state */ }
  }, []);

  const updatePoint = (id: string, field: keyof DesignPoint, value: string) => {
    setPoints((current) => current.map((point) => point.id === id ? { ...point, [field]: value } : point));
  };
  const updateMetrics = (id: string, metrics: string[]) => setPoints((current) => current.map((point) => point.id === id ? { ...point, metrics, metric: metrics.join("、") } : point));
  const commitMetric = (point: DesignPoint) => {
    const value = (metricDrafts[point.id] || "").trim();
    if (!value) return;
    updateMetrics(point.id, normalizeMetrics([...point.metrics, ...value.split(/[、，,；;]+/)]));
    setMetricDrafts((current) => ({ ...current, [point.id]: "" }));
  };
  const cropScreenshot = (dataUrl: string, crop?: DesignPoint["crop"]) => new Promise<string>((resolve) => {
    if (!crop) { resolve(dataUrl); return; }
    const image = new Image(); image.onload = () => { const canvas = document.createElement("canvas"); const x = Math.max(0, Math.min(1, crop.x)); const y = Math.max(0, Math.min(1, crop.y)); const width = Math.max(.05, Math.min(1 - x, crop.width)); const height = Math.max(.05, Math.min(1 - y, crop.height)); const sourceWidth = image.width * width; const sourceHeight = image.height * height; const maxWidth = 480; canvas.width = Math.min(maxWidth, sourceWidth); canvas.height = Math.round(canvas.width * sourceHeight / sourceWidth); canvas.getContext("2d")?.drawImage(image, image.width * x, image.height * y, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL("image/jpeg", .72)); }; image.onerror = () => resolve(dataUrl); image.src = dataUrl;
  });

  const submit = () => {
    const validPoints = points.filter((point) => point.title.trim());
    if (!projectName.trim() || !solutionName.trim() || !validPoints.length) {
      setToast("请填写项目、方案名称，并至少添加一个设计点"); return;
    }
    saveSolution({ projectId: window.localStorage.getItem("design-lab-current-project-id") || undefined, projectName: projectName.trim(), solutionName: solutionName.trim(), version: version.trim(), sourceLink: sourceLink.trim(), fileName, importedAt: new Date().toISOString(), designPoints: validPoints });
    let projectDraft: Record<string, unknown> = {};
    try { projectDraft = JSON.parse(window.localStorage.getItem("design-lab-project-draft") || "{}"); } catch { /* keep an empty context */ }
    window.localStorage.setItem("design-lab-project-draft", JSON.stringify({ ...projectDraft, projectName: projectName.trim(), stage: "review" }));
    window.location.href = "/projects/score";
  };

  const loadFiles = async (incoming: File[]) => {
    const files = incoming.filter((file) => file.type.startsWith("image/")).slice(0, 5);
    if (!files.length) return;
    const loaded = await Promise.all(files.map((file) => new Promise<{ name: string; dataUrl: string }>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve({ name: file.name, dataUrl: String(reader.result || "") }); reader.onerror = reject; reader.readAsDataURL(file);
    })));
    setImages(loaded); setFileName(loaded.map((item) => item.name).join("、")); setAnalysisStatus(`已上传 ${loaded.length} 张图片，等待 Agent 识别`);
  };
  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => { void loadFiles(Array.from(event.target.files || [])); };

  const analyzeImages = async () => {
    if (!images.length) { setToast("请先上传方案图片"); return; }
    setAnalyzing(true); setAnalysisStatus("Agent 正在识别页面、流程和关键设计决策…");
    const response = await fetch("/api/solution-analysis", { method: "POST", headers: { "content-type": "application/json", ...personalAgentHeaders() }, body: JSON.stringify({ images: images.map((item) => item.dataUrl), projectName, solutionName }) }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok || !Array.isArray(data?.designPoints)) setAnalysisStatus(data?.error || "识别失败，请检查 Agent 配置后重试");
    else { const recognized = await Promise.all(data.designPoints.map(async (point: Partial<DesignPoint>, index: number) => { const sourceImageIndex = Math.max(0, Math.min(images.length - 1, Number(point.sourceImageIndex || 0))); return { ...newDesignPoint(index), ...point, metrics: normalizeMetrics(point.metrics || (point.metric ? [point.metric] : [])), sourceImageIndex, screenshot: await cropScreenshot(images[sourceImageIndex].dataUrl, point.crop) }; })); setPoints(recognized); setAnalysisStatus(`已识别 ${recognized.length} 个设计点，请设计师确认并修改`); }
    setAnalyzing(false);
  };
  const continueToIdentify = async () => {
    if (!solutionName.trim() || !images.length) { setToast("请填写方案名称并上传方案图片"); return; }
    try {
      await saveSolutionImages(images);
      window.sessionStorage.setItem("design-lab-solution-intake", JSON.stringify({ projectName, solutionName: solutionName.trim(), version, entryMode: "import" }));
      window.sessionStorage.setItem("design-lab-entry-source", "project-flow");
      window.location.href = "/projects/import/identify?entry=import";
    } catch { setToast("方案图片过大，请减少图片数量或尺寸后重试"); }
  };

  return <main className="research-page solution-workflow">
    <DashboardSidebar projectActive />
    <section className="research-main">
      <ProjectTopbar section="导入已有方案" demo="可编辑" />
      <div className="solution-content">
        <StageProgress steps={["导入方案", "识别设计点"]} active={1} />
        <header className="solution-hero"><p>SOLUTION INTAKE</p><h1>导入方案，并把设计决策绑定到研究依据。</h1><span>保留方案版本、关键设计点和预期指标，后续评价与上线验证将沿用这些信息。</span></header>

        <section className="workflow-section solution-basics">
          <div className="workflow-heading"><div><small>01</small><h2>方案信息</h2></div></div>
          <div className="form-grid">
            <label>方案名称<input value={solutionName} onChange={(e) => setSolutionName(e.target.value)} placeholder="例如：集卡主流程优化方案" /></label>
            <label>版本<input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="例如：V1.0" /></label>
          </div>
          <div className="solution-source"><label className="file-picker" onDragOver={(event) => { event.preventDefault(); event.currentTarget.classList.add("dragging"); }} onDragLeave={(event) => event.currentTarget.classList.remove("dragging")} onDrop={(event) => { event.preventDefault(); event.currentTarget.classList.remove("dragging"); void loadFiles(Array.from(event.dataTransfer.files || [])); }}><input type="file" accept="image/*" multiple onChange={chooseFile} /><span><NightingaleIcon name="arrowUp" size={20} /></span><b>{fileName || "拖拽或上传方案截图、流程图"}</b><small>{fileName ? "点击或拖拽可替换，最多 5 张" : "下一步将由 Agent 识别关键设计点"}</small></label>{images.length > 0 && <button className="remove-solution-images" type="button" onClick={() => { setImages([]); setFileName(""); }}>移除</button>}</div>
          {images.length > 0 && <div className="image-preview-row">{images.map((item) => <figure key={item.name}><img src={item.dataUrl} alt={item.name} /><figcaption>{item.name}</figcaption></figure>)}</div>}
        </section>
        <footer className="workflow-footer"><button className="secondary-button" type="button" onClick={() => { window.location.href = "/"; }}>取消</button><button className="primary-workflow-button" type="button" onClick={continueToIdentify}>继续识别设计点 <NightingaleIcon name="arrowRight" size={18} /></button></footer>
      </div>
    </section>
    {toast && <div className="toast" role="status"><i />{toast}</div>}
  </main>;
}

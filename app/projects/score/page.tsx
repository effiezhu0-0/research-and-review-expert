"use client";

import DashboardSidebar from "../../components/DashboardSidebar";
import FlowProgress from "../../components/FlowProgress";
import ProjectRequirementSummary from "../../components/ProjectRequirementSummary";
import ProjectTopbar from "../../components/ProjectTopbar";

const dimensions = [
  ["目标一致性", "方案是否直接回应营销目标和关键问题"],
  ["用户价值", "方案是否符合目标用户的动机与使用门槛"],
  ["体验有效性", "流程、反馈和激励是否支持用户完成任务"],
  ["归因可信度", "关键设计决策是否有案例、反馈或数据依据"],
];

export default function ScorePage() {
  return (
    <main className="research-page score-page">
      <DashboardSidebar active="projects" />
      <section className="research-main">
        <ProjectTopbar section="设计方案评分" demo="静态 Demo" />
        <div className="score-content">
          <FlowProgress active={4} />
          <ProjectRequirementSummary />
          <div className="score-intro"><p>DESIGN REVIEW</p><h1>上传设计方案，检查它是否回应了归因结论。</h1><span>评分只用于验证设计依据和识别风险，不替代设计判断。</span></div>
          <section className="upload-panel">
            <div className="upload-icon">＋</div><h2>上传设计方案</h2><p>支持设计稿截图、流程图或方案 PDF；当前为可点击的静态演示入口。</p>
            <button type="button">选择文件</button>
          </section>
          <section className="score-dimensions">
            <div className="strategy-heading"><div><small>SCORING FRAMEWORK</small><h2>四个评分维度</h2></div><span>上传后将按同一基准输出得分、证据和风险</span></div>
            <div>{dimensions.map(([title, detail], index) => <article key={title}><i>{index + 1}</i><h3>{title}</h3><p>{detail}</p><span>等待方案</span></article>)}</div>
          </section>
        </div>
      </section>
    </main>
  );
}

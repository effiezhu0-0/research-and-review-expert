import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("keeps product metadata and dashboard entry point", async () => {
  const [layout, page] = await Promise.all([
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
  ]);

  assert.match(layout, /设计调研与评审专家/);
  assert.match(layout, /lang="zh-CN"/);
  assert.match(page, /创建空白项目/);
  assert.match(page, /DashboardSidebar/);
  assert.doesNotMatch(page, /_sites-preview|SkeletonPreview/);
});

test("project flow has three steps and drafts are not treated as created projects", async () => {
  const [flow, home, sidebar, newProject, savedProjects] = await Promise.all([
    readFile(new URL("app/components/FlowProgress.tsx", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/components/DashboardSidebar.tsx", root), "utf8"),
    readFile(new URL("app/projects/new/page.tsx", root), "utf8"),
    readFile(new URL("app/lib/savedProjects.ts", root), "utf8"),
  ]);
  assert.match(flow, /\["项目需求", "案例与反馈", "归因结论"\]/);
  assert.doesNotMatch(flow, /方案评价|上线复盘/);
  assert.match(home, /design-lab-active-research-task/);
  assert.match(sidebar, /readSavedProjects/);
  assert.match(home, /openSavedProject/);
  assert.match(savedProjects, /design-lab-saved-projects/);
  assert.match(newProject, /研究开放度/);
  assert.match(newProject, /项目背景/);
  assert.match(newProject, /读取并自动填写/);
  assert.match(newProject, /JSON\.stringify\(\{ \.\.\.meetingContext, designType \}\)/);
  assert.ok(newProject.indexOf("decision-posture-section") > newProject.indexOf("entry-solution-section"));
  assert.match(newProject, /type="range"/);
  assert.match(newProject, /setDecisionPosture/);
});

test("hybrid research agent remains bounded and optional", async () => {
  const [agent, agentRuntime, worker, board, envExample] = await Promise.all([
    readFile(new URL("scripts/research-browser-agent.mjs", root), "utf8"),
    readFile(new URL("scripts/agent-runtime.mjs", root), "utf8"),
    readFile(new URL("scripts/playwright-research-worker.mjs", root), "utf8"),
    readFile(new URL("app/components/CandidateCaseBoard.tsx", root), "utf8"),
    readFile(new URL(".env.example", root), "utf8"),
  ]);

  assert.match(agentRuntime, /AGENT_ENABLED/);
  assert.match(agentRuntime, /chatCompletions/);
  assert.match(agent, /AGENT_MAX_CALLS_PER_TASK/);
  assert.match(agent, /xiaohongshu\\\.com/);
  assert.match(agent, /request_human/);
  assert.match(agent, /isSafeClickableElement/);
  assert.match(agent, /scroll_element/);
  assert.match(agent, /next_media/);
  assert.match(agent, /previous_media/);
  assert.match(agent, /clickMediaDirection/);
  assert.match(agent, /capture_frame/);
  assert.match(agent, /save_candidate/);
  assert.match(agent, /animations:\s*"allow"/);
  assert.match(worker, /agentRecovery/);
  assert.match(worker, /createResearchBrowserAgent/);
  assert.match(worker, /stableDetailScreenshot/);
  assert.match(worker, /summarizeCandidate/);
  assert.match(worker, /Promise\.allSettled/);
  assert.match(worker, /page\.goto\(card\.url/);
  assert.match(worker, /sourceProgress/);
  const launcher = await readFile(new URL("scripts/start-design-lab.mjs", root), "utf8");
  assert.match(launcher, /`--user-data-dir=\$\{chromeProfile\}`/);
  assert.match(launcher, /parsed\.hostname = "127\.0\.0\.1"/);
  assert.doesNotMatch(launcher, /spawn\("open", \["-a", "Google Chrome", dashboardUrl\]/);
  assert.match(agent, /report_candidate_summary/);
  assert.match(agent, /report_visual_sample/);
  assert.match(board, />用户评论</);
  assert.match(board, /check-circle-fill\.svg/);
  assert.doesNotMatch(board, />✓<\/span>/);
  assert.match(board, /media\/0/);
  assert.doesNotMatch(board, /candidate-carousel-controls/);
  assert.match(envExample, /AGENT_API_KEY=/);
  assert.doesNotMatch(envExample, /AGENT_API_KEY=.+\S/);
});

test("strategy generation uses selected evidence and persists traceable results", async () => {
  const [route, agentRuntime, strategyPage, researchPage, store, worker] = await Promise.all([
    readFile(new URL("app/api/research/tasks/[id]/strategies/route.ts", root), "utf8"),
    readFile(new URL("app/lib/agentRuntime.ts", root), "utf8"),
    readFile(new URL("app/projects/strategy/page.tsx", root), "utf8"),
    readFile(new URL("app/projects/research/page.tsx", root), "utf8"),
    readFile(new URL("app/api/research/store.ts", root), "utf8"),
    readFile(new URL("scripts/playwright-research-worker.mjs", root), "utf8"),
  ]);
  assert.match(route, /selected = 1 AND excluded = 0/);
  assert.match(route, /valuable_comments/);
  assert.match(route, /evidenceCandidateIds/);
  assert.match(route, /不得虚构用户反馈/);
  assert.match(route, /existing && !body\.force/);
  assert.match(route, /requestAgentRuntime/);
  assert.match(agentRuntime, /x-design-lab-agent-api-key/);
  assert.match(agentRuntime, /仅支持 HTTPS 公网接口/);
  assert.match(store, /research_strategies/);
  assert.match(researchPage, /正在提炼帖子与用户反馈/);
  assert.match(researchPage, /查看已生成归因/);
  assert.match(researchPage, /按当前选择重新生成/);
  assert.match(strategyPage, /VisualTrendBoard/);
  const visualTrend = await readFile(new URL("app/components/VisualTrendBoard.tsx", root), "utf8");
  assert.match(visualTrend, /visualPlatforms\.map/);
  assert.doesNotMatch(visualTrend, /\/100/);
  assert.match(visualTrend, /开始采集趋势/);
  assert.match(visualTrend, /Pinterest Predicts/);
  assert.match(visualTrend, /Canva Design Trends/);
  assert.doesNotMatch(visualTrend, /Predicts 2026/);
  assert.match(visualTrend, /每次选择 4 个方向/);
  assert.match(worker, /slice\(0, visualSamplesPerTrend\)/);
  assert.match(visualTrend, /<time>/);
  assert.doesNotMatch(visualTrend, /trend-score-parts/);
  assert.match(visualTrend, /选择原因/);
  assert.match(worker, /selectionReason: mapped\?\.rationale/);
  assert.match(worker, /visualDetailsPerTrend/);
  assert.match(worker, /visualSamplesPerTrend = 10/);
  assert.match(worker, /RESEARCH_VISUAL_DETAILS_PER_TREND \|\| 10/);
  assert.match(worker, /visualDetailsPerPlatform = 40/);
  assert.match(worker, /degradationReason/);
  assert.match(worker, /已降级完成4个视觉方向/);
  assert.doesNotMatch(worker, /throw new Error\(`\$\{incompletePlatforms\.join/);
  assert.match(worker, /https:\/\/huaban\.com\/search/);
  assert.match(worker, /selectBestVisualSamples/);
  assert.match(visualTrend, /灵感参考/);
  assert.match(visualTrend, /执行参考/);
  assert.match(strategyPage, /保存项目/);
  assert.match(strategyPage, /strategyProgress/);
  assert.match(worker, /detailPath\.includes\(visualPlatformSpecs\[platform\]\.detailPath\)/);
  assert.match(worker, /Adobe Creative Trends/);
  assert.match(worker, /readSources/);
  assert.match(worker, /selectVisualTrends/);
  assert.match(worker, /generateVisualSearchTerms/);
  assert.match(worker, /awaiting_visual_confirmation/);
  assert.match(worker, /xiaohongshu_visual/);
  assert.match(worker, /collectBrandStoreCases/);
  assert.match(worker, /apps\.apple\.com\/cn\/search/);
  assert.match(worker, /play\.google\.com\/store\/search/);
  const candidateBoard = await readFile(new URL("app/components/CandidateCaseBoard.tsx", root), "utf8");
  assert.match(candidateBoard, /京东设计反馈/);
  assert.match(candidateBoard, /App 商店竞品案例/);
  assert.doesNotMatch(worker, /query: `\$\{candidate\.query\} \$\{mechanic\}`/);
  const runner = await readFile(new URL("app/components/ResearchRunner.tsx", root), "utf8");
  assert.doesNotMatch(runner, /index \+ 1/);
  assert.doesNotMatch(runner, />✓</);
  assert.doesNotMatch(runner, /runner-keywords/);
  assert.doesNotMatch(visualTrend, /小红书 ·/);
  assert.match(strategyPage, /用户反馈：/);
  assert.doesNotMatch(strategyPage, /淘宝能量收集/);
});

test("personal AI settings remain in the current browser and use unified request headers", async () => {
  const [settings, config, sidebar] = await Promise.all([
    readFile(new URL("app/components/PersonalAISettings.tsx", root), "utf8"),
    readFile(new URL("app/lib/personalAgentConfig.ts", root), "utf8"),
    readFile(new URL("app/components/DashboardSidebar.tsx", root), "utf8"),
  ]);
  assert.match(settings, /仅保存在当前浏览器/);
  assert.match(settings, /供看板内的模型功能使用/);
  assert.match(settings, /从你购买或申请 API 的服务商文档中复制/);
  assert.match(settings, /personal-ai-close/);
  assert.match(settings, /生成本机配对信息/);
  assert.match(settings, /登录状态已失效/);
  assert.match(settings, /type="password"/);
  assert.match(config, /localStorage/);
  assert.match(config, /x-design-lab-agent-api-key/);
  assert.match(sidebar, /PersonalAISettings trigger="menu"/);
  assert.match(sidebar, /api\/account/);
});

test("personal workers are paired and claim only their owner's tasks", async () => {
  const [claim, pair, worker, taskRoute] = await Promise.all([
    readFile(new URL("app/api/research/tasks/claim/route.ts", root), "utf8"),
    readFile(new URL("app/api/workers/pair/route.ts", root), "utf8"),
    readFile(new URL("scripts/playwright-research-worker.mjs", root), "utf8"),
    readFile(new URL("app/api/research/tasks/route.ts", root), "utf8"),
  ]);
  assert.match(claim, /research_worker_pairs/);
  assert.match(claim, /AND owner_id = \?/);
  assert.match(claim, /executionRequested/);
  assert.match(pair, /research_worker_pairs/);
  assert.match(worker, /WORKER_OWNER_ID/);
  assert.match(worker, /WORKER_PAIR_TOKEN/);
  assert.match(taskRoute, /owner_id, owner_name/);
});

test("returning to requirements preserves completed research until an explicit rerun", async () => {
  const page = await readFile(new URL("app/projects/new/page.tsx", root), "utf8");
  assert.match(page, /hasExistingResearch && !forceNewResearch/);
  assert.match(page, /removeItem\("design-lab-start-research"\)/);
  assert.match(page, /查看已有研究/);
  assert.match(page, /按当前需求重新研究/);
});

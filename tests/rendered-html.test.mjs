import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("keeps product metadata and dashboard entry point", async () => {
  const [layout, page] = await Promise.all([
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
  ]);

  assert.match(layout, /Design Lab · 设计归因看板/);
  assert.match(layout, /lang="zh-CN"/);
  assert.match(page, /创建空白项目/);
  assert.match(page, /DashboardSidebar/);
  assert.doesNotMatch(page, /_sites-preview|SkeletonPreview/);
});

test("hybrid research agent remains bounded and optional", async () => {
  const [agent, worker, board, envExample] = await Promise.all([
    readFile(new URL("scripts/research-browser-agent.mjs", root), "utf8"),
    readFile(new URL("scripts/playwright-research-worker.mjs", root), "utf8"),
    readFile(new URL("app/components/CandidateCaseBoard.tsx", root), "utf8"),
    readFile(new URL(".env.example", root), "utf8"),
  ]);

  assert.match(agent, /AGENT_ENABLED/);
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
  assert.match(agent, /report_candidate_summary/);
  assert.match(board, />用户评论</);
  assert.match(board, /check-circle-fill\.svg/);
  assert.doesNotMatch(board, />✓<\/span>/);
  assert.match(board, /media\/0/);
  assert.doesNotMatch(board, /candidate-carousel-controls/);
  assert.match(envExample, /AGENT_API_KEY=/);
  assert.doesNotMatch(envExample, /AGENT_API_KEY=.+\S/);
});

test("strategy generation uses selected evidence and persists traceable results", async () => {
  const [route, strategyPage, researchPage, store] = await Promise.all([
    readFile(new URL("app/api/research/tasks/[id]/strategies/route.ts", root), "utf8"),
    readFile(new URL("app/projects/strategy/page.tsx", root), "utf8"),
    readFile(new URL("app/projects/research/page.tsx", root), "utf8"),
    readFile(new URL("app/api/research/store.ts", root), "utf8"),
  ]);
  assert.match(route, /selected = 1 AND excluded = 0/);
  assert.match(route, /valuable_comments/);
  assert.match(route, /evidenceCandidateIds/);
  assert.match(route, /不得虚构用户反馈/);
  assert.match(route, /existing && !body\.force/);
  assert.match(route, /x-design-lab-agent-api-key/);
  assert.match(route, /个人 AI 仅支持 HTTPS 公网接口/);
  assert.match(store, /research_strategies/);
  assert.match(researchPage, /正在提炼帖子与用户反馈/);
  assert.match(researchPage, /查看已生成归因/);
  assert.match(researchPage, /按当前选择重新生成/);
  assert.match(strategyPage, /用户反馈：/);
  assert.doesNotMatch(strategyPage, /淘宝能量收集/);
});

test("personal AI settings remain in the current browser and travel only with strategy requests", async () => {
  const [settings, config, sidebar] = await Promise.all([
    readFile(new URL("app/components/PersonalAISettings.tsx", root), "utf8"),
    readFile(new URL("app/lib/personalAgentConfig.ts", root), "utf8"),
    readFile(new URL("app/components/DashboardSidebar.tsx", root), "utf8"),
  ]);
  assert.match(settings, /仅保存在当前浏览器/);
  assert.match(settings, /从你购买或申请 API 的服务商文档中复制/);
  assert.match(settings, /personal-ai-close/);
  assert.match(settings, /生成本机配对信息/);
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

#!/usr/bin/env node

import { chromium } from "playwright-core";
import {
  createResearchBrowserAgent,
  executeAgentDecision,
} from "./research-browser-agent.mjs";

const dashboardUrl = process.env.DASHBOARD_URL || "http://localhost:3000";
const cdpUrl = process.env.CHROME_CDP_URL || "http://127.0.0.1:9222";
const workerId = process.env.WORKER_ID || `design-lab-playwright-${process.pid}`;
const workerOwnerId = process.env.WORKER_OWNER_ID || "";
const workerPairToken = process.env.WORKER_PAIR_TOKEN || "";
const pollMs = Number(process.env.RESEARCH_POLL_MS || 5000);
const maxQueries = Number(process.env.RESEARCH_MAX_QUERIES || 3);
const maxCandidates = Number(process.env.RESEARCH_MAX_CANDIDATES || 9);
const maxPerQuery = Number(process.env.RESEARCH_MAX_CANDIDATES_PER_QUERY || 3);
const actionDelayMs = Number(process.env.RESEARCH_ACTION_DELAY_MS || 800);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class LoginRequiredError extends Error {
  constructor(url) {
    super("小红书需要完成登录或安全验证");
    this.url = url;
  }
}

class RateLimitedError extends Error {
  constructor() {
    super("小红书提示访问频繁，任务已暂停，请稍后再试");
  }
}

async function agentRecovery(agent, page, options, { execute = true } = {}) {
  if (!agent?.enabled || !agent.remainingCalls) return null;
  try {
    const decision = await agent.decide(page, options);
    if (!decision) return null;
    console.log(
      `[Agent ${agent.calls}] ${decision.state} ${(decision.confidence * 100).toFixed(0)}%`
      + ` → ${decision.action}: ${decision.reason}`
    );
    const result = execute
      ? await executeAgentDecision(page, decision)
      : { executed: false, needsHuman: decision.action === "request_human" };
    if (result.needsHuman || decision.state === "login_required") {
      throw new LoginRequiredError(page.url());
    }
    if (decision.state === "rate_limited") throw new RateLimitedError();
    return { decision, ...result };
  } catch (error) {
    if (error instanceof LoginRequiredError || error instanceof RateLimitedError) throw error;
    console.warn(`Agent恢复失败，继续使用Playwright规则：${error.message}`);
    return null;
  }
}

async function api(path, init = {}) {
  const response = await fetch(`${dashboardUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers || {}) },
  });
  if (!response.ok && response.status !== 204) {
    throw new Error(`看板接口 ${path} 返回 ${response.status}`);
  }
  return response;
}

async function updateTask(taskId, status, activity, extra = {}) {
  await api(`/api/research/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify({ status, activity: { ...activity, updatedAt: new Date().toISOString() }, ...extra }),
  });
}

function projectWords(project) {
  const answers = Object.values(project?.answers || {}).flat();
  const customs = Object.values(project?.customValues || {});
  return [...new Set([
    project?.projectName,
    ...answers,
    ...customs,
  ].filter(Boolean).map((value) => String(value).replace(/（.*?）/g, "").trim()))];
}

function buildQueries(project) {
  const words = projectWords(project);
  const brand = project?.projectName || words[0] || "品牌";
  const mechanics = words.filter((word) => /养成|收集|集卡|抽奖|答题|任务|互动|游戏/.test(word));
  const goals = words.filter((word) => /促活|传播|转化|留存|分享|完成/.test(word));
  return [...new Set([
    `${brand} 互动活动`,
    `${brand} 营销游戏`,
    mechanics[0] ? `${brand} ${mechanics[0]} 玩法` : "",
    goals[0] ? `${brand} ${goals[0]} 活动` : "",
    mechanics[0] ? `${mechanics[0]} 品牌活动` : "",
  ].filter(Boolean))].slice(0, maxQueries);
}

function normalizePostUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

function identity(value) {
  return String(value || "").match(/\/(?:explore|discovery\/item|search_result)\/([0-9a-z]+)/i)?.[1] || value;
}

function metric(value) {
  const text = String(value || "").replace(/,/g, "");
  const number = Number.parseFloat(text.match(/[\d.]+/)?.[0] || "0");
  return /万/.test(text) ? Math.round(number * 10000) : Math.round(number);
}

function relevance(text, project, query) {
  const content = String(text || "").toLowerCase();
  const words = [...projectWords(project), ...query.split(/\s+/)].filter((word) => word.length > 1);
  const hits = words.filter((word) => content.includes(word.toLowerCase())).length;
  return Math.min(99, 45 + hits * 9);
}

async function pageGuard(page) {
  const text = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
  if (/登录后推荐更懂你的笔记|手机号登录|验证码登录|扫码登录/.test(text)) {
    throw new LoginRequiredError(page.url());
  }
  if (/访问频繁|请求频繁|安全验证|网络环境存在风险/.test(text)) {
    throw new RateLimitedError();
  }
}

async function collectVisibleCards(page) {
  return page.locator("a[href]").evaluateAll((anchors) => {
    const pattern = /xiaohongshu\.com\/(?:explore|discovery\/item|search_result)\/[0-9a-z]+/i;
    const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const found = new Map();
    for (const anchor of anchors) {
      if (!pattern.test(anchor.href)) continue;
      const card = anchor.closest("[class*='note-item'], [class*='feed-card'], section, article") || anchor;
      const rect = card.getBoundingClientRect();
      if (rect.width < 120 || rect.height < 100) continue;
      if (rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) continue;
      const text = clean(card.innerText || anchor.innerText || card.querySelector("img")?.alt);
      if (!text) continue;
      const id = anchor.href.match(/\/(?:explore|discovery\/item|search_result)\/([0-9a-z]+)/i)?.[1];
      if (!id || found.has(id)) continue;
      found.set(id, {
        id,
        url: anchor.href,
        title: clean(anchor.querySelector("img")?.alt || text.split("\n")[0] || text).slice(0, 160),
        cardText: text.slice(0, 1000),
      });
    }
    return [...found.values()];
  });
}

async function searchCandidates(page, query, agent) {
  await page.goto("https://www.xiaohongshu.com/explore", { waitUntil: "commit", timeout: 15000 });
  await page.locator("body").waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(1200);
  await pageGuard(page);

  const searchSelectors = [
    "#search-input-in-feeds",
    "#search-input",
    "input[placeholder*='搜索小红书']",
    "input[placeholder*='搜索']",
    "textarea[placeholder*='搜索小红书']",
    "textarea[placeholder*='搜索']",
    "input[type='search']",
  ];
  let searchInput = null;
  for (const selector of searchSelectors) {
    const candidate = page.locator(selector).first();
    if (await candidate.isVisible().catch(() => false)) {
      searchInput = candidate;
      break;
    }
  }
  if (!searchInput) {
    await agentRecovery(agent, page, {
      goal: "找到小红书首页的搜索输入框并使其可操作",
      failure: "Playwright没有找到搜索框",
      expectedStates: ["home", "login_required", "rate_limited"],
    });
    for (const selector of searchSelectors) {
      const candidate = page.locator(selector).first();
      if (await candidate.isVisible().catch(() => false)) {
        searchInput = candidate;
        break;
      }
    }
  }
  if (!searchInput) throw new Error("小红书首页已打开，但没有找到可用的搜索框");

  const placeholder = await searchInput.getAttribute("placeholder").catch(() => "");
  if (/登录/.test(placeholder || "")) throw new LoginRequiredError(page.url());

  await searchInput.click();
  await searchInput.fill(query);
  await page.waitForTimeout(350);
  const searchButton = page.locator(
    ".input-box .input-button, .input-box .search-icon, button:has-text('搜索'), [class*='search-button']"
  ).filter({ visible: true }).first();
  if (await searchButton.isVisible().catch(() => false)) {
    await searchButton.click({ timeout: 8000 });
  } else {
    await searchInput.press("Enter");
  }

  let enteredResults = await page.waitForFunction(
    () => location.pathname.includes("/search_result"),
    null,
    { timeout: 5000 }
  ).then(() => true).catch(() => false);
  if (!enteredResults) {
    await pageGuard(page);
    await searchInput.press("Enter");
    enteredResults = await page.waitForFunction(
      () => location.pathname.includes("/search_result"),
      null,
      { timeout: 10000 }
    ).then(() => true).catch(() => false);
  }
  if (!enteredResults) {
    await pageGuard(page);
    await agentRecovery(agent, page, {
      goal: `完成关键词「${query}」的搜索并进入搜索结果页`,
      failure: "点击搜索按钮和按Enter都没有进入结果页",
      expectedStates: ["search_results", "home", "login_required", "rate_limited"],
    });
    enteredResults = page.url().includes("/search_result");
  }
  if (!enteredResults) {
    await pageGuard(page);
    throw new Error("搜索按钮和 Enter 都没有进入搜索结果页");
  }
  await page.waitForTimeout(1800);
  await pageGuard(page);
  const url = page.url();

  const collected = new Map();
  for (const card of await collectVisibleCards(page)) collected.set(card.id, card);
  return { url, cards: [...collected.values()] };
}

async function detailRoot(page) {
  const selectors = [
    ".note-detail-mask .note-container",
    "[class*='note-detail'] [class*='note-container']",
    "[role='dialog']",
    "#noteContainer",
    ".note-container",
    "main [class*='note-content']",
  ];
  for (const selector of selectors) {
    const matches = page.locator(selector);
    const count = await matches.count();
    for (let index = 0; index < count; index += 1) {
      const locator = matches.nth(index);
      if (await locator.isVisible().catch(() => false)) return locator;
    }
  }
  return null;
}

async function stableDetailScreenshot(page, root) {
  await page.mouse.move(8, 8);
  let previous = null;
  let latest = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.waitForTimeout(attempt ? 220 : 350);
    latest = await root.screenshot({ type: "png", animations: "allow" });
    if (previous?.equals(latest)) return latest;
    previous = latest;
  }
  return latest;
}

async function collectDetailMedia(page, root) {
  return [await stableDetailScreenshot(page, root)];
}

async function collectValuableComments(page, agent) {
  const step = await agentRecovery(agent, page, {
    goal: [
      "定位帖子详情中的评论滚动区域。",
      "找到时选择 scroll_element；不存在评论区域时选择 finish。",
      "不要点击评论、头像、点赞、关注或回复。",
    ].join(" "),
    expectedStates: ["post_detail"],
  });
  if (step?.executed && step.decision.action === "scroll_element" && step.decision.element?.box) {
    const { x, y, width, height } = step.decision.element.box;
    for (let index = 0; index < 3; index += 1) {
      await page.mouse.move(x + width / 2, y + height / 2);
      await page.mouse.wheel(0, Math.max(420, Math.round(height * 0.78)));
      await page.waitForTimeout(450);
    }
  }
  const values = await page.locator(
    ".note-detail-mask [class*='comment-item'], [role='dialog'] [class*='comment-item']"
  ).allTextContents().catch(() => []);
  return [...new Set(values
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter((value) => value.length >= 12 && value.length <= 320))]
    .slice(0, 8);
}

async function openCandidate(page, card, searchUrl, project, query, agent) {
  if (!page.url().includes("/search_result")) {
    throw new Error("当前页面已经离开搜索结果页");
  }
  const target = page.locator(`a[href*="${card.id}"]`).filter({ visible: true }).first();
  if (!await target.isVisible().catch(() => false)) {
    throw new Error("候选卡片已离开当前可视区域");
  }
  await target.scrollIntoViewIfNeeded({ timeout: 5000 });
  const agentSelection = await agentRecovery(agent, page, {
    goal: [
      `在搜索结果中选择并打开候选帖子「${card.title}」。`,
      `目标帖子ID为 ${card.id}，优先选择href中包含该ID的可见元素。`,
      "只能点击该候选帖子，不要点击筛选、用户头像、关注或其他功能。",
    ].join(" "),
    expectedStates: ["search_results"],
  });
  if (
    !agentSelection?.executed
    || agentSelection.decision.action !== "click_element"
  ) {
    throw new Error("Agent没有选择可点击的候选帖子");
  }
  let detailOpened = await page.waitForFunction(() => {
    const roots = [
      document.querySelector(".note-detail-mask .note-container"),
      document.querySelector("[class*='note-detail'] [class*='note-container']"),
      document.querySelector("[role='dialog']"),
    ].filter(Boolean);
    return roots.some((root) => {
      const rect = root.getBoundingClientRect();
      return rect.width > 320 && rect.height > 240 && (root.innerText || "").trim().length > 40;
    });
  }, null, { timeout: 15000 }).then(() => true).catch(() => false);
  if (!detailOpened) {
    await agentRecovery(agent, page, {
      goal: `打开候选帖子「${card.title}」的真实详情弹层`,
      failure: "点击候选卡片后没有检测到详情弹层",
      expectedStates: ["post_detail", "search_results", "login_required", "rate_limited"],
    });
    detailOpened = Boolean(await detailRoot(page));
  }
  if (!detailOpened) throw new Error("点击后没有出现帖子详情弹层");
  await pageGuard(page);

  const detectedRoot = await detailRoot(page);
  if (!detectedRoot) throw new Error("点击后没有出现帖子详情弹层");
  const detailAssessment = await agentRecovery(agent, page, {
    goal: [
      `确认当前打开的是候选帖子「${card.title}」的真实帖子详情。`,
      "不要执行任何点击；只报告页面状态。",
      "真实详情应包含帖子媒体、正文或作者信息，而不是登录层、AI搜索面板或错误页。",
    ].join(" "),
    expectedStates: ["post_detail", "login_required", "rate_limited", "unknown"],
  }, { execute: false });
  if (
    detailAssessment
    && detailAssessment.decision.confidence >= 0.72
    && detailAssessment.decision.state !== "post_detail"
  ) {
    throw new Error(`Agent判断当前不是帖子详情：${detailAssessment.decision.reason}`);
  }
  const root = detectedRoot;
  const detailUrl = page.url();
  await root.scrollIntoViewIfNeeded();
  const text = (await root.innerText()).replace(/\s+/g, " ").trim();
  if (/当前笔记暂时无法浏览|你访问的页面不见了|页面不存在/.test(text)) {
    throw new Error("当前候选帖子不可访问");
  }
  const title = await root.locator("h1, h2, [id='detail-title'], [class*='title']").first()
    .innerText().catch(() => card.title);
  const author = await root.locator("[class*='author'] [class*='name'], [class*='user'] [class*='name'], a[href*='/user/profile']")
    .first().innerText().catch(() => "");
  const mediaType = await root.locator("video").count() ? "video"
    : await root.locator("[class*='swiper'] img, [class*='carousel'] img").count() > 1 ? "carousel" : "post";
  const mediaShots = await collectDetailMedia(page, detectedRoot);
  const rawComments = await collectValuableComments(page, agent);
  const distilled = await agent.summarizeCandidate({
    title: title.trim() || card.title,
    text,
    comments: rawComments,
    query,
  }).catch((error) => {
    console.warn(`案例信息提炼失败：${error.message}`);
    return null;
  });
  const valuableComments = Array.isArray(distilled?.comments)
    ? distilled.comments.map((value) => String(value).trim()).filter(Boolean).slice(0, 8)
    : rawComments;
  const screenshot = mediaShots[0];
  const likes = metric((text.match(/([\d.万]+)\s*赞/) || [])[1]);
  const comments = metric((text.match(/([\d.万]+)\s*(?:评论|评)/) || [])[1]);
  const collects = metric((text.match(/([\d.万]+)\s*收藏/) || [])[1]);
  const date = text.match(/20\d{2}[-./年]\d{1,2}(?:[-./月]\d{1,2})?/)?.[0] || "";

  await page.keyboard.press("Escape");
  await page.waitForTimeout(450);
  if (await detectedRoot.isVisible().catch(() => false)) {
    const closeButton = page.locator(
      ".note-detail-mask [class*='close'], [role='dialog'] button[aria-label*='关闭']"
    ).filter({ visible: true }).first();
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click({ timeout: 3000 }).catch(() => {});
    }
  }
  await page.waitForFunction(() => location.pathname.includes("/search_result"), null, { timeout: 8000 })
    .catch(() => {});

  return {
    id: `candidate-${card.id}`,
    source: "xiaohongshu",
    title: String(distilled?.insightTitle || title.trim() || card.title).slice(0, 120),
    url: normalizePostUrl(detailUrl.includes(card.id) ? detailUrl : card.url),
    author: author.trim() || null,
    publishedAt: date || null,
    capturedAt: new Date().toISOString(),
    excerpt: String(distilled?.summary || text.slice(0, 500)),
    screenshotBase64: screenshot.toString("base64"),
    mediaBase64s: mediaShots.map((shot) => shot.toString("base64")),
    valuableComments,
    mediaType,
    keywords: [query],
    likes,
    comments,
    collects,
    relevance: relevance(`${title} ${text}`, project, query),
  };
}

async function processTask(context, task) {
  const pages = context.pages();
  const page = pages.find((item) => item.url().includes("xiaohongshu.com")) || await context.newPage();
  const queries = buildQueries(task.project);
  const agent = createResearchBrowserAgent();
  const seen = new Set();
  let saved = 0;
  const activity = {
    phase: "starting", queryIndex: 0, queryTotal: queries.length,
    browsedCount: 0, matchedCount: 0, detailCount: 0, message: "正在准备 Playwright 浏览器",
  };

  try {
    for (let index = 0; index < queries.length && saved < maxCandidates; index += 1) {
      const query = queries[index];
      Object.assign(activity, {
        phase: "searching", queryIndex: index + 1, currentQuery: query,
        message: `正在搜索「${query}」`,
      });
      await updateTask(task.id, "running", activity);
      const result = await searchCandidates(page, query, agent);
      activity.browsedCount += result.cards.length;

      for (const card of result.cards.slice(0, maxPerQuery)) {
        if (saved >= maxCandidates || seen.has(identity(card.url))) continue;
        seen.add(identity(card.url));
        Object.assign(activity, {
          phase: "reading",
          matchedCount: seen.size,
          message: `正在打开候选帖子 ${saved + 1}/${maxCandidates}`,
        });
        await updateTask(task.id, "running", activity);
        try {
          const candidate = await openCandidate(page, card, result.url, task.project, query, agent);
          await api(`/api/research/tasks/${task.id}/candidates`, {
            method: "POST",
            body: JSON.stringify({ candidates: [candidate] }),
          });
          saved += 1;
          activity.detailCount = saved;
          activity.agentCalls = agent.calls;
          activity.message = `已加入案例候选 ${saved} 条`;
          await updateTask(task.id, "running", activity);
        } catch (error) {
          if (error instanceof LoginRequiredError || error instanceof RateLimitedError) throw error;
          console.warn(`[${task.id}] 跳过候选 ${card.title}: ${error.message}`);
          activity.message = `候选打开失败：${error.message}`;
          activity.lastError = error.message;
          activity.agentCalls = agent.calls;
          await updateTask(task.id, "running", activity);
          await page.keyboard.press("Escape").catch(() => {});
          await page.waitForTimeout(600);
          if (!page.url().includes("/search_result")) {
            await page.goBack({ waitUntil: "commit", timeout: 10000 }).catch(() => {});
          }
        }
        await sleep(actionDelayMs);
      }
    }
    if (!saved) throw new Error("没有成功打开并保存候选帖子");
    Object.assign(activity, {
      phase: "completed",
      agentCalls: agent.calls,
      message: `已找到 ${saved} 个候选案例，请在案例页勾选采用`,
    });
    await updateTask(task.id, "completed", activity);
  } catch (error) {
    activity.agentCalls = agent.calls;
    if (error instanceof LoginRequiredError) {
      await updateTask(task.id, "needs_login", { ...activity, phase: "needs_login", message: error.message }, {
        error: error.message, blockedSource: "xiaohongshu", actionUrl: error.url,
      });
      return;
    }
    if (error instanceof RateLimitedError) {
      await updateTask(task.id, "needs_login", {
        ...activity,
        phase: "cooldown",
        message: error.message,
      }, {
        error: error.message,
        blockedSource: "xiaohongshu",
        actionUrl: page.url(),
      });
      return;
    }
    await updateTask(task.id, "failed", { ...activity, phase: "failed", message: error.message }, {
      error: error.message,
    });
  }
}

const agentConfigured = Boolean(
  process.env.AGENT_API_BASE && process.env.AGENT_API_KEY && process.env.AGENT_MODEL
  && process.env.AGENT_ENABLED !== "false"
);
console.log(
  `Playwright 研究服务已启动；看板：${dashboardUrl}；Chrome：${cdpUrl}；`
  + `恢复Agent：${agentConfigured ? "已启用" : "未配置"}`
);
if (!workerOwnerId || !workerPairToken) {
  throw new Error("缺少 WORKER_OWNER_ID 或 WORKER_PAIR_TOKEN；请在看板左下角三个点中生成个人 Worker 配对信息");
}
const browser = await chromium.connectOverCDP(cdpUrl);
const context = browser.contexts()[0] || await browser.newContext();

while (true) {
  try {
    const response = await api("/api/research/tasks/claim", {
      method: "POST",
      body: JSON.stringify({ workerId, ownerId: workerOwnerId, pairToken: workerPairToken }),
    });
    if (response.status === 204) {
      await sleep(pollMs);
      continue;
    }
    const { task } = await response.json();
    await processTask(context, task);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    await sleep(pollMs);
  }
}

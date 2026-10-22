#!/usr/bin/env node

import { chromium } from "playwright-core";
import { createHash } from "node:crypto";
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
const visualDetailsPerTrend = Number(process.env.RESEARCH_VISUAL_DETAILS_PER_TREND || 10);
const visualDetailsPerPlatform = 40;
const visualSamplesPerTrend = 10;

const visualPlatformSpecs = {
  behance: { selector: "a[href*='/gallery/']", detailPath: "/gallery/", search: (query) => `https://www.behance.net/search/projects?search=${encodeURIComponent(query)}` },
  pinterest: { selector: "a[href*='/pin/']", detailPath: "/pin/", search: (query) => `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}` },
  huaban: { selector: "a[href*='/pins/']", detailPath: "/pins/", search: (query) => `https://huaban.com/search?q=${encodeURIComponent(query)}` },
  dribbble: { selector: "a[href*='/shots/']", detailPath: "/shots/", search: (query) => `https://dribbble.com/search/${encodeURIComponent(query)}` },
  zcool: { selector: "a[href*='/work/']", detailPath: "/work/", search: (query) => `https://www.zcool.com.cn/search/content?word=${encodeURIComponent(query)}` },
};

function visualPlatformsFor(project) {
  return project?.designType === "interaction"
    ? ["behance", "pinterest", "zcool"]
    : ["pinterest", "behance", "zcool"];
}

const officialTrendSources = [
  { name: "Pinterest Predicts", url: "https://business.pinterest.com/pinterest-predicts/" },
  { name: "Canva Design Trends", url: "https://www.canva.com/design-trends/" },
  { name: "Adobe Creative Trends", url: "https://business.adobe.com/resources/creative-trends-report.html" },
];

function researchSourcesFor(project) {
  if (project?.designType === "brand") return [
    { name: "Apple Human Interface Guidelines", url: "https://developer.apple.com/design/human-interface-guidelines/" },
    { name: "Material Design", url: "https://m3.material.io/" },
    { name: "Apple App Store", url: "https://www.apple.com/app-store/" },
    { name: "Google Play", url: "https://play.google.com/store/apps" },
    { name: "Mobbin", url: "https://mobbin.com/discover/apps/ios/latest" },
    { name: "微博", url: "https://weibo.com/" },
    { name: "Voice of User", url: "https://new-ux.jd.com/feedback?channel_id=1" },
  ];
  if (project?.designType === "marketing") return [
    { name: "大促会场与开屏广告设计规范", url: "https://relay.jd.com/file/design?id=2057763035308625921" },
    { name: "微博", url: "https://weibo.com/" },
    { name: "Voice of User", url: "https://new-ux.jd.com/feedback?channel_id=1" },
  ];
  return [];
}

const visualTrendCandidates = [
  { key: "tactile_dimension", label: "触感材质与半透明立体", queries: ["tactile translucent 3D", "glossy rounded forms"], reports: ["Pinterest Predicts", "Canva Design Trends", "Adobe Creative Trends"] },
  { key: "imperfect_analog", label: "非完美手作与颗粒拼贴", queries: ["analog grain collage", "handmade editorial texture"], reports: ["Canva Design Trends", "Adobe Creative Trends"] },
  { key: "retro_tech", label: "复古科技与故障界面", queries: ["retro tech interface", "pixel glitch graphics"], reports: ["Pinterest Predicts", "Canva Design Trends"] },
  { key: "surreal_reality", label: "超现实错位与梦境合成", queries: ["surreal dream composite", "reality scale distortion"], reports: ["Pinterest Predicts", "Canva Design Trends", "Adobe Creative Trends"] },
];

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
  const meetingTerms = Array.isArray(project?.meetingContext?.keyPoints) && project.meetingContext.keyPoints.length
    ? project.meetingContext.keyPoints
    : String(project?.meetingContext?.extractedText || "")
      .split(/[。！？；\n]/).map((value) => value.trim()).filter((value) => value.length >= 2 && value.length <= 28).slice(0, 4);
  return [...new Set([
    project?.projectName,
    ...answers,
    ...customs,
    ...meetingTerms,
  ].filter(Boolean).map((value) => String(value).replace(/（.*?）/g, "").trim()))];
}

function buildQueries(project) {
  const words = projectWords(project);
  const brand = project?.projectName || words[0] || "品牌";
  if (project?.designType === "brand") {
    const boundary = (project?.answers?.boundary || ["启动图标", "启动屏", "App内界面"]).slice(0, 3);
    return [...new Set(boundary.map((carrier) => `京东 ${carrier} 用户反馈`))].slice(0, maxQueries);
  }
  if (project?.designType === "marketing") {
    const boundary = (project?.answers?.boundary || ["大促会场"]).slice(0, 2);
    const campaign = project?.answers?.campaign?.[0] || "大促";
    return [...new Set(boundary.flatMap((carrier) => [`${campaign} ${carrier}`, `${carrier} 视觉设计`, `${carrier} 用户体验`]))].slice(0, maxQueries);
  }
  const mechanics = words.filter((word) => /养成|收集|集卡|抽奖|答题|任务|互动|游戏/.test(word));
  const goals = words.filter((word) => /促活|传播|转化|留存|分享|完成/.test(word));
  const meetingHint = Array.isArray(project?.meetingContext?.keyPoints) && project.meetingContext.keyPoints.length
    ? project.meetingContext.keyPoints[0]
    : String(project?.meetingContext?.extractedText || "")
      .split(/[。！？；\n]/).map((value) => value.trim()).find((value) => value.length >= 2 && value.length <= 28);
  const posture = Number(project?.decisionPosture ?? 50);
  const focused = [
    meetingHint ? `${brand} ${meetingHint}` : "",
    mechanics[0] ? `${brand} ${mechanics[0]} 玩法` : "",
    goals[0] ? `${brand} ${goals[0]} 活动` : "",
    `${brand} 互动活动`,
  ];
  const exploratory = [
    mechanics[0] ? `${mechanics[0]} 品牌活动` : "",
    goals[0] ? `${goals[0]} 互动玩法` : "",
    `${brand} 营销游戏`,
    `${brand} 互动活动`,
  ];
  const balanced = [
    meetingHint ? `${brand} ${meetingHint}` : "",
    `${brand} 互动活动`,
    mechanics[0] ? `${brand} ${mechanics[0]} 玩法` : "",
    goals[0] ? `${brand} ${goals[0]} 活动` : "",
    `${brand} 营销游戏`,
  ];
  const ordered = posture < 40 ? focused : posture > 60 ? exploratory : balanced;
  return [...new Set(ordered.filter(Boolean))].slice(0, maxQueries);
}

function buildCompetitorDiscoveryQueries(project) {
  const words = projectWords(project);
  if (project?.designType === "brand") {
    const boundary = project?.answers?.boundary?.[0] || "数字品牌";
    return [`${boundary} 竞品`, `${boundary} 同类App`, `${boundary} 品牌案例`].slice(0, maxQueries);
  }
  if (project?.designType === "marketing") {
    const boundary = project?.answers?.boundary?.[0] || "大促会场";
    return [`${boundary} 竞品`, `${boundary} 同类活动`, `${boundary} 营销案例`].slice(0, maxQueries);
  }
  const mechanics = words.filter((word) => /养成|收集|集卡|抽奖|答题|任务|闯关|合成|互动|游戏/.test(word));
  const primary = mechanics[0] || "互动游戏";
  return [...new Set([
    `${primary} 竞品`,
    `${primary} 同类产品`,
    `${primary} 品牌互动案例`,
  ])].slice(0, maxQueries);
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
  let values = await page.locator(
    ".note-detail-mask [class*='comment-item'], [role='dialog'] [class*='comment-item']"
  ).allTextContents().catch(() => []);
  if (!values.length) {
    const step = await agentRecovery(agent, page, {
      goal: "定位帖子详情中的评论滚动区域；找不到则结束。不要点击评论、头像、点赞、关注或回复。",
      expectedStates: ["post_detail"],
    });
    if (step?.executed && step.decision.action === "scroll_element" && step.decision.element?.box) {
      const { x, y, width, height } = step.decision.element.box;
      await page.mouse.move(x + width / 2, y + height / 2);
      await page.mouse.wheel(0, Math.max(420, Math.round(height * 0.78)));
      await page.waitForTimeout(450);
      values = await page.locator(
        ".note-detail-mask [class*='comment-item'], [role='dialog'] [class*='comment-item']"
      ).allTextContents().catch(() => []);
    }
  }
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
  await target.click({ timeout: 8000 });
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
    projectContext: `会议要点：${(project?.meetingContext?.keyPoints || []).join("；") || "无"}；开放度：${Number(project?.decisionPosture ?? 50)}（低值优先聚焦，高值优先探索）`,
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

function buildVisualQueries(selection, directions) {
  const forbidden = /\b(?:game|gaming|gamified|campaign|interactive|engagement|retention)\b|游戏|养成|收集|抽奖|答题|任务|闯关|合成|互动/gi;
  const selected = Array.isArray(selection?.trends) ? selection.trends : [];
  const normalized = selected.map((trend, index) => ({
    key: `official-${index + 1}`,
    label: String(trend.label || "").trim(),
    queries: (Array.isArray(trend.searchTerms) ? trend.searchTerms : [])
      .map((term) => String(term).replace(forbidden, " ").replace(/[^a-z0-9\s-]/gi, " ").replace(/\s+/g, " ").trim())
      .filter((term) => term.split(/\s+/).length >= 2 && term.split(/\s+/).length <= 4)
      .slice(0, 3),
    reports: Array.isArray(directions?.[index]?.sourceNames) ? directions[index].sourceNames.filter(Boolean) : [],
    rationale: String(directions?.[index]?.rationale || "").trim().slice(0, 160),
  })).filter((trend) => trend.label && trend.queries.length >= 2);
  return normalized.length === directions?.length ? normalized : visualTrendCandidates.slice(0, directions?.length || 4).map((trend, index) => ({
    ...trend,
    label: directions?.[index]?.label || trend.label,
    reports: directions?.[index]?.sourceNames || trend.reports,
    rationale: directions?.[index]?.rationale || "该方向由竞品视觉特征与官方趋势交叉确认。",
  }));
}

async function readSources(context, sources) {
  const results = await Promise.all(sources.map(async (source) => {
    const page = await context.newPage();
    try {
      await page.goto(source.url, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForTimeout(1200);
      const text = await page.locator("body").innerText({ timeout: 6000 });
      return { ...source, text: text.replace(/\s+/g, " ").slice(0, 18000) };
    } catch (error) {
      console.warn(`官方趋势来源读取失败 ${source.name}: ${error.message}`);
      return null;
    } finally {
      await page.close().catch(() => {});
    }
  }));
  return results.filter(Boolean);
}

async function collectVisualCards(page, platform) {
  const selector = visualPlatformSpecs[platform].selector;
  const found = new Map();
  const scrollLimit = platform === "pinterest" ? 14 : 8;
  for (let step = 0; step < scrollLimit; step += 1) {
    const visible = await page.locator(selector).evaluateAll((anchors) => {
      const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
      return anchors.map((anchor, domIndex) => {
        const container = anchor.closest("article, [class*='ProjectCover'], [data-grid-item], [data-test-id*='pin']") || anchor;
        const image = anchor.querySelector("img") || container.querySelector("img");
        const rect = (image || container).getBoundingClientRect();
        if (!anchor.href || rect.width < 120 || rect.height < 80 || rect.bottom <= 0 || rect.top >= innerHeight) return null;
        const text = clean(container.innerText || image?.alt || "");
        return {
          domIndex,
          url: anchor.href,
          title: clean(image?.alt || text.split("\n")[0] || "视觉作品").slice(0, 160),
          text: text.slice(0, 1000),
          imageUrl: image?.currentSrc || image?.src || "",
        };
      }).filter(Boolean);
    }).catch(() => []);
    for (const card of visible) if (!found.has(card.url)) found.set(card.url, card);
    if (found.size >= visualDetailsPerTrend + 20) break;
    await page.keyboard.press("Escape").catch(() => {});
    await page.mouse.wheel(0, platform === "pinterest" ? 1150 : 850);
    await page.waitForTimeout(platform === "pinterest" ? 900 : 650);
  }
  return [...found.values()].slice(0, 60);
}

async function collectVisualPlatform(context, task, platform, queries, agent, activity) {
  const page = await context.newPage();
  const seen = new Set();
  const evaluated = [];
  let browsed = 0;
  let reviewed = 0;
  const maxReviewsPerTrend = Math.max(visualDetailsPerTrend, Math.ceil(visualDetailsPerPlatform / Math.max(1, queries.length)));
  const detailTarget = visualDetailsPerPlatform;
  try {
    for (let queryIndex = 0; queryIndex < queries.length && reviewed < visualDetailsPerPlatform; queryIndex += 1) {
      const candidateTrend = queries[queryIndex];
      const baseTerms = candidateTrend.queries || [candidateTrend.query];
      const searchTerms = platform === "pinterest"
        ? [...new Set([...baseTerms, candidateTrend.label, `${candidateTrend.label} design`].filter(Boolean))]
        : baseTerms;
      let trendReviewed = 0;
      for (const query of searchTerms) {
      const eligibleForTrend = () => evaluated.filter((item) => item.trendKey === candidateTrend.key).length;
      if (trendReviewed >= maxReviewsPerTrend || reviewed >= visualDetailsPerPlatform) break;
      const url = visualPlatformSpecs[platform].search(query);
      activity.sourceProgress[platform] = {
        phase: "searching", progress: Math.round((queryIndex / queries.length) * 100),
        queryIndex: queryIndex + 1, queryTotal: queries.length, browsed, reviewed, saved: 0, eligible: evaluated.length,
      };
      Object.assign(activity, {
        phase: "visual_searching",
        currentQuery: query,
        message: "Behance、Pinterest 与花瓣正在同步研究",
      });
      await updateTask(task.id, "running", activity);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForTimeout(1800);
      const cards = await collectVisualCards(page, platform);
      browsed += cards.length;
      activity.sourceProgress[platform].browsed = browsed;
      for (let cardIndex = 0; cardIndex < cards.length; cardIndex += 1) {
        const card = cards[cardIndex];
        if (trendReviewed >= maxReviewsPerTrend || reviewed >= visualDetailsPerPlatform || seen.has(card.url)) continue;
        seen.add(card.url);
        activity.sourceProgress[platform] = {
          ...activity.sourceProgress[platform],
          phase: "reading",
          progress: Math.min(94, Math.round((reviewed / detailTarget) * 94)),
          currentTitle: card.title,
        };
        await updateTask(task.id, "running", activity);
        await page.goto(card.url, { waitUntil: "domcontentloaded", timeout: 20000 });
        await page.waitForTimeout(1600);
        const detailPath = new URL(page.url()).pathname;
        const validDetail = detailPath.includes(visualPlatformSpecs[platform].detailPath);
        if (!validDetail) {
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
          continue;
        }
        if (platform === "behance") {
          await page.mouse.wheel(0, 620);
          await page.waitForTimeout(850);
        }
        reviewed += 1;
        trendReviewed += 1;
        activity.sourceProgress[platform].reviewed = reviewed;
        const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => card.text);
        const detailTitle = await page.locator("h1").first().innerText().catch(() => card.title);
        const imageCandidate = await page.locator("img").evaluateAll((images) => {
          let best = null;
          for (let index = 0; index < images.length; index += 1) {
            const image = images[index];
            const rect = image.getBoundingClientRect();
            if (rect.width < 240 || rect.height < 180) continue;
            const area = rect.width * rect.height;
            if (!best || area > best.area) best = { area, index, url: image.currentSrc || image.src || "" };
          }
          return best;
        }).catch(() => null);
        const imageUrl = imageCandidate?.url || card.imageUrl;
        const screenshot = imageCandidate
          ? await page.locator("img").nth(imageCandidate.index).screenshot({ type: "jpeg", quality: 76, animations: "disabled" }).catch(() => null)
          : await page.screenshot({ type: "jpeg", quality: 68, fullPage: false, animations: "disabled" }).catch(() => null);
        if (!screenshot) continue;
        const analysis = await agent.analyzeVisualSample({
          screenshot, platform, title: detailTitle || card.title, query,
          directionLabel: candidateTrend.label,
          directionDescription: candidateTrend.rationale,
        })
          .catch((error) => {
            console.warn(`${platform}视觉样本分析失败：${error.message}`);
            return null;
          });
        if (analysis?.useful && analysis.trendLabel && Array.isArray(analysis.visualFeatures)) {
          const date = bodyText.match(/20\d{2}[-./年]\d{1,2}(?:[-./月]\d{1,2})?/)?.[0] || null;
          const engagement = metric(bodyText.match(/([\d.万]+)\s*(?:赞|likes?|appreciations?|saves?)/i)?.[1]);
          const mapped = candidateTrend;
          evaluated.push({
            platform,
            trendKey: candidateTrend.key,
            projectTitle: String(detailTitle || card.title).trim().slice(0, 160),
            projectUrl: card.url,
            imageUrl,
            author: null,
            publishedAt: date,
            trendLabel: mapped?.label || analysis.trendLabel,
            visualFeatures: analysis.visualFeatures,
            engagement,
            authorityTags: mapped?.reports || [],
            gameFit: 0,
            visualQuality: 0,
            analysisReason: analysis.reason,
            selectionReason: mapped?.rationale || "该方向来自本次官方视觉趋势候选，需结合项目目标继续验证。",
            referenceType: analysis.referenceType === "execution" ? "execution" : "inspiration",
            relevanceScore: Math.max(0, Math.min(100, Number(analysis.relevanceScore || 0))),
            screenshotBase64: screenshot.toString("base64"),
          });
          activity.agentSummaryCalls = agent.summaryCalls;
          activity.sourceProgress[platform].eligible = evaluated.length;
        }
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(700);
        await updateTask(task.id, "running", activity);
      }
      }
    }
    activity.sourceProgress[platform] = {
      ...activity.sourceProgress[platform], phase: "completed", progress: 100,
      browsed, reviewed, eligible: evaluated.length, saved: 0,
    };
    await updateTask(task.id, "running", activity);
    return evaluated;
  } finally {
    await page.close().catch(() => {});
  }
}

function visualTokenSet(sample) {
  return new Set(`${sample.projectTitle} ${(sample.visualFeatures || []).join(" ")}`.toLowerCase().match(/[a-z0-9\u4e00-\u9fff]+/g) || []);
}

function visuallySimilar(left, right) {
  if (left.imageUrl && right.imageUrl && left.imageUrl === right.imageUrl) return true;
  const a = visualTokenSet(left);
  const b = visualTokenSet(right);
  if (!a.size || !b.size) return false;
  const overlap = [...a].filter((token) => b.has(token)).length;
  return overlap / Math.min(a.size, b.size) >= 0.72;
}

function selectBestVisualSamples(samples, queries, platforms) {
  return queries.flatMap((trend) => {
    const ranked = samples.filter((sample) => sample.trendKey === trend.key)
      .sort((a, b) => (b.relevanceScore - a.relevanceScore) || (b.engagement - a.engagement));
    const selected = [];
    const take = (type, limit) => {
      while (selected.filter((item) => item.referenceType === type).length < limit) {
        let added = false;
        for (const platform of platforms) {
          const sample = ranked.find((item) => item.referenceType === type && item.platform === platform && !selected.some((chosen) => chosen.projectUrl === item.projectUrl || visuallySimilar(chosen, item)));
          if (!sample) continue;
          selected.push(sample);
          added = true;
          if (selected.filter((item) => item.referenceType === type).length >= limit) break;
        }
        if (!added) break;
      }
    };
    take("inspiration", 5);
    take("execution", 5);
    return selected.slice(0, visualSamplesPerTrend);
  });
}

async function collectXiaohongshuVisual(page, task, agent, activity) {
  const seen = new Set();
  const imageHashes = new Set();
  const samples = [];
  const discoveryEvidence = [];
  const discoveryQueries = buildCompetitorDiscoveryQueries(task.project);
  Object.assign(activity, { phase: "xhs_competitor_discovery", message: "正在识别当前互动类型的主要竞品" });
  for (let index = 0; index < discoveryQueries.length; index += 1) {
    const query = discoveryQueries[index];
    activity.sourceProgress.xiaohongshuVisual = {
      phase: "discovering_competitors", progress: Math.round((index / Math.max(1, discoveryQueries.length + 1)) * 25),
      queryIndex: index + 1, queryTotal: discoveryQueries.length, browsed: seen.size, saved: samples.length,
    };
    await updateTask(task.id, "running", activity);
    const result = await searchCandidates(page, query, agent);
    discoveryEvidence.push(...result.cards.slice(0, 12).map((card) => ({ title: card.title, text: card.text, url: card.url, query })));
  }
  const discovered = await agent.discoverInteractionCompetitors({
    projectContext: task.project,
    searchEvidence: discoveryEvidence,
  }).catch((error) => {
    console.warn(`竞品识别失败：${error.message}`);
    return null;
  });
  const competitors = (Array.isArray(discovered?.competitors) ? discovered.competitors : [])
    .map((item) => ({ name: String(item?.name || "").trim(), reason: String(item?.reason || "").trim() }))
    .filter((item, index, all) => item.name && all.findIndex((other) => other.name.toLowerCase() === item.name.toLowerCase()) === index)
    .slice(0, 4);
  activity.visualCompetitors = competitors;
  activity.sourceProgress.xiaohongshuVisual = {
    ...activity.sourceProgress.xiaohongshuVisual,
    phase: "searching_competitors",
    progress: 25,
    queryIndex: 0,
    queryTotal: competitors.length,
  };
  await updateTask(task.id, "running", activity);

  for (let index = 0; index < competitors.length; index += 1) {
    const competitor = competitors[index];
    const query = `${competitor.name} 视觉设计`;
    let competitorSaved = 0;
    Object.assign(activity, {
      phase: "xhs_visual_searching",
      currentQuery: query,
      message: `正在研究竞品「${competitor.name}」的视觉案例`,
    });
    activity.sourceProgress.xiaohongshuVisual = {
      ...activity.sourceProgress.xiaohongshuVisual,
      phase: "searching",
      progress: 25 + Math.round((index / Math.max(1, competitors.length)) * 70),
      queryIndex: index + 1,
      queryTotal: competitors.length,
      browsed: seen.size,
      saved: samples.length,
    };
    await updateTask(task.id, "running", activity);
    const result = await searchCandidates(page, query, agent);
    for (const card of result.cards) {
      if (competitorSaved >= 5 || seen.has(identity(card.url))) continue;
      seen.add(identity(card.url));
      try {
        const candidate = await openCandidate(page, card, result.url, task.project, query, agent);
        const screenshot = Buffer.from(candidate.screenshotBase64, "base64");
        const imageHash = createHash("sha256").update(screenshot).digest("hex");
        if (imageHashes.has(imageHash)) continue;
        const analysis = await agent.analyzeVisualSample({ screenshot, platform: "xiaohongshu", title: candidate.title, query });
        if (!analysis?.useful || !analysis.trendLabel || !Array.isArray(analysis.visualFeatures)) continue;
        imageHashes.add(imageHash);
        const visualCandidate = {
          ...candidate,
          id: `visual-${candidate.id}`,
          source: "xiaohongshu_visual",
          excerpt: String(analysis.reason || candidate.excerpt || "").slice(0, 500),
          keywords: [competitor.name, ...analysis.visualFeatures.slice(0, 6)],
          valuableComments: [],
        };
        await api(`/api/research/tasks/${task.id}/candidates`, {
          method: "POST", body: JSON.stringify({ candidates: [visualCandidate] }),
        });
        samples.push({
          id: visualCandidate.id, title: candidate.title, url: candidate.url,
          competitor: competitor.name,
          trendLabel: analysis.trendLabel, visualFeatures: analysis.visualFeatures,
          reason: analysis.reason,
        });
        competitorSaved += 1;
        activity.sourceProgress.xiaohongshuVisual.saved = samples.length;
        await updateTask(task.id, "running", activity);
      } catch (error) {
        if (error instanceof LoginRequiredError || error instanceof RateLimitedError) throw error;
        console.warn(`跳过小红书视觉案例 ${card.title}: ${error.message}`);
      }
    }
  }
  activity.sourceProgress.xiaohongshuVisual = {
    ...activity.sourceProgress.xiaohongshuVisual, phase: "completed", progress: 100, browsed: seen.size, saved: samples.length,
  };
  await updateTask(task.id, "running", activity);
  return samples;
}

async function collectXiaohongshu(page, task, queries, agent, activity) {
  const seen = new Set();
  let saved = 0;
  for (let index = 0; index < queries.length && saved < maxCandidates; index += 1) {
    const query = queries[index];
    activity.sourceProgress.xiaohongshu = {
      phase: "searching", progress: Math.round((index / queries.length) * 100),
      queryIndex: index + 1, queryTotal: queries.length,
      browsed: activity.browsedCount, saved,
    };
    Object.assign(activity, {
      phase: "searching", queryIndex: index + 1, currentQuery: query,
      message: "三个平台正在同步研究",
    });
    await updateTask(task.id, "running", activity);
    const result = await searchCandidates(page, query, agent);
    activity.browsedCount += result.cards.length;
    activity.sourceProgress.xiaohongshu.browsed = activity.browsedCount;

    for (const card of result.cards.slice(0, maxPerQuery)) {
      if (saved >= maxCandidates || seen.has(identity(card.url))) continue;
      seen.add(identity(card.url));
      activity.sourceProgress.xiaohongshu = {
        ...activity.sourceProgress.xiaohongshu,
        phase: "reading",
        progress: Math.min(94, Math.round(((index + 0.65) / queries.length) * 100)),
        currentTitle: card.title,
      };
      activity.matchedCount = seen.size;
      await updateTask(task.id, "running", activity);
      try {
        const candidate = await openCandidate(page, card, result.url, task.project, query, agent);
        if (task.project?.designType === "brand") candidate.source = "jd_feedback";
        await api(`/api/research/tasks/${task.id}/candidates`, {
          method: "POST",
          body: JSON.stringify({ candidates: [candidate] }),
        });
        saved += 1;
        activity.detailCount = saved;
        activity.agentRecoveryCalls = agent.recoveryCalls;
        activity.agentSummaryCalls = agent.summaryCalls;
        activity.sourceProgress.xiaohongshu.saved = saved;
        await updateTask(task.id, "running", activity);
      } catch (error) {
        if (error instanceof LoginRequiredError || error instanceof RateLimitedError) throw error;
        console.warn(`[${task.id}] 跳过候选 ${card.title}: ${error.message}`);
        activity.lastError = error.message;
        await page.keyboard.press("Escape").catch(() => {});
        await page.waitForTimeout(600);
        if (!page.url().includes("/search_result")) {
          await page.goBack({ waitUntil: "commit", timeout: 10000 }).catch(() => {});
        }
      }
      await sleep(actionDelayMs);
    }
  }
  activity.sourceProgress.xiaohongshu = {
    ...activity.sourceProgress.xiaohongshu, phase: "completed", progress: 100, saved,
  };
  await updateTask(task.id, "running", activity);
  return saved;
}

const brandStoreSpecs = {
  app_store: {
    progressKey: "appStore",
    name: "App Store",
    search: (query) => `https://apps.apple.com/cn/search?term=${encodeURIComponent(query)}`,
    selector: "a[href*='/app/']",
  },
  google_play: {
    progressKey: "googlePlay",
    name: "Google Play",
    search: (query) => `https://play.google.com/store/search?q=${encodeURIComponent(query)}&c=apps&hl=zh_CN`,
    selector: "a[href*='/store/apps/details']",
  },
};

async function collectBrandStorePlatform(context, task, platform, activity) {
  const spec = brandStoreSpecs[platform];
  const page = await context.newPage();
  const competitors = ["淘宝", "拼多多", "抖音商城"];
  const seen = new Set();
  let saved = 0;
  try {
    for (let queryIndex = 0; queryIndex < competitors.length; queryIndex += 1) {
      const query = competitors[queryIndex];
      activity.sourceProgress[spec.progressKey] = {
        phase: "searching", progress: Math.round((queryIndex / competitors.length) * 100),
        queryIndex: queryIndex + 1, queryTotal: competitors.length, reviewed: seen.size, saved,
      };
      await updateTask(task.id, "running", activity);
      await page.goto(spec.search(query), { waitUntil: "domcontentloaded", timeout: 25000 }).catch(() => {});
      await page.waitForTimeout(1200);
      const links = await page.locator(spec.selector).evaluateAll((nodes) => nodes.map((node) => ({
        url: node.href,
        title: (node.getAttribute("aria-label") || node.innerText || node.querySelector("img")?.alt || "").trim(),
      })).filter((item) => item.url));
      const match = links.find((item) => !seen.has(item.url));
      if (!match) continue;
      seen.add(match.url);
      await page.goto(match.url, { waitUntil: "domcontentloaded", timeout: 25000 }).catch(() => {});
      await page.waitForTimeout(1200);
      const bodyText = await page.locator("body").innerText().catch(() => "");
      if (!bodyText.trim()) continue;
      const title = await page.locator("h1").first().innerText().catch(() => match.title || query);
      const screenshot = await page.screenshot({ type: "png" });
      const date = bodyText.match(/20\d{2}[-./年]\d{1,2}(?:[-./月]\d{1,2})?/)?.[0] || "";
      await api(`/api/research/tasks/${task.id}/candidates`, {
        method: "POST",
        body: JSON.stringify({ candidates: [{
          id: `candidate-${platform}-${identity(match.url) || `${queryIndex + 1}`}`,
          source: platform,
          title: `${title.trim() || query} · ${spec.name}竞品案例`,
          url: match.url,
          author: spec.name,
          publishedAt: date || null,
          capturedAt: new Date().toISOString(),
          excerpt: bodyText.replace(/\s+/g, " ").trim().slice(0, 500),
          screenshotBase64: screenshot.toString("base64"),
          mediaType: "store_detail",
          keywords: ["竞品案例", spec.name, query],
          valuableComments: [],
          relevance: 80,
        }] }),
      });
      saved += 1;
      activity.sourceProgress[spec.progressKey].saved = saved;
      await updateTask(task.id, "running", activity);
    }
    activity.sourceProgress[spec.progressKey] = {
      ...activity.sourceProgress[spec.progressKey], phase: "completed", progress: 100, reviewed: seen.size, saved,
    };
    await updateTask(task.id, "running", activity);
    return saved;
  } finally {
    await page.close().catch(() => {});
  }
}

async function collectBrandStoreCases(context, task, activity) {
  activity.sourceProgress.appStore = { phase: "queued", progress: 0, reviewed: 0, saved: 0 };
  activity.sourceProgress.googlePlay = { phase: "queued", progress: 0, reviewed: 0, saved: 0 };
  Object.assign(activity, { phase: "brand_store_research", message: "正在进入 App Store 与 Google Play 竞品详情页" });
  await updateTask(task.id, "running", activity);
  const results = await Promise.allSettled([
    collectBrandStorePlatform(context, task, "app_store", activity),
    collectBrandStorePlatform(context, task, "google_play", activity),
  ]);
  results.forEach((result, index) => {
    if (result.status === "fulfilled") return;
    const key = index === 0 ? "appStore" : "googlePlay";
    activity.sourceProgress[key] = { ...activity.sourceProgress[key], phase: "failed", error: result.reason?.message || "商店页面读取失败" };
  });
  await updateTask(task.id, "running", activity);
}

async function processTask(context, task) {
  const pages = context.pages();
  const page = pages.find((item) => item.url().includes("xiaohongshu.com")) || await context.newPage();
  const queries = buildQueries(task.project);
  const confirmedDirections = task.activity?.visualDirectionsConfirmed && Array.isArray(task.activity?.visualDirections)
    ? task.activity.visualDirections : null;
  const activity = confirmedDirections ? { ...task.activity, sourceProgress: { ...(task.activity.sourceProgress || {}) } } : {
    phase: "starting", queryIndex: 0, queryTotal: queries.length,
    browsedCount: 0, matchedCount: 0, detailCount: 0, message: "正在准备小红书玩法案例研究",
    sourceProgress: {
      xiaohongshu: { phase: "queued", progress: 0, queryIndex: 0, queryTotal: queries.length, browsed: 0, saved: 0 },
      xiaohongshuVisual: { phase: "queued", progress: 0, queryIndex: 0, queryTotal: 4, browsed: 0, saved: 0 },
      officialTrends: { phase: "queued", progress: 0 },
    },
  };

  try {
    if (!confirmedDirections) {
      const xhsAgent = createResearchBrowserAgent();
      const saved = await collectXiaohongshu(page, task, queries, xhsAgent, activity);
      if (!saved) throw new Error("没有成功打开并保存玩法案例帖子");
      if (task.project?.designType === "brand") await collectBrandStoreCases(context, task, activity);
      const visualSamples = await collectXiaohongshuVisual(page, task, xhsAgent, activity);
      const trendAgent = createResearchBrowserAgent();
      Object.assign(activity, { phase: "official_trend_reading", message: "正在读取官方趋势并与竞品视觉特征交叉比较" });
      activity.sourceProgress.officialTrends = { phase: "reading", progress: 30 };
      await updateTask(task.id, "running", activity);
      const researchSources = await readSources(context, researchSourcesFor(task.project));
      activity.researchSources = researchSources.map(({ name, url }) => ({ name, url }));
      const currentOfficialSources = await readSources(context, officialTrendSources);
      activity.sourceProgress.officialTrends = { phase: "comparing", progress: 75 };
      const trendSelection = await trendAgent.selectVisualTrends({
        projectContext: task.project, officialSources: [...researchSources, ...currentOfficialSources], xhsVisualSamples: visualSamples,
      });
      if (!trendSelection?.trends || trendSelection.trends.length !== 4) throw new Error("未能形成4个可确认的视觉方向");
      activity.visualDirections = trendSelection.trends.map((trend) => ({
        label: String(trend.label || "").trim(),
        sourceNames: Array.isArray(trend.sourceNames) ? trend.sourceNames : [],
        rationale: String(trend.rationale || "").trim(),
        sampleIds: Array.isArray(trend.sampleIds) ? trend.sampleIds.filter((id) => visualSamples.some((sample) => sample.id === id)) : [],
      }));
      activity.officialTrendSources = currentOfficialSources.map(({ name, url }) => ({ name, url }));
      activity.sourceProgress.officialTrends = { phase: "completed", progress: 100 };
      Object.assign(activity, {
        phase: "awaiting_visual_confirmation", message: "4个视觉方向已形成，等待确认后再收集 Behance 与 Pinterest",
        agentRecoveryCalls: xhsAgent.recoveryCalls,
        agentSummaryCalls: xhsAgent.summaryCalls + trendAgent.summaryCalls,
      });
      await updateTask(task.id, "awaiting_visual_confirmation", activity);
      return;
    }

    await api(`/api/research/tasks/${task.id}/visual-samples?all=1`, { method: "DELETE" });
    const termAgent = createResearchBrowserAgent();
    Object.assign(activity, { phase: "generating_visual_terms", message: "正在为已确认方向生成短视觉搜索词" });
    await updateTask(task.id, "running", activity);
    const termSelection = await termAgent.generateVisualSearchTerms({ directions: confirmedDirections });
    const visualQueries = buildVisualQueries(termSelection, confirmedDirections);
    activity.visualTrendQueries = visualQueries.map(({ label, queries: searchTerms, reports: sourceNames, rationale }) => ({ label, searchTerms, sourceNames, rationale }));
    const visualPlatforms = visualPlatformsFor(task.project);
    for (const platform of visualPlatforms) activity.sourceProgress[platform] = { phase: "queued", progress: 0, queryIndex: 0, queryTotal: visualQueries.length, browsed: 0, reviewed: 0, saved: 0 };
    activity.visualPlatforms = visualPlatforms;
    activity.message = `${visualPlatforms.join("、")} 正在同步进入详情页采集`;
    await updateTask(task.id, "running", activity);
    const visualAgentBudget = visualQueries.length * visualDetailsPerTrend + 8;
    const visualAgents = Object.fromEntries(visualPlatforms.map((platform) => [platform, createResearchBrowserAgent({ maxCalls: visualAgentBudget })]));
    const visualResults = await Promise.allSettled(visualPlatforms.map((platform) => collectVisualPlatform(context, task, platform, visualQueries, visualAgents[platform], activity)));
    visualResults.forEach((result, index) => {
      if (result.status !== "rejected") return;
      const platform = visualPlatforms[index];
      console.warn(`${platform}视觉研究失败：${result.reason.message}`);
      activity.sourceProgress[platform] = { ...activity.sourceProgress[platform], phase: "failed", error: result.reason.message };
    });
    const evaluatedSamples = visualResults
      .flatMap((result) => result.status === "fulfilled" ? result.value : []);
    const incompletePlatforms = visualPlatforms.filter((platform) => Number(activity.sourceProgress[platform]?.reviewed || 0) < visualDetailsPerPlatform);
    const selectedSamples = selectBestVisualSamples(evaluatedSamples, visualQueries, visualPlatforms);
    const incompleteTrends = visualQueries.filter((trend) => {
      const trendSamples = selectedSamples.filter((sample) => sample.trendKey === trend.key);
      const platformMinimum = Math.floor(visualSamplesPerTrend / visualPlatforms.length);
      return trendSamples.length !== visualSamplesPerTrend
        || trendSamples.filter((sample) => sample.referenceType === "inspiration").length !== 5
        || trendSamples.filter((sample) => sample.referenceType === "execution").length !== 5
        || visualPlatforms.some((platform) => trendSamples.filter((sample) => sample.platform === platform).length < platformMinimum);
    });
    if (!selectedSamples.length) throw new Error("三个视觉平台均未获得可用样本，无法生成视觉案例结果");
    for (const sample of selectedSamples) {
      await api(`/api/research/tasks/${task.id}/visual-samples`, { method: "POST", body: JSON.stringify(sample) });
    }
    for (const platform of visualPlatforms) {
      activity.sourceProgress[platform] = {
        ...activity.sourceProgress[platform],
        saved: selectedSamples.filter((sample) => sample.platform === platform).length,
      };
    }
    const visualCounts = Object.fromEntries(visualPlatforms.map((platform) => [platform, selectedSamples.filter((sample) => sample.platform === platform).length]));
    const degraded = incompletePlatforms.length > 0 || incompleteTrends.length > 0;
    const degradationNotes = [
      incompletePlatforms.length ? `${incompletePlatforms.join("、")} 未浏览满40个详情页` : "",
      incompleteTrends.length ? `${incompleteTrends.map((trend) => trend.label).join("、")} 未达到10张参考图` : "",
    ].filter(Boolean);
    Object.assign(activity, {
      phase: "completed",
      degraded,
      degradationReason: degradationNotes.join("；"),
      agentSummaryCalls: Number(activity.agentSummaryCalls || 0) + termAgent.summaryCalls + Object.values(visualAgents).reduce((sum, agent) => sum + agent.summaryCalls, 0),
      visualSampleCount: selectedSamples.length,
      visualSourceCounts: visualCounts,
      message: degraded
        ? `已降级完成4个视觉方向，共 ${selectedSamples.length} 个高相关详情样本；${degradationNotes.join("；")}`
        : `已完成4个视觉方向，共 ${selectedSamples.length} 个高相关详情样本`,
    });
    await updateTask(task.id, "completed", activity);
  } catch (error) {
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

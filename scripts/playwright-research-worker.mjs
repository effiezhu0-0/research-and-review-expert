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
const actionDelayMs = Number(process.env.RESEARCH_ACTION_DELAY_MS || 800);
const visualDetailsPerTrend = Number(process.env.RESEARCH_VISUAL_DETAILS_PER_TREND || 10);
const visualDetailsPerPlatform = 40;
const visualSamplesPerTrend = 10;
const visualCardsPerSearch = 30;
// Visual competitor research is deliberately bounded separately from the number
// of retained cases: inspect up to ten details for each named competitor, then
// retain at most five distinct, evidence-bearing screenshots.
const visualCompetitorDetailsPerQuery = Number(process.env.RESEARCH_VISUAL_COMPETITOR_DETAILS_PER_QUERY || 10);

const visualPlatformSpecs = {
  behance: { selector: "a[href*='/gallery/']", detailPath: "/gallery/", search: (query) => `https://www.behance.net/search/projects?search=${encodeURIComponent(query)}` },
  pinterest: { selector: "a[href*='/pin/']", detailPath: "/pin/", search: (query) => `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}` },
  huaban: { selector: "a[href*='/pins/']", detailPath: "/pins/", search: (query) => `https://huaban.com/search?q=${encodeURIComponent(query)}` },
  dribbble: { selector: "a[href*='/shots/']", detailPath: "/shots/", search: (query) => `https://dribbble.com/search/${encodeURIComponent(query)}` },
};

function visualPlatformsFor(project) {
  return project?.designType === "interaction"
    ? ["behance", "pinterest"]
    : ["pinterest", "behance"];
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class LoginRequiredError extends Error {
  constructor(platformOrUrl, url) {
    const platform = url ? platformOrUrl : "小红书";
    super(`${platform}需要完成登录或安全验证`);
    this.platform = platform;
    this.url = url || platformOrUrl;
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

function appendCollectionLog(activity, sourceId, entry) {
  if (!activity.sourceProgress) activity.sourceProgress = {};
  const source = activity.sourceProgress[sourceId] || {};
  const logs = Array.isArray(source.collectionLog) ? source.collectionLog : [];
  logs.push({ at: new Date().toISOString(), ...entry });
  activity.sourceProgress[sourceId] = { ...source, collectionLog: logs.slice(-300) };
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
  const supplied = Array.isArray(project?.researchKeywords)
    ? project.researchKeywords.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  // A project represents one demand; honor every explicitly selected keyword.
  return [...new Set(supplied)];
}

function buildCompetitorDiscoveryQueries(project) {
  if (project?.designType === "brand") {
    const boundary = project?.answers?.boundary?.[0] || "数字品牌";
    return [`${boundary} 竞品`, `${boundary} 同类App`, `${boundary} 品牌案例`].slice(0, maxQueries);
  }
  if (project?.designType === "marketing") {
    const boundary = project?.answers?.boundary?.[0] || "大促会场";
    return [`${boundary} 竞品`, `${boundary} 同类活动`, `${boundary} 营销案例`].slice(0, maxQueries);
  }
  // Visual competitor discovery must be grounded in the explicit game type
  // selected in the project form; project name and meeting notes are unrelated.
  const selectedType = project?.answers?.game?.[0] || project?.customValues?.game || "互动";
  const primary = String(selectedType).replace(/（.*?）/g, "").replace(/游戏$/g, "").trim() || "互动";
  // First find the named competitors from one category-level search only.
  // Subsequent searches are deliberately the competitor names themselves.
  return [`${primary} 竞品`];
}

async function collectRightPanelRecommendations(page, { captureScreenshot = true } = {}) {
  const viewportWidth = await page.evaluate(() => innerWidth).catch(() => page.viewportSize()?.width || 1280);
  const frames = page.frames();
  const frameResults = await Promise.all(frames.map(async (frame) => {
    const isMainFrame = frame === page.mainFrame();
    let panelLeft = viewportWidth * 0.62;
    if (!isMainFrame) {
      const frameBox = await frame.frameElement().then((element) => element.boundingBox()).catch(() => null);
      if (!frameBox || frameBox.x < viewportWidth * 0.58) return null;
      // A child frame is already a separately laid out surface; the parent
      // geometry confirms it sits in the right panel, so inspect its full width.
      panelLeft = 0;
    }
    return frame.locator("body").evaluate((body, panelLeft) => {
    const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const candidates = [];
    const panelLines = [];
    const elements = [];
    const collectDeepElements = (root) => {
      for (const element of root.querySelectorAll("*")) {
        elements.push(element);
        if (element.shadowRoot) collectDeepElements(element.shadowRoot);
      }
    };
    const parentAcrossShadow = (element) => element.parentElement || element.getRootNode()?.host || null;
    collectDeepElements(body);
    for (const element of elements) {
      const rect = element.getBoundingClientRect();
      const text = clean(element.innerText || element.textContent);
      if (rect.width < 12 || rect.height < 10 || rect.right < panelLeft || rect.left > innerWidth) continue;
      if (rect.bottom < 0 || rect.top > innerHeight || !text || text.length > 1200) continue;
      if (text.length <= 1200 && rect.width > 24) panelLines.push({ text, y: Math.round(rect.top), x: Math.round(rect.left) });
      if (text.length > 48) continue;
      const style = getComputedStyle(element);
      const isBlue = [style.color, style.webkitTextFillColor].some((colorText) => {
        const color = colorText.match(/\d+/g)?.map(Number) || [];
        return color.length >= 3 && color[2] > color[0] + 12 && color[2] > color[1] + 4;
      });
      const parent = parentAcrossShadow(element);
      const parentText = clean(parent?.innerText || parent?.textContent).slice(0, 220);
      const hasCompetitorLabelStructure = Boolean(element.closest("li, [role='listitem']"))
        || (parentText.toLowerCase().startsWith(text.toLowerCase()) && /^[：:]/.test(parentText.slice(text.length).trimStart()));
      const isNamedElement = element.matches("a[href], [role='link'], [class*='title'], [class*='name']")
        || (element.matches("strong, b, h1, h2, h3, h4") && hasCompetitorLabelStructure);
      if (!isBlue && !isNamedElement) continue;
      const name = text.replace(/[º°⁰¹²³⁴⁵⁶⁷⁸⁹]+$/g, "").trim();
      if (name.length < 2) continue;
      candidates.push({
        name,
        url: element.href || element.closest("a[href]")?.href || "",
        context: parentText,
        blue: isBlue,
        fromRecommendationTitle: isNamedElement,
        x: Math.round(rect.left),
        y: Math.round(rect.top),
      });
    }
    // Some Xiaohongshu AI layouts expose recommendation rows without links or
    // semantic title tags. When a percentage badge exists, use it to recover
    // the first visible short text line in that row.
    for (const marker of elements) {
      const markerRect = marker.getBoundingClientRect();
      const markerText = clean(marker.innerText || marker.textContent);
      if (markerRect.left < panelLeft || markerRect.right > innerWidth || markerRect.bottom < 0 || markerRect.top > innerHeight) continue;
      if (!/\d{1,3}%\s*人推荐/.test(markerText) || markerText.length > 180) continue;
      let card = marker;
      for (let depth = 0; depth < 8 && parentAcrossShadow(card); depth += 1) {
        const text = clean(card.innerText || card.textContent);
        if (text.length > 180) break;
        if (text.length >= 24 && /\d{1,3}%\s*人推荐/.test(text)) break;
        card = parentAcrossShadow(card);
      }
      const cardRect = card.getBoundingClientRect();
      const cardText = clean(card.innerText || card.textContent);
      if (cardRect.left < panelLeft || cardText.length > 220) continue;
      const percentageTop = markerRect.top;
      const nameElement = [card, ...card.querySelectorAll("*")]
        .map((element) => ({ element, rect: element.getBoundingClientRect(), text: clean(element.innerText || element.textContent) }))
        .filter(({ rect, text }) => rect.width > 8 && rect.height > 8 && rect.left >= panelLeft && rect.right <= innerWidth && rect.bottom > 0 && rect.top < innerHeight && text.length >= 2 && text.length <= 48 && !/\d{1,3}%|人推荐|推荐$/.test(text))
        .sort((a, b) => Math.abs(a.rect.top - percentageTop) - Math.abs(b.rect.top - percentageTop) || a.rect.top - b.rect.top || a.rect.left - b.rect.left)[0];
      if (!nameElement) continue;
      const name = nameElement.text.replace(/[º°⁰¹²³⁴⁵⁶⁷⁸⁹]+$/g, "").trim();
      if (name.length < 2) continue;
      candidates.push({ name, url: nameElement.element.href || nameElement.element.closest("a[href]")?.href || "", context: cardText, blue: false, fromRecommendationCard: true, x: Math.round(nameElement.rect.left), y: Math.round(nameElement.rect.top) });
    }
    const unique = new Map();
    for (const item of candidates.sort((a, b) => Number(b.blue) - Number(a.blue) || Number(b.fromRecommendationCard) - Number(a.fromRecommendationCard) || a.y - b.y || a.x - b.x)) {
      if (/^(更多|展开|收起|搜索|查看|详情|小红书|笔记|用户|点点(?:\s*ai)?|问点点|ai)$/i.test(item.name)) continue;
      if (!unique.has(item.name.toLowerCase())) unique.set(item.name.toLowerCase(), item);
    }
    const orderedBlocks = [...new Map(panelLines.sort((a, b) => a.y - b.y || a.x - b.x).map(({ text }) => [text, text])).values()];
    const lines = [];
    for (const text of orderedBlocks) {
      if (lines.some((existing) => existing.includes(text))) continue;
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        if (text.includes(lines[index])) lines.splice(index, 1);
      }
      lines.push(text);
    }
    return { recommendations: [...unique.values()].slice(0, 30), text: lines.slice(0, 120).join("\n").slice(0, 12000) };
    }, panelLeft).catch(() => null);
  }));
  const recommendations = frameResults.flatMap((result) => result?.recommendations || []);
  const unique = new Map();
  for (const item of recommendations) {
    const key = item.name.toLowerCase();
    const existing = unique.get(key);
    if (!existing || Number(item.blue || item.fromRecommendationCard) > Number(existing.blue || existing.fromRecommendationCard)) unique.set(key, item);
  }
  const text = frameResults.map((result) => result?.text || "").filter(Boolean).join("\n").slice(0, 12000);
  let screenshotBase64 = "";
  if (captureScreenshot) {
    const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight })).catch(() => ({ width: viewportWidth, height: page.viewportSize()?.height || 900 }));
    const left = Math.max(0, Math.min(viewport.width - 1, Math.floor(viewport.width * 0.60)));
    const screenshot = await page.screenshot({
      type: "jpeg", quality: 72, animations: "disabled",
      clip: { x: left, y: 0, width: Math.max(1, viewport.width - left), height: Math.max(1, viewport.height) },
    }).catch(() => null);
    if (screenshot) screenshotBase64 = screenshot.toString("base64");
  }
  return {
    recommendations: [...unique.values()].slice(0, 30),
    text,
    screenshotBase64,
  };
}

async function collectDynamicRightPanel(page) {
  const startedAt = Date.now();
  const minWaitMs = Number(process.env.RESEARCH_COMPETITOR_PANEL_MIN_WAIT_MS || 5500);
  const maxWaitMs = Number(process.env.RESEARCH_COMPETITOR_PANEL_MAX_WAIT_MS || 22000);
  let previousText = "";
  let stableReads = 0;
  for (let attempt = 0; attempt < 28; attempt += 1) {
    const current = await collectRightPanelRecommendations(page, { captureScreenshot: false }).catch(() => ({ text: "" }));
    const nextText = String(current.text || "").trim();
    if (nextText && nextText === previousText) stableReads += 1;
    else stableReads = 0;
    previousText = nextText;
    const loading = /加载中|生成中|识别中|分析中|思考中|总结中|正在.{0,8}(?:生成|分析|识别|思考|加载|总结)/.test(nextText);
    const enoughContent = nextText.length >= 100 || /\d{1,3}%\s*人推荐/.test(nextText);
    const elapsed = Date.now() - startedAt;
    const stableEmptyFallback = elapsed >= 10000 && stableReads >= 5;
    if (elapsed >= minWaitMs && stableReads >= 3 && (enoughContent || stableEmptyFallback) && !loading) break;
    if (Date.now() - startedAt >= maxWaitMs) break;
    await page.waitForTimeout(800);
  }

  const restoreState = await page.evaluate(() => {
    const items = [];
    let id = 0;
    for (const element of document.querySelectorAll("*")) {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (rect.left < innerWidth * 0.55 || rect.right > innerWidth || element.scrollHeight <= element.clientHeight + 32 || !/(auto|scroll)/.test(style.overflowY)) continue;
      const key = `dl-panel-scroll-${id++}`;
      element.dataset.designLabPanelScroll = key;
      items.push({ key, top: element.scrollTop });
    }
    return { windowY: window.scrollY, items };
  }).catch(() => ({ windowY: 0, items: [] }));

  const recommendations = [];
  const textBlocks = [];
  const screenshots = [];
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight })).catch(() => ({ width: 1280, height: 900 }));
  let previousState = "";
  for (let step = 0; step < 5; step += 1) {
    const result = await collectRightPanelRecommendations(page).catch(() => null);
    if (result) {
      recommendations.push(...(result.recommendations || []));
      if (result.text) textBlocks.push(result.text);
      if (result.screenshotBase64) screenshots.push(result.screenshotBase64);
    }
    const state = await page.evaluate(() => JSON.stringify({
      windowY: window.scrollY,
      items: [...document.querySelectorAll("[data-design-lab-panel-scroll]")].map((element) => [element.dataset.designLabPanelScroll, element.scrollTop]),
    })).catch(() => "");
    if (!state || state === previousState) break;
    previousState = state;
    await page.mouse.move(Math.round(viewport.width * 0.88), Math.round(viewport.height * 0.78));
    await page.mouse.wheel(0, Math.round(viewport.height * 0.72));
    await page.waitForTimeout(450);
  }
  await page.evaluate((saved) => {
    for (const item of saved.items || []) {
      const element = [...document.querySelectorAll("[data-design-lab-panel-scroll]")].find((node) => node.dataset.designLabPanelScroll === item.key);
      if (element) {
        element.scrollTop = item.top;
        delete element.dataset.designLabPanelScroll;
      }
    }
    window.scrollTo(0, saved.windowY || 0);
  }, restoreState).catch(() => {});

  const unique = new Map();
  for (const item of recommendations.sort((a, b) => Number(b.blue || b.fromRecommendationCard) - Number(a.blue || a.fromRecommendationCard) || a.y - b.y)) {
    const key = item.name.toLowerCase();
    if (!unique.has(key)) unique.set(key, item);
  }
  return {
    recommendations: [...unique.values()].slice(0, 30),
    text: [...new Set(textBlocks)].join("\n\n").slice(0, 24000),
    screenshots,
  };
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

function matchesResearchTerms(project, query, ...values) {
  const normalize = (value) => String(value || "").normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
  // Keep fields separate: a term must occur inside an actual title/body/tag
  // field, and must not be accidentally assembled across field boundaries.
  const fields = values.flatMap((value) => Array.isArray(value) ? value : [value]).map(normalize).filter(Boolean);
  const keywords = Array.isArray(project?.researchKeywords) ? project.researchKeywords : [];
  const terms = [...new Set([...keywords, query].map(normalize).filter((value) => value.length >= 2))];
  return terms.some((term) => fields.some((field) => field.includes(term)));
}

function extractHashtags(...values) {
  const tags = [];
  for (const value of values) {
    const text = String(value || "").normalize("NFKC");
    for (const match of text.matchAll(/#([\p{L}\p{N}_]+)/gu)) tags.push(match[1]);
  }
  return [...new Set(tags)];
}

function canonicalVoiceDetailUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (!/(^|\.)new-ux\.jd\.com$/i.test(url.hostname)) return "";
    const entityParams = [...url.searchParams.entries()].filter(([name]) =>
      /^(?:id|uuid|feedbackid|issueid|problemid|questionid|voiceid|ticketid|recordid|complaintid|experienceid)$/i.test(name)
      || /^(?:feedback|issue|problem|question|voice|ticket|record|complaint|experience)_(?:id|key|code)$/i.test(name),
    );
    const path = url.pathname.replace(/\/+$/, "");
    const detailPath = /\/(?:detail|issue-detail|feedback-detail|problem-detail)(?:\/|$)/i.test(path)
      || /\/(?:issue|feedback|problem|question)\/[^/]+$/i.test(path);
    const hashHasIdentity = /#\/(?:detail|issue|feedback|problem|question)\/[^/?#]+/i.test(url.hash)
      || /#(?:id|feedbackId|issueId|problemId|questionId)=?[\w-]{6,}/i.test(url.hash);
    if (!entityParams.length && !detailPath && !hashHasIdentity) return "";
    if (entityParams.length) {
      const stableParams = new URLSearchParams();
      for (const [name, value] of entityParams.sort(([a], [b]) => a.localeCompare(b))) stableParams.set(name.toLowerCase(), value);
      url.search = stableParams.toString();
      url.hash = "";
    } else if (hashHasIdentity) {
      url.search = "";
    } else {
      url.search = "";
      url.hash = "";
    }
    return url.toString().replace(/\/$/, "");
  } catch { return ""; }
}

function voiceFeedbackId(value) {
  try {
    const url = new URL(String(value || ""));
    if (!/(^|\.)new-ux\.jd\.com$/i.test(url.hostname)) return "";
    const idParams = [...url.searchParams.entries()].find(([name, id]) =>
      /^(?:feedbackid|feedback_id|id|uuid|issueid|issue_id|problemid|problem_id|questionid|question_id|voiceid|voice_id|ticketid|recordid)$/i.test(name) && id.trim(),
    );
    if (idParams) return idParams[1].trim();
    const hashMatch = url.hash.match(/(?:feedbackid|feedback_id|issueid|problemid|questionid|voiceid|id)=?([\w-]{6,})/i)
      || url.hash.match(/#\/(?:detail|feedback|issue|problem|question)\/([\w-]{6,})/i);
    if (hashMatch) return hashMatch[1];
    const detailPath = url.pathname.match(/\/(?:detail|feedback|issue|problem|question)\/([\w-]{6,})\/?$/i);
    return detailPath?.[1] || "";
  } catch { return ""; }
}

async function voiceFeedbackUrl(page, identityText = "") {
  const identity = canonicalPostText(identityText);
  const pageUrl = page.url();
  const pageId = voiceFeedbackId(pageUrl);
  const evidence = await page.evaluate(({ needle, pageId: currentPageId }) => {
    const clean = (value) => String(value || "").normalize("NFKC").toLocaleLowerCase().replace(/https?:\/\/\S+/g, "").replace(/[\s\p{P}\p{S}]+/gu, "");
    const identityChunks = [needle.slice(0, 36), needle.slice(24, 60), needle.slice(48, 84)].filter((part) => part.length >= 24);
    const visible = (node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 180 && rect.height > 80 && rect.bottom > 0 && rect.top < innerHeight;
    };
    const selectors = [".voice-details", "[role='dialog']", "[aria-modal='true']", "[class*='detail']", "[class*='drawer']", "[class*='modal']", "[class*='feedback-detail']"];
    const surfaces = [...new Set(selectors.flatMap((selector) => [...document.querySelectorAll(selector)]))]
      .filter(visible)
      .map((node) => ({ node, text: clean(node.innerText || "") }))
      .filter((item) => item.text.length >= 40 && (!identityChunks.length || identityChunks.some((chunk) => item.text.includes(chunk))));
    const candidates = [];
    if (currentPageId) candidates.push({ id: currentPageId, url: location.href, source: "page_url" });
    const idPattern = /^(?:feedbackid|feedback_id|uuid|issueid|issue_id|problemid|problem_id|questionid|question_id|voiceid|voice_id|ticketid|recordid)$/i;
    const extractFromElement = (node, source) => {
      for (const attr of [...node.attributes]) {
        const normalizedName = attr.name.replace(/^data-/, "").replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        if (!idPattern.test(normalizedName)) continue;
        const value = String(attr.value || "").trim();
        if (/^[\w-]{6,}$/.test(value)) candidates.push({ id: value, url: "", source: `${source}:${attr.name}` });
      }
    };
    for (const { node } of surfaces) {
      extractFromElement(node, "detail_attribute");
      for (const child of node.querySelectorAll("[feedbackid], [feedback_id], [data-feedback-id], [issueid], [data-issue-id], [uuid], [data-uuid], [questionid], [problemid]")) extractFromElement(child, "detail_attribute");
      for (const anchor of node.querySelectorAll("a[href]")) {
        const href = anchor.href;
        const url = new URL(href, location.href);
        const id = url.searchParams.get("feedbackId") || url.searchParams.get("feedback_id") || url.searchParams.get("id")
          || url.searchParams.get("issueId") || url.searchParams.get("questionId")
          || url.hash.match(/(?:feedbackid|feedback_id|issueid|questionid|id)=?([\w-]{6,})/i)?.[1]
          || url.pathname.match(/\/(?:detail|feedback|issue|problem|question)\/([\w-]{6,})\/?$/i)?.[1]
          || "";
        if (id) candidates.push({ id, url: href, source: "detail_link" });
      }
    }
    const unique = [...new Map(candidates.map((item) => [`${item.id}|${item.url}`, item])).values()];
    return { detailVisible: surfaces.length > 0, identityMatched: surfaces.length > 0, detailTextLength: Math.max(0, ...surfaces.map((item) => item.text.length)), candidates: unique.slice(0, 20) };
  }, { needle: identity, pageId }).catch(() => ({ detailVisible: false, identityMatched: false, detailTextLength: 0, candidates: [] }));
  const candidate = evidence.candidates.find((item) => item.id && (item.url || pageUrl));
  if (!candidate) return { url: "", feedbackId: "", idSource: "", ...evidence };
  let url = candidate.url || pageUrl;
  if (!candidate.url && !voiceFeedbackId(url)) {
    try { const parsed = new URL(url); parsed.searchParams.set("feedbackId", candidate.id); url = parsed.toString(); } catch {}
  }
  return { url, feedbackId: candidate.id, idSource: candidate.source, ...evidence };
}

function canonicalPostText(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\b(?:转发|评论|赞|浏览)\s*\d*/g, "")
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

const minimumGameplayPostDate = new Date(2025, 9, 1);

function parsePostDate(text) {
  const value = String(text || "").normalize("NFKC").trim();
  if (!value) return null;
  const now = new Date();
  if (/刚刚|刚才|今天|今日|\d+\s*(?:秒|分钟|分|小时)前/.test(value)) return now;
  const relativeDays = value.match(/(\d+)\s*(?:天|日)前/);
  if (relativeDays) {
    const date = new Date(now);
    date.setDate(date.getDate() - Number(relativeDays[1]));
    return date;
  }
  const relativeWeeks = value.match(/(\d+)\s*周前/);
  if (relativeWeeks) {
    const date = new Date(now);
    date.setDate(date.getDate() - Number(relativeWeeks[1]) * 7);
    return date;
  }
  const relativeMonths = value.match(/(\d+)\s*个月前/);
  if (relativeMonths) {
    const date = new Date(now);
    date.setMonth(date.getMonth() - Number(relativeMonths[1]));
    return date;
  }
  const relativeYears = value.match(/(\d+)\s*年前/);
  if (relativeYears) {
    const date = new Date(now);
    date.setFullYear(date.getFullYear() - Number(relativeYears[1]));
    return date;
  }
  if (/昨天|昨日/.test(value)) {
    const date = new Date(now);
    date.setDate(date.getDate() - 1);
    return date;
  }
  if (/前天|前日/.test(value)) {
    const date = new Date(now);
    date.setDate(date.getDate() - 2);
    return date;
  }
  const full = value.match(/(20\d{2})\s*[-./年]\s*(\d{1,2})(?:\s*[-./月]\s*(\d{1,2})\s*日?)?/);
  if (full) {
    const date = new Date(Number(full[1]), Number(full[2]) - 1, Number(full[3] || 1));
    if (date.getFullYear() !== Number(full[1]) || date.getMonth() !== Number(full[2]) - 1 || date.getDate() !== Number(full[3] || 1)) return null;
    return date;
  }
  const monthDay = value.match(/^\s*(\d{1,2})\s*[-./月]\s*(\d{1,2})\s*日?(?:\s+\d{1,2}:\d{2})?\s*$/);
  if (monthDay) {
    let year = now.getFullYear();
    const date = new Date(year, Number(monthDay[1]) - 1, Number(monthDay[2]));
    if (date.getMonth() !== Number(monthDay[1]) - 1 || date.getDate() !== Number(monthDay[2])) return null;
    if (date > now) date.setFullYear(year - 1);
    return date;
  }
  if (/^\s*\d{1,2}:\d{2}\s*$/.test(value)) return now;
  return null;
}

function postDateEvidence(text, source = "unknown") {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  const date = parsePostDate(raw);
  return {
    raw: raw || "",
    source,
    parsed: date && !Number.isNaN(date.getTime())
      ? String(date.getFullYear()).padStart(4, "0") + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0")
      : "",
  };
}

function isDateInProjectRange(dateText, project = {}) {
  const date = parsePostDate(dateText);
  if (!date || Number.isNaN(date.getTime())) return null;
  const published = String(date.getFullYear()).padStart(4, "0") + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  const start = String(project.feedbackStartDate || "").trim();
  const end = String(project.feedbackEndDate || "").trim();
  if (!start || !end) return date >= minimumGameplayPostDate;
  return published >= start && published <= end;
}

function normalizedPostDate(text) {
  const date = parsePostDate(text);
  if (!date || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isRecentGameplayPost(text) {
  const date = parsePostDate(text);
  return Boolean(date && date >= minimumGameplayPostDate);
}

function isWithinFeedbackDateRange(text, project = {}) {
  const date = parsePostDate(text);
  if (!date || Number.isNaN(date.getTime())) return false;
  const published = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const start = String(project.feedbackStartDate || "").trim();
  const end = String(project.feedbackEndDate || "").trim();
  if (!start || !end) return date >= minimumGameplayPostDate;
  return published >= start && published <= end;
}

function classifyPureMutualAidPost(title, body, comments = []) {
  const content = [title, body, ...comments].filter(Boolean).join(" ").normalize("NFKC");
  const aidPatterns = [
    /求助力|求回关|找队友|招队友|帮忙点|帮忙助力/,
    /(?:求|找|差|缺|还差).{0,12}(?:互助|助力|互点|队友|组队|邀请|互换)/,
    /(?:互助|助力|组队|邀请|互换).{0,12}(?:求|找|差人|帮忙|拉我|互换)/,
    /(?:还差|差).{0,12}(?:求|帮忙|助力|点一下|拉我)|求.{0,12}(?:帮忙|助力|点一下|互助|回关|互点)/,
  ];
  const feedbackPatterns = [
    /不好用|难用|好用|体验(?:差|不好|不错|很好)|满意|不满意|喜欢|失望|好难|太难|太麻烦|太复杂|太费劲|太折腾/,
    /找不到|看不懂|不清楚|规则不明|入口.{0,6}(?:难找|不明显)|(?:闪退|卡顿|卡住|加载失败|无法.{0,8}(?:领取|兑换|进入|打开|完成))/,
    /(?:问题|故障|错误|bug|建议|希望|最好|应该|需要增加|优化|改进|改版|修复)/i,
    /(?:邀请|助力|互助|任务|奖励|兑换|活动).{0,12}(?:太多|太少|太难|不合理|不方便|不明确|不一致|失败|麻烦|繁琐)/,
    /(?:邀请多少人|找了\s*\d+\s*个人|邀请.{0,8}才能|还差\s*\d+(?:\.\d+)?\s*(?:分|元|个)?\s*(?:才能|才可以))/,
  ];
  const aidEvidence = aidPatterns.map((pattern) => content.match(pattern)?.[0]).filter(Boolean);
  const feedbackEvidence = feedbackPatterns.map((pattern) => content.match(pattern)?.[0]).filter(Boolean);
  return {
    isPureMutualAid: aidEvidence.length > 0 && feedbackEvidence.length === 0,
    aidEvidence: [...new Set(aidEvidence)].slice(0, 6),
    feedbackEvidence: [...new Set(feedbackEvidence)].slice(0, 6),
  };
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

const gameplayPlatformSpecs = [
  { id: "xiaohongshu", source: "xiaohongshu", name: "小红书", home: "https://www.xiaohongshu.com/explore", loginPattern: /登录后推荐更懂你的笔记|手机号登录|验证码登录|扫码登录/ },
  { id: "weibo", source: "weibo", name: "微博", home: "https://weibo.com/", search: (query) => `https://s.weibo.com/weibo?q=${encodeURIComponent(query)}`, loginPattern: /登录微博|立即登录|扫码登录|手机号登录/ },
  { id: "voiceOfUser", source: "voice_of_user", name: "用户之声", home: "https://new-ux.jd.com/issue?channel_id=1", loginPattern: /请登录|账号登录|登录京东|登录后查看/ },
];

async function platformPageState(page, spec) {
  return page.evaluate((platformId) => {
    const visible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const hasPasswordField = [...document.querySelectorAll("input[type='password'], input[name*='password' i]")].some(visible);
    const hasLoginDialog = [...document.querySelectorAll("[role='dialog'], form")].some((element) => visible(element) && /登录|账号/.test(element.textContent || ""));
    const text = document.body?.innerText || "";
    const hasVoiceContent = platformId === "voiceOfUser" && (
      /用户原声|我的订阅|产品模块|问题原声/.test(text)
    );
    return { url: location.href, text, hasPasswordField, hasLoginDialog, hasVoiceContent, ready: document.readyState !== "loading" && text.trim().length > 20 };
  }, spec.id).catch(() => ({ url: page.url(), text: "", hasPasswordField: false, hasLoginDialog: false, hasVoiceContent: false, ready: false }));
}

async function requiresPlatformLogin(page, spec, { waitForRedirect = false } = {}) {
  const attempts = waitForRedirect ? 14 : 1;
  let voiceAuthenticated = false;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const state = await platformPageState(page, spec);
    const loginUrl = /login|passport|signin/i.test(state.url);
    if (loginUrl || state.hasPasswordField || state.hasLoginDialog) return true;
    if (spec.id === "voiceOfUser") {
      if (spec.loginPattern.test(state.text)) return true;
      // Wait through the redirect window even if the old application shell is
      // visible: its content can appear before an expired session redirects.
      let isVoicePage = false;
      try { isVoicePage = new URL(state.url).hostname === "new-ux.jd.com"; } catch {}
      voiceAuthenticated = isVoicePage && state.ready && state.hasVoiceContent;
    } else if (spec.loginPattern.test(state.text)) {
      return true;
    } else if (state.ready && state.text.trim().length > 100) {
      return false;
    }
    if (attempt + 1 < attempts) await page.waitForTimeout(500);
  }
  // An empty or stalled SSO redirect is not evidence of an authenticated session.
  return spec.id === "voiceOfUser" ? !voiceAuthenticated : false;
}

async function ensureGameplayPlatformLogins(context, task, activity) {
  const ignored = new Set(activity.ignoredPlatforms || []);
  const selected = new Set(Array.isArray(task.project?.feedbackPlatforms) && task.project.feedbackPlatforms.length
    ? task.project.feedbackPlatforms : gameplayPlatformSpecs.map((spec) => spec.id));
  const missing = [];
  for (const spec of gameplayPlatformSpecs) {
    if (ignored.has(spec.id) || !selected.has(spec.id)) continue;
    const existingPages = context.pages().filter((item) => {
      try {
        const url = new URL(item.url());
        if (spec.id === "voiceOfUser") return url.hostname === "new-ux.jd.com" || (url.hostname === "ssa.jd.com" && /^\/sso\/login/i.test(url.pathname));
        const domain = spec.id === "weibo" ? "weibo.com" : "xiaohongshu.com";
        return url.hostname === domain || url.hostname.endsWith(`.${domain}`);
      }
      catch { return false; }
    });
    if (existingPages.length) {
      // An SSO/login tab takes precedence over another stale or partially loaded tab
      // from the same platform; never let the latter make this platform pass.
      const loginPages = existingPages.filter((item) => /login|passport|signin/i.test(item.url()));
      if (spec.id === "voiceOfUser" && !loginPages.length) {
        // Reopen the actual service so a cached page cannot stand in for a
        // current authentication check. Keep it open if SSO is required.
        const loaded = await existingPages[0].goto(spec.home, { waitUntil: "domcontentloaded", timeout: 25000 }).then(() => true, () => false);
        if (!loaded) {
          missing.push(spec);
          await existingPages[0].bringToFront().catch(() => {});
          continue;
        }
      }
      const requiresLogin = loginPages.length > 0 || (await Promise.all(existingPages.map((item) =>
        requiresPlatformLogin(item, spec, { waitForRedirect: true }),
      ))).some(Boolean);
      if (requiresLogin) {
        missing.push(spec);
        await (loginPages[0] || existingPages[0]).bringToFront().catch(() => {});
      }
      continue;
    }
    const blankPage = spec.id === "xiaohongshu"
      ? context.pages().find((item) => item.url() === "about:blank")
      : null;
    const page = blankPage || await context.newPage();
    const loaded = await page.goto(spec.home, { waitUntil: "domcontentloaded", timeout: 25000 }).then(() => true, () => false);
    if (!loaded || await requiresPlatformLogin(page, spec, { waitForRedirect: true })) missing.push(spec);
  }
  if (!missing.length) return true;
  const names = missing.map((item) => item.name);
  await updateTask(task.id, "needs_login", { ...activity, phase: "needs_login", loginRequiredPlatforms: names, message: `已打开${names.join("、")}页签，请完成登录后继续` }, {
    error: `请先完成${names.join("、")}登录后再开始玩法研究`, blockedSource: missing[0].id, actionUrl: missing[0].home,
  });
  return false;
}

async function setVoiceOfUserDateRange(page, requestedStart, requestedEnd) {
  const rangePattern = /^\s*\d{4}-\d{2}-\d{2}\s*[~～—-]\s*\d{4}-\d{2}-\d{2}\s*$/;
  const visibleInputs = page.locator("input").filter({ visible: true });
  const rangeIndex = await visibleInputs.evaluateAll((nodes) => nodes.findIndex((node) =>
    /^\s*\d{4}-\d{2}-\d{2}\s*[~～—-]\s*\d{4}-\d{2}-\d{2}\s*$/.test(node.value || ""),
  )).catch(() => -1);
  const rangeText = page.getByText(rangePattern).filter({ visible: true }).first();
  if (rangeIndex >= 0) await visibleInputs.nth(rangeIndex).click().catch(() => {});
  else if (await rangeText.isVisible().catch(() => false)) await rangeText.click().catch(() => {});
  else {
    const calendarButton = page.locator("button[aria-label*='日期'], button[aria-label*='日历'], [role='button'][aria-label*='日期'], [role='button'][aria-label*='日历']").filter({ visible: true }).first();
    if (await calendarButton.isVisible().catch(() => false)) await calendarButton.click().catch(() => {});
  }
  await page.waitForTimeout(250);
  const dateFields = await page.locator("input").evaluateAll((nodes) => nodes.map((node, index) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return {
      index, value: node.value || "",
      visible: style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0,
    };
  }).filter((item) => item.visible && /^\d{4}-\d{2}-\d{2}$/.test(item.value))).catch(() => []);
  if (dateFields.length < 2) throw new Error("用户之声日期选择器未展开或未找到起止日期输入框，已停止该平台采集。");
  const values = [requestedStart || "2025-10-01", requestedEnd || new Date().toISOString().slice(0, 10)];
  for (const [index, value] of values.entries()) {
    const currentDateFields = await page.locator("input").evaluateAll((nodes) => nodes.map((node, fieldIndex) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return { index: fieldIndex, value: node.value || "", visible: style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0 };
    }).filter((field) => field.visible && /^\d{4}-\d{2}-\d{2}$/.test(field.value))).catch(() => []);
    const field = currentDateFields.slice(-2)[index];
    if (!field) throw new Error(`用户之声日期选择器展开后未找到${index === 0 ? "开始" : "结束"}日期输入框，已停止采集。`);
    const input = page.locator("input").nth(field.index);
    await input.click().catch(() => {});
    await input.press("ControlOrMeta+A").catch(() => {});
    await input.pressSequentially(value, { delay: 20 }).catch(() => {});
    let actualValue = await input.inputValue().catch(() => "");
    if (actualValue !== value) {
      await input.fill(value).catch(() => {});
      actualValue = await input.inputValue().catch(() => "");
    }
    if (actualValue !== value) {
      const attributes = await input.evaluate((node) => ({ type: node.getAttribute("type"), readOnly: node.readOnly, disabled: node.disabled, placeholder: node.getAttribute("placeholder") })).catch(() => ({}));
      throw new Error(`用户之声${index === 0 ? "开始" : "结束"}日期输入失败（${JSON.stringify(attributes)}），已停止采集。`);
    }
  }
  const finalFields = await page.locator("input").evaluateAll((nodes) => nodes.map((node, index) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return { index, value: node.value || "", visible: style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0 };
  }).filter((field) => field.visible && /^\d{4}-\d{2}-\d{2}$/.test(field.value))).catch(() => []);
  await page.locator("input").nth(finalFields.at(-1)?.index ?? -1).press("Enter").catch(() => {});
  await page.waitForTimeout(700);
  const appliedFields = await page.locator("input").evaluateAll((nodes) => nodes.map((node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return { value: node.value || "", visible: style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0 };
  }).filter((field) => field.visible && /^\d{4}-\d{2}-\d{2}$/.test(field.value))).catch(() => []);
  const applied = appliedFields.slice(-2).map((field, index) => field.value === values[index]);
  if (applied.some((value) => !value)) throw new Error(`用户之声日期筛选未能应用指定区间（${values[0]} 至 ${values[1]}），已停止该平台采集。`);
  const resultsHeading = page.getByText("搜索结果", { exact: true }).filter({ visible: true }).first();
  if (await resultsHeading.isVisible().catch(() => false)) await resultsHeading.click().catch(() => {});
  else await page.locator("body").click({ position: { x: 12, y: 12 } }).catch(() => {});
  await page.waitForTimeout(250);
}

async function locateCommunitySearchInput(page, spec, { activate = false } = {}) {
  const selectors = spec.id === "weibo"
    ? [
        "input[placeholder*='搜']", "input[aria-label*='搜']", "input[type='search']",
        "input[name='q']", "#search_input", "input[class*='search']", "form[action*='search'] input",
      ]
    : ["input[placeholder*='搜索']", "textarea[placeholder*='搜索']", "input[type='search']"];
  const locate = async () => {
    for (const selector of selectors) {
      const matches = page.locator(selector).filter({ visible: true });
      const count = await matches.count().catch(() => 0);
      for (let index = 0; index < Math.min(count, 5); index += 1) {
        const input = matches.nth(index);
        if (await input.isVisible().catch(() => false)
          && await input.isEnabled().catch(() => false)
          && await input.isEditable().catch(() => false)) return input;
      }
    }
    if (spec.id === "weibo") {
      // In Weibo's expanded search overlay the input can have no placeholder,
      // aria-label, or search class. Keep the fallback inside the header search
      // region: the composer also exposes a large editable control lower down.
      const controls = page.locator("input:not([type='hidden']), textarea, [role='combobox'], [role='textbox'], [contenteditable='true']").filter({ visible: true });
      const count = await controls.count().catch(() => 0);
      for (let index = 0; index < Math.min(count, 20); index += 1) {
        const control = controls.nth(index);
        const isTopSearch = await control.evaluate((node) => {
          const rect = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          return rect.top >= 0 && rect.top < 105 && rect.width >= 180 && rect.height >= 24
            && style.display !== "none" && style.visibility !== "hidden"
            && !node.disabled && !node.readOnly && node.getAttribute("aria-disabled") !== "true";
        }).catch(() => false);
        if (isTopSearch && await control.isEditable().catch(() => false)) return control;
      }
    }
    return null;
  };
  if (spec.id === "weibo" && activate) {
    // Activate Weibo's header search pill first. It may replace itself with a
    // fresh input after the click, so never reuse a locator from before it.
    const initialInput = await locate();
    if (initialInput) await initialInput.click({ timeout: 2000 }).catch(() => {});
    else {
      const searchSurface = page.getByText(/搜索微博|搜索/).filter({ visible: true }).first();
      if (await searchSurface.isVisible().catch(() => false)) await searchSurface.click({ timeout: 2000 }).catch(() => {});
      else {
        const searchButton = page.locator("button[aria-label*='搜'], [role='button'][aria-label*='搜'], [class*='search-icon'], [class*='Search_icon']").filter({ visible: true }).first();
        if (await searchButton.isVisible().catch(() => false)) await searchButton.click({ timeout: 1500 }).catch(() => {});
      }
    }
    await page.waitForTimeout(250);
    const activatedInput = await locate();
    if (activatedInput) return activatedInput;
  }
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const input = await locate();
    if (input) return input;
    await page.waitForTimeout(300);
  }
  return null;
}

async function fillCommunitySearchInput(page, spec, query, { activate = false } = {}) {
  try {
    let input = await locateCommunitySearchInput(page, spec, { activate });
    if (!input) throw new Error("搜索框未找到");
    if (!activate) {
      await input.click({ timeout: 4000 });
      await page.waitForTimeout(200);
      // Clicking can replace the header input in a search overlay.
      input = await locateCommunitySearchInput(page, spec);
      if (!input) throw new Error("点击搜索栏后没有可输入的搜索框");
    }
    await input.press("ControlOrMeta+A", { timeout: 3000 }).catch(() => {});
    await input.pressSequentially(query, { delay: 25, timeout: 5000 });
    let actual = await input.inputValue({ timeout: 3000 }).catch(() => "");
    if (actual !== query) {
      input = await locateCommunitySearchInput(page, spec);
      if (!input) throw new Error("输入框在键入时被页面替换");
      await input.fill(query, { timeout: 5000 });
      actual = await input.inputValue({ timeout: 3000 }).catch(() => "");
    }
    if (actual !== query) throw new Error("输入内容与关键词不一致");
    return input;
  } catch (error) {
    throw new Error(`${spec.name}搜索框无法输入关键词：${error.message}`);
  }
}

async function submitWeiboSearch(page, input) {
  const expected = String(await input.inputValue({ timeout: 3000 }).catch(() => "")).trim();
  if (!expected) throw new Error("微博搜索词为空，未提交");

  // Prefer the submit control associated with the header search field. Some
  // Weibo layouts use a form button; others expose an icon-only search button.
  const form = input.locator("xpath=ancestor::form[1]");
  const formSubmit = form.locator("button[type='submit'], input[type='submit'], [role='button'][type='submit']").filter({ visible: true }).first();
  if (await form.count().catch(() => 0) && await formSubmit.isVisible().catch(() => false)) {
    await formSubmit.click({ timeout: 3000 });
    return "button";
  }

  const searchButtons = page.locator([
    "button[aria-label*='搜']", "[role='button'][aria-label*='搜']", "button[title*='搜']",
    "[class*='search-icon']", "[class*='Search_icon']", "[class*='searchBtn']", "[class*='search-btn']",
  ].join(", ")).filter({ visible: true });
  const count = await searchButtons.count().catch(() => 0);
  for (let index = 0; index < Math.min(count, 10); index += 1) {
    const button = searchButtons.nth(index);
    const inHeader = await button.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return rect.top >= 0 && rect.top < 110 && rect.width > 0 && rect.height > 0;
    }).catch(() => false);
    if (!inHeader) continue;
    await button.click({ timeout: 3000 });
    return "button";
  }

  // If this layout has no identifiable search icon, submit from the verified
  // search field as a fallback.
  await input.press("Enter", { timeout: 3000 });
  return "enter";
}

async function searchCommunityCards(page, spec, query, project) {
  let activePage = page;
  let searchConfirmed = spec.id !== "weibo" && spec.id !== "voiceOfUser";
  let confirmationMethod = searchConfirmed ? "search_input_or_direct_route" : "not_confirmed";
  await page.goto(spec.home, { waitUntil: "domcontentloaded", timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(1300);
  if (await requiresPlatformLogin(page, spec, { waitForRedirect: true })) throw new LoginRequiredError(spec.name, page.url() || spec.home);
  let search = spec.id === "weibo" ? null : await locateCommunitySearchInput(page, spec);
  if (spec.id === "voiceOfUser") {
    if (!search) throw new Error("用户之声搜索框未找到或不可输入，已停止采集。");
    const previousUrl = page.url();
    search = await fillCommunitySearchInput(page, spec, query);
    await search.press("Enter");
    const enteredResults = await page.waitForFunction(({ previousUrl, query }) => {
      const text = document.body?.innerText || "";
      return location.href !== previousUrl || (text.includes(query) && /搜索结果|相关结果|暂无结果|没有找到|共\s*\d+\s*条/.test(text));
    }, { previousUrl, query }, { timeout: 8000 }).then(() => true, () => false);
    if (await requiresPlatformLogin(page, spec, { waitForRedirect: true })) throw new LoginRequiredError(spec.name, page.url() || spec.home);
    if (!enteredResults) throw new Error("用户之声未确认进入搜索结果，已停止采集。");
    searchConfirmed = true;
    confirmationMethod = page.url() !== previousUrl ? "url_changed" : "results_text_visible";
    await setVoiceOfUserDateRange(page, project?.feedbackStartDate, project?.feedbackEndDate);
  } else if (spec.id === "weibo") {
    search = await fillCommunitySearchInput(page, spec, query, { activate: true });
    const actualQuery = String(await search.inputValue({ timeout: 3000 }).catch(() => "")).trim();
    if (actualQuery !== query) throw new Error(`微博搜索词校验失败：期望“${query}”，实际为“${actualQuery}”`);
    let popupPromise = page.waitForEvent("popup", { timeout: 1800 }).catch(() => null);
    await submitWeiboSearch(page, search);
    const popup = await popupPromise;
    if (popup) {
      activePage = popup;
      await popup.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
    }
    // Weibo may remove spaces from the submitted phrase in its q parameter
    // (e.g. "JOY游记 互动活动" becomes "JOY游记互动活动").
    const normalizedQuery = String(query).normalize("NFKC").replace(/\s+/g, "");
    let enteredResults = false;
    const findResultPage = () => page.context().pages().find((candidatePage) => {
      try {
        const url = new URL(candidatePage.url());
        const q = String(url.searchParams.get("q") || "").normalize("NFKC").replace(/\s+/g, "");
        return url.hostname === "s.weibo.com" && url.pathname.startsWith("/weibo")
          && (q === normalizedQuery || q.includes(normalizedQuery));
      } catch { return false; }
    });
    const findConfirmedResultsPage = async () => {
      const byUrl = findResultPage();
      if (byUrl) return byUrl;
      for (const candidatePage of page.context().pages()) {
        if (!/s\.weibo\.com\/weibo/.test(candidatePage.url())) continue;
        const text = await candidatePage.locator("body").innerText({ timeout: 1000 }).catch(() => "");
        if (text.includes(query) && /搜索结果|综合|实时/.test(text)) return candidatePage;
      }
      return null;
    };
    const waitForResultPage = async (duration) => {
      const deadline = Date.now() + duration;
      while (Date.now() < deadline) {
        const resultPage = await findConfirmedResultsPage();
        if (resultPage) {
          activePage = resultPage;
          return true;
        }
        await page.waitForTimeout(250);
      }
      return false;
    };
    enteredResults = await waitForResultPage(2500);
    if (!enteredResults) {
      // A filled header field can leave Weibo showing suggestions without
      // submitting. Retry once with Enter after rechecking the same query.
      search = await locateCommunitySearchInput(page, spec, { activate: true });
      if (search) {
        const retryQuery = String(await search.inputValue({ timeout: 3000 }).catch(() => "")).trim();
        if (retryQuery !== query) {
          await search.fill(query, { timeout: 5000 });
          const filledQuery = String(await search.inputValue({ timeout: 3000 }).catch(() => "")).trim();
          if (filledQuery !== query) throw new Error(`微博重试搜索词校验失败：期望“${query}”，实际为“${filledQuery}”`);
        }
        popupPromise = page.waitForEvent("popup", { timeout: 1800 }).catch(() => null);
        await search.press("Enter", { timeout: 3000 });
        const retryPopup = await popupPromise;
        if (retryPopup) {
          activePage = retryPopup;
          await retryPopup.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
        }
        const retryDeadline = Date.now() + 10000;
        while (!enteredResults && Date.now() < retryDeadline) {
          enteredResults = await waitForResultPage(300);
        }
      }
    }
    if (!enteredResults) throw new Error("微博按回车后未确认进入该关键词的搜索结果页，已停止采集。");
    searchConfirmed = true;
    confirmationMethod = findResultPage() ? "results_url_query_matches" : "results_text_matches";
    await activePage.waitForTimeout(900);
  } else if (search) {
    search = await fillCommunitySearchInput(page, spec, query).catch(() => null);
    await search.press("Enter").catch(() => {});
    await page.waitForTimeout(1000);
  } else if (spec.search) {
    await page.goto(spec.search(query), { waitUntil: "domcontentloaded", timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(900);
  }
  const found = new Map();
  // Weibo marks the actual post with feed_list_item and often nests it inside
  // card-wrap. Query one level only; combining both selectors duplicates every
  // post and makes a later exact-match check look ambiguous.
  const primaryWeiboCards = spec.id === "weibo"
    ? await activePage.locator("div[action-type='feed_list_item']").count().catch(() => 0)
    : 0;
  const voiceCards = spec.id === "voiceOfUser"
    ? await activePage.locator(".user-voice-card-wrapper").count().catch(() => 0)
    : 0;
  const selector = spec.id === "weibo"
    ? (primaryWeiboCards ? "div[action-type='feed_list_item']" : "div.card-wrap")
    // Prefer the observed card boundary. The generic fallback is retained for
    // layouts where JD has changed its class names.
    : spec.id === "voiceOfUser" && voiceCards
      ? ".user-voice-card-wrapper"
      : "article, [class*='issue'], [class*='feedback'], [class*='card'], [class*='item']";
  let scrollSteps = 0;
  let noNewResultRounds = 0;
  let stopReason = "达到页面滚动安全上限";
  let selectorMatches = 0;
  let acceptedCardsInOnePass = 0;
  const rejectedByReasonTotals = {};
  const rejectionSampleMap = new Map();
  const maxScrollSteps = 60;
  for (let step = 0; step <= maxScrollSteps; step += 1) {
    const previousCount = found.size;
    selectorMatches = Math.max(selectorMatches, await activePage.locator(selector).count().catch(() => 0));
    const extracted = await activePage.locator(selector).evaluateAll((nodes, specId) => {
      const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
      return nodes.map((node, nodeIndex) => {
        const rect = node.getBoundingClientRect();
        const text = clean(node.innerText);
        const links = [...node.querySelectorAll("a[href]")].map((anchor) => anchor.href).filter(Boolean);
        // Weibo search results are already post-detail cards. Their first link
        // is commonly the author's profile, so never use it as a post URL.
        // Voice of User exposes feedbackId after a result card is opened.
        // Links inside the card can point elsewhere and are not reliable IDs.
        const url = specId === "weibo" || specId === "voiceOfUser" ? "" : (links.find((href) => !/login|signup|help|search|javascript:/i.test(href)) || "");
        const sourceUrl = specId === "weibo"
          ? (links.find((href) => /\/(?:detail|status|comment)\//i.test(href) || /\/\d{5,}\/[a-z\d]{5,}/i.test(new URL(href).pathname)) || "")
          : url;
        const postBodyNode = specId === "weibo"
          ? node.querySelector("[node-type='feed_list_content'], [node-type='feed_list_content'] .txt, .txt[node-type='feed_list_content'], .WB_text, [class*='feed_list_content']")
          : null;
        // Weibo posts have no independent title. Use the actual post body as
        // identity text and leave the source-title field empty; generic title
        // selectors often match a tiny UI label (for example a 2-char badge).
        const postText = specId === "weibo"
          ? clean(postBodyNode?.innerText || postBodyNode?.textContent || node.querySelector(".txt")?.innerText || "")
          : text;
        const author = specId === "weibo" ? clean(node.querySelector("a[namecard], .name, [class*='name']")?.textContent || "") : "";
        const title = specId === "weibo" ? "" : clean(node.querySelector("h1,h2,h3,[class*='title']")?.textContent || text.split(" ").slice(0, 20).join(" ")).slice(0, 160);
        const visible = rect.width > 240 && rect.height > 100 && rect.bottom > 0 && rect.top < innerHeight;
        const rejectionReasons = [];
        if (!visible) rejectionReasons.push("not_visible_or_too_small");
        if (specId === "weibo") {
          if (postText.length < 4) rejectionReasons.push("weibo_post_body_missing_or_too_short");
        } else {
          if (title.length < 8) rejectionReasons.push("title_too_short");
          if (text.length < 30) rejectionReasons.push("text_too_short");
        }
        return {
          card: { nodeIndex, url, sourceUrl, feedbackId: "", title, text: text.slice(0, 2200), identityText: postText.slice(0, 1800), author, visible },
          rejectionReasons,
          diagnostic: { nodeIndex, className: String(node.className || "").slice(0, 100), width: Math.round(rect.width), height: Math.round(rect.height), inViewport: rect.bottom > 0 && rect.top < innerHeight, titleLength: title.length, postBodyLength: postText.length, textLength: text.length },
        };
      });
    }, spec.id).catch(() => []);
    const cards = extracted.filter((item) => !item.rejectionReasons.length).map((item) => item.card);
    const rejectedByReason = {};
    for (const item of extracted) for (const reason of item.rejectionReasons) rejectedByReason[reason] = Number(rejectedByReason[reason] || 0) + 1;
    for (const [reason, count] of Object.entries(rejectedByReason)) rejectedByReasonTotals[reason] = Math.max(rejectedByReasonTotals[reason] || 0, count);
    for (const item of extracted.filter((entry) => entry.rejectionReasons.length)) {
      if (rejectionSampleMap.size >= 8) break;
      if (!rejectionSampleMap.has(item.diagnostic.nodeIndex)) rejectionSampleMap.set(item.diagnostic.nodeIndex, { ...item.diagnostic, reasons: item.rejectionReasons });
    }
    acceptedCardsInOnePass = Math.max(acceptedCardsInOnePass, cards.length);
    for (const card of cards) {
      const key = `${card.title}:${(card.identityText || card.text).slice(0, 160)}`;
      if (!found.has(key)) found.set(key, card);
    }
    noNewResultRounds = found.size === previousCount ? noNewResultRounds + 1 : 0;
    if (!found.size && step >= 2) {
      const pageText = await activePage.locator("body").innerText({ timeout: 1500 }).catch(() => "");
      if (/暂无结果|没有找到|未找到相关/.test(pageText)) {
        stopReason = "平台显示没有搜索结果";
        break;
      }
    }
    if (noNewResultRounds >= 3) {
      stopReason = "连续3轮滚动未发现新结果";
      break;
    }
    if (step === maxScrollSteps) break;
    await activePage.mouse.wheel(0, 900);
    await activePage.waitForTimeout(700);
    scrollSteps += 1;
  }
  if (spec.id === "voiceOfUser") {
    await activePage.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" })).catch(() => {});
    await activePage.waitForTimeout(300);
  }
  const pageTitle = await activePage.title().catch(() => "");
  return {
    cards: [...found.values()], page: activePage, scrollSteps, stopReason,
    diagnostics: {
      searchConfirmed,
      confirmationMethod,
      pageUrl: activePage.url(),
      pageTitle,
      selector,
      selectorMatches,
      acceptedCardsInOnePass,
      rejectedByReason: rejectedByReasonTotals,
      rejectionSamples: [...rejectionSampleMap.values()],
    },
  };
}

async function expandWeiboComments(page, postCard = page.locator("body")) {
  const clickables = postCard.locator("a, button, [role='button'], [action-type], [node-type]").filter({ visible: true });
  const count = await clickables.count().catch(() => 0);
  let target = null;
  let bestScore = 0;
  for (let index = 0; index < Math.min(count, 500); index += 1) {
    const locator = clickables.nth(index);
    const metadata = await locator.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return {
        label: [node.getAttribute("action-type"), node.getAttribute("node-type"), node.getAttribute("aria-label"), node.getAttribute("title"), node.className, node.innerText].join(" "),
        top: rect.top, width: rect.width, height: rect.height,
      };
    }).catch(() => null);
    if (!metadata || metadata.width < 12 || metadata.height < 12 || metadata.top < 0) continue;
    if (!/comment|评论/i.test(metadata.label)) continue;
    const label = metadata.label;
    const score = (/feed_list_comment|comment_btn|评论/i.test(label) ? 100 : 0)
      + (metadata.top > 250 ? 10 : 0)
      - (metadata.width > 700 ? 40 : 0);
    if (score > bestScore) { bestScore = score; target = locator; }
  }
  if (!target) return false;
  await target.click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(700);
  return true;
}

async function readWeiboComments(page, postCard = page.locator("body")) {
  const selectors = [
    "[node-type='comment_list'] [node-type='comment_item']",
    "[node-type*='comment_list'] [class*='comment']",
    "[class*='comment-list'] [class*='comment-item']",
    "[class*='commentList'] [class*='commentItem']",
    "[class*='comment-item']",
  ];
  for (const selector of selectors) {
    const values = await postCard.locator(selector).filter({ visible: true }).allTextContents().catch(() => []);
    const comments = [...new Set(values.map((item) => item.replace(/\s+/g, " ").trim()).filter((item) => item.length >= 8 && item.length <= 500))];
    if (comments.length) return comments.slice(0, 8);
  }
  return [];
}

async function openVoiceOfUserDetail(resultsPage, card, agent) {
  const observedCardCount = await resultsPage.locator(".user-voice-card-wrapper").count().catch(() => 0);
  const selector = observedCardCount
    ? ".user-voice-card-wrapper"
    : "article, [class*='issue'], [class*='feedback'], [class*='card'], [class*='item']";
  const candidateCards = resultsPage.locator(selector);
  const textNeedle = canonicalPostText(card.identityText || card.text).slice(0, 72);
  if (textNeedle.length < 24) return { page: resultsPage, popup: null, opened: false, originalUrl: resultsPage.url(), diagnostics: { failurePhase: "card_identity_too_short", selector, textNeedleLength: textNeedle.length } };
  const findCardIndex = () => candidateCards.evaluateAll((nodes, args) => {
    const normalize = (value) => String(value || "").normalize("NFKC").toLocaleLowerCase().replace(/https?:\/\/\S+/g, "").replace(/[\s\p{P}\p{S}]+/gu, "");
    const matches = nodes.map((node, index) => {
      const rect = node.getBoundingClientRect();
      const text = normalize(node.innerText);
      return { node, index, width: rect.width, height: rect.height, textLength: text.length, text, visible: rect.width > 240 && rect.height > 100 && rect.bottom > 0 && rect.top < innerHeight };
    }).filter((item) => item.visible && item.textLength >= 24 && item.textLength <= 5000 && item.text.includes(args.textNeedle));
    const leaves = matches.filter((item) => !matches.some((other) => other.node !== item.node && item.node.contains(other.node)));
    return leaves.length === 1 ? leaves[0].index : -1;
  }, { textNeedle }).catch(() => -1);
  let cardIndex = -1;
  // JD may virtualize the results list. Walk it until the captured card is
  // mounted again instead of assuming the card still exists after collection.
  for (let attempt = 0; attempt < 12 && cardIndex < 0; attempt += 1) {
    cardIndex = await findCardIndex();
    if (cardIndex >= 0) break;
    const atBottom = await resultsPage.evaluate(() => window.scrollY + innerHeight >= document.documentElement.scrollHeight - 4).catch(() => true);
    if (atBottom) break;
    await resultsPage.mouse.wheel(0, Math.max(600, Math.round((await resultsPage.evaluate(() => innerHeight).catch(() => 800)) * 0.75)));
    await resultsPage.waitForTimeout(250);
  }
  if (cardIndex < 0) return { page: resultsPage, popup: null, opened: false, originalUrl: resultsPage.url(), diagnostics: { failurePhase: "matching_card_not_mounted", selector, candidateCount: await candidateCards.count().catch(() => 0), textNeedleLength: textNeedle.length, finalUrl: resultsPage.url().slice(0, 500) } };
  const cardLocator = candidateCards.nth(cardIndex);
  if (!await cardLocator.count().catch(() => 0)) return { page: resultsPage, popup: null, opened: false, originalUrl: resultsPage.url(), diagnostics: { failurePhase: "matching_card_disappeared", selector, cardIndex, finalUrl: resultsPage.url().slice(0, 500) } };
  const originalUrl = resultsPage.url();
  const originalFeedbackId = voiceFeedbackId(originalUrl);
  const pagesBeforeClick = new Set(resultsPage.context().pages());
  await cardLocator.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
  const popupPromise = resultsPage.waitForEvent("popup", { timeout: 2500 }).catch(() => null);
  // JD opens the detail modal from the result card itself. The unique
  // feedbackId is added to the address bar afterward, not reliably exposed
  // as a link inside the card.
  // JD's detail entry is the feedback title inside the matching card. Using
  // this stable control prevents clicks on a surrounding virtual-list item.
  const titleTarget = cardLocator.locator(".feedback-title").filter({ visible: true }).first();
  const hasTitleTarget = await titleTarget.isVisible().catch(() => false);
  const clickText = String(card.identityText || card.text).trim().slice(0, 48);
  const bodyTextTarget = clickText.length >= 12 ? cardLocator.getByText(clickText, { exact: false }).first() : null;
  const canClickBody = bodyTextTarget && await bodyTextTarget.isVisible().catch(() => false);
  const clickTarget = hasTitleTarget ? ".feedback-title" : canClickBody ? "matching_card_text" : "card_fallback";
  let clickError = "";
  let clickFallbackError = "";
  try {
    if (hasTitleTarget) await titleTarget.click({ timeout: 5000 });
    else if (canClickBody) await bodyTextTarget.click({ timeout: 5000 }).catch(async (error) => { clickFallbackError = String(error?.message || error).slice(0, 180); await cardLocator.click({ timeout: 5000 }); });
    else await cardLocator.click({ position: { x: 24, y: 28 }, timeout: 5000 });
  } catch (error) { clickError = String(error?.message || error).slice(0, 180); }
  let popup = await popupPromise;
  const deadline = Date.now() + 15000;
  const waitStartedAt = Date.now();
  let detailPage = popup || resultsPage;
  let actualFeedbackUrl = "";
  let actualFeedbackId = "";
  let actualIdSource = "";
  let latestDetailEvidence = { detailVisible: false, identityMatched: false, detailTextLength: 0, candidates: [] };
  let identityMatchedOnSameUrl = false;
  let observedPageUrls = [];
  while (Date.now() < deadline) {
    // Usually JD opens an in-page modal and pushes feedbackId into the current
    // URL. Keep newly-created tabs in scope too, in case this account/layout
    // opens the feedback detail in a tab after the popup event's short window.
    const newlyOpenedPages = resultsPage.context().pages().filter((candidate) => !pagesBeforeClick.has(candidate));
    const pages = [...new Set([resultsPage, ...(popup ? [popup] : []), ...newlyOpenedPages])];
    let matchingPage = null;
    for (const candidate of pages) {
      const candidateEvidence = await voiceFeedbackUrl(candidate, card.identityText || card.text);
      const sameResultsUrl = candidate === resultsPage && candidate.url() === originalUrl;
      const detailMatches = Boolean(candidateEvidence.feedbackId && candidateEvidence.detailVisible && candidateEvidence.identityMatched);
      latestDetailEvidence = candidateEvidence;
      if (candidateEvidence.feedbackId && candidateEvidence.url && detailMatches) {
        matchingPage = candidate;
        actualFeedbackUrl = candidateEvidence.url;
        actualFeedbackId = candidateEvidence.feedbackId;
        actualIdSource = candidateEvidence.idSource;
        identityMatchedOnSameUrl = sameResultsUrl && detailMatches;
        break;
      }
    }
    observedPageUrls = pages.slice(0, 6).map((candidate) => ({ url: candidate.url().slice(0, 500), feedbackId: voiceFeedbackId(candidate.url()) || "" }));
    if (matchingPage) {
      detailPage = matchingPage;
      if (matchingPage !== resultsPage) popup = matchingPage;
      break;
    }
    await resultsPage.waitForTimeout(200);
  }
  if (popup) await popup.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});
  const opened = Boolean(actualFeedbackId && actualFeedbackUrl);
  if (!opened && popup) await popup.close().catch(() => {});
  if (!opened && !popup) await resultsPage.keyboard.press("Escape").catch(() => {});
  return {
    page: detailPage, popup, opened, originalUrl, feedbackId: actualFeedbackId, feedbackUrl: actualFeedbackUrl,
    diagnostics: {
      clickTarget,
      clickError: clickError || undefined,
      clickFallbackError: clickFallbackError || undefined,
      originalUrl: originalUrl.slice(0, 500),
      originalFeedbackId: originalFeedbackId || undefined,
      observedFeedbackId: actualFeedbackId || undefined,
      feedbackIdSource: actualIdSource || undefined,
      detailVisible: latestDetailEvidence.detailVisible,
      detailIdentityMatched: Boolean(actualFeedbackId && (identityMatchedOnSameUrl || latestDetailEvidence.identityMatched)),
      detailTextLength: latestDetailEvidence.detailTextLength || 0,
      idCandidates: (latestDetailEvidence.candidates || []).map(({ id, source }) => ({ id: id ? `${id.slice(0, 4)}…` : "", source })),
      finalUrl: detailPage.url().slice(0, 500),
      feedbackUrl: actualFeedbackUrl.slice(0, 500) || undefined,
      identityMatchedOnSameUrl,
      newPageCount: resultsPage.context().pages().filter((candidate) => !pagesBeforeClick.has(candidate)).length,
      waitMs: Date.now() - waitStartedAt,
      observedPageUrls,
    },
  };
}

async function readVoiceFeedbackDetail(page, identityText) {
  const needle = canonicalPostText(identityText).slice(0, 72);
  if (needle.length < 24) return null;
  const observedDetailCount = await page.locator(".voice-details").count().catch(() => 0);
  const detailContainers = page.locator(observedDetailCount
    ? ".voice-details"
    : "[role='dialog'], [aria-modal='true'], [class*='modal'], [class*='detail'], [class*='drawer'], [class*='feedback'], article, body");
  const matches = await detailContainers.evaluateAll((nodes, text) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    const content = String(node.innerText || "").replace(/\s+/g, " ").trim();
    const normalized = content.normalize("NFKC").toLocaleLowerCase().replace(/https?:\/\/\S+/g, "").replace(/[\s\p{P}\p{S}]+/gu, "");
    const className = typeof node.className === "string" ? node.className : "";
    const isDetailSurface = node.matches("[role='dialog'], [aria-modal='true']") || /modal|detail|drawer/i.test(className);
    const anchors = [text.slice(0, 24), text.slice(24, 48)].filter((part) => part.length >= 12);
    const textMatch = anchors.some((part) => normalized.includes(part));
    return {
      rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      area: rect.width * rect.height,
      visible: rect.width > 260 && rect.height > 150 && rect.bottom > 0 && rect.top < innerHeight && content.length >= 80,
      textMatch,
      isDetailSurface,
      text: content,
    };
  }).filter((item) => item.visible && item.textMatch).sort((a, b) => Number(b.isDetailSurface) - Number(a.isDetailSurface) || a.area - b.area), needle).catch(() => []);
  const match = matches[0];
  if (!match) {
    // Some JD layouts render feedback in a route-backed panel without a
    // dialog/detail class. The unique feedbackId was already verified, so
    // retain the visible page as evidence instead of discarding the case.
    const text = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    if (text.trim().length < 80) return null;
    const screenshot = await page.screenshot({ type: "png" }).catch(() => null);
    return screenshot ? { text: text.slice(0, 12000), screenshot } : null;
  }
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight })).catch(() => ({ width: 0, height: 0 }));
  const left = Math.max(0, match.rect.x), top = Math.max(0, match.rect.y);
  const box = {
    x: left,
    y: top,
    width: Math.min(viewport.width - left, match.rect.width),
    height: Math.min(viewport.height - top, match.rect.height),
  };
  if (box.width <= 0 || box.height <= 0) return null;
  const screenshot = await page.screenshot({ type: "png", clip: box }).catch(() => null);
  return screenshot ? { text: match.text, screenshot } : null;
}

async function waitForVoiceFeedbackDetail(page, identityText, expectedFeedbackId, timeoutMs = 18000) {
  const deadline = Date.now() + timeoutMs;
  let previousText = "";
  let stableReads = 0;
  while (Date.now() < deadline) {
    const actualId = voiceFeedbackId(page.url());
    if (expectedFeedbackId && actualId && actualId !== expectedFeedbackId) return null;
    const detail = await readVoiceFeedbackDetail(page, identityText);
    if (detail?.text) {
      const currentText = canonicalPostText(detail.text);
      stableReads = currentText === previousText ? stableReads + 1 : 0;
      previousText = currentText;
      // Wait for asynchronous body rendering to finish before recording
      // evidence. The card identity must match and the detail text must settle.
      if (currentText.length >= 80 && stableReads >= 1) return detail;
    }
    await page.waitForTimeout(500).catch(() => {});
  }
  return null;
}

async function openWeiboPostDetail(context, resultsPage, card) {
  const href = String(card.sourceUrl || "").trim();
  if (!/^https?:\/\/(?:www\.)?weibo\.com\/(?:detail|status|comment)\//i.test(href)
    && !/^https?:\/\/(?:www\.)?weibo\.com\/\d{5,}\/[a-z\d]{5,}/i.test(href)) {
    return { page: resultsPage, post: null, opened: false, url: "" };
  }
  const detailPage = await context.newPage();
  try {
    await detailPage.goto(href, { waitUntil: "domcontentloaded", timeout: 20000 });
    const expected = canonicalPostText(card.identityText || card.text).slice(0, 48);
    const expectedAuthor = canonicalPostText(card.author || "");
    const deadline = Date.now() + 12000;
    let verified = false;
    while (Date.now() < deadline) {
      const state = await detailPage.evaluate(() => {
        const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
        const posts = [...document.querySelectorAll("div[action-type='feed_list_item'], div.card-wrap")];
        return { body: clean(document.body?.innerText), posts: posts.map((node) => ({
          text: clean(node.querySelector("[node-type='feed_list_content'], .txt, [class*='feed_list_content']")?.innerText || node.innerText),
          author: clean(node.querySelector("a[namecard], .name, [class*='name']")?.textContent || ""),
        })) };
      }).catch(() => ({ body: "", posts: [] }));
      const candidates = state.posts.filter((post) => canonicalPostText(post.text).includes(expected)
        && (!expectedAuthor || !post.author || canonicalPostText(post.author) === expectedAuthor));
      if (expected.length >= 40 && candidates.length === 1) {
        const locator = detailPage.locator("div[action-type='feed_list_item'], div.card-wrap").filter({ hasText: card.identityText.slice(0, 48) });
        if (await locator.count().catch(() => 0) === 1) {
          await detailPage.waitForTimeout(700);
          return { page: detailPage, post: locator, opened: true, url: detailPage.url() };
        }
      }
      if (expected.length >= 40 && canonicalPostText(state.body).includes(expected)
        && (!expectedAuthor || canonicalPostText(state.body).includes(expectedAuthor))) verified = true;
      if (verified) {
        await detailPage.waitForTimeout(700);
        return { page: detailPage, post: detailPage.locator("body"), postIsBody: true, opened: true, url: detailPage.url() };
      }
      await detailPage.waitForTimeout(400);
    }
  } catch {}
  await detailPage.close().catch(() => {});
  return { page: resultsPage, post: null, opened: false, url: "" };
}

async function closeVoiceOfUserDetail(resultsPage, detailPage, popup, originalUrl) {
  if (popup) {
    await popup.close().catch(() => {});
    return popup.isClosed();
  }
  const modal = resultsPage.locator(".base-modal-wrapper").filter({ visible: true }).first();
  const modalVisible = await modal.isVisible().catch(() => false);
  if (modalVisible) {
    // The observed JD detail uses this header as its close control. Only move
    // to the next card after the modal is actually gone.
    const closeHeader = modal.locator(".modal-header-wrapper").filter({ visible: true }).first();
    const closeButton = modal.getByRole("button", { name: "关闭", exact: true }).filter({ visible: true }).first();
    if (await closeButton.isVisible().catch(() => false)) await closeButton.click({ timeout: 5000 }).catch(() => {});
    else if (await closeHeader.isVisible().catch(() => false)) await closeHeader.click({ timeout: 5000 }).catch(() => {});
    const closed = await modal.waitFor({ state: "hidden", timeout: 6000 }).then(() => true, () => false);
    if (closed) return true;
    await resultsPage.keyboard.press("Escape").catch(() => {});
    if (await modal.waitFor({ state: "hidden", timeout: 3000 }).then(() => true, () => false)) return true;
  }
  if (detailPage.url() !== originalUrl) {
    await detailPage.goBack({ waitUntil: "domcontentloaded", timeout: 8000 }).catch(() => {});
  }
  await resultsPage.waitForTimeout(300);
  return !await modal.isVisible().catch(() => false);
}

async function collectCommunityPlatform(context, task, spec, queries, agent, activity) {
  let page = context.pages().find((item) => {
    try {
      const url = new URL(item.url());
      return spec.id === "voiceOfUser"
        ? url.hostname === "new-ux.jd.com" || (url.hostname === "ssa.jd.com" && /^\/sso\/login/i.test(url.pathname))
        : url.hostname === "weibo.com" || url.hostname.endsWith(".weibo.com");
    }
    catch { return false; }
  }) || await context.newPage();
  const seen = new Set();
  let saved = 0;
  let browsed = 0;
  let reviewed = 0;
  let openedDetails = 0;
  let eligible = 0;
  let currentQueryIndex = 0;
  let currentQuery = "";
  const skipped = {};
  activity.sourceProgress ||= {};
  const syncProgress = (phase = "reading") => {
    activity.sourceProgress[spec.id] = {
      ...activity.sourceProgress[spec.id], phase,
      queryIndex: Math.min(currentQueryIndex + 1, platformQueries.length), queryTotal: platformQueries.length,
      browsed, reviewed, opened: openedDetails, eligible, saved, skipped: { ...skipped },
    };
  };
  const skip = (reason, context = {}) => {
    skipped[reason] = Number(skipped[reason] || 0) + 1;
    appendCollectionLog(activity, spec.id, {
      type: "skipped",
      query: currentQuery,
      reason,
      title: String(context.title || "").slice(0, 160) || undefined,
      url: String(context.url || "").slice(0, 500) || undefined,
      detail: String(context.detail || "").slice(0, 240) || undefined,
      stage: context.stage || "candidate_validation",
      metadata: context.metadata && typeof context.metadata === "object" ? context.metadata : undefined,
    });
    syncProgress();
  };
  let holdForLogin = false;
  // All platforms must search only the keywords the user selected in setup.
  // Using the project name here caused Voice of User to search a different,
  // often unrelated phrase and then discard results against the selected terms.
  const platformQueries = queries;
  const queryCoverage = [];
  activity.sourceProgress[spec.id] = {
    ...activity.sourceProgress[spec.id],
      browsed: 0, reviewed: 0, opened: 0, eligible: 0, saved: 0, skipped: {}, queryCoverage,
  };
  try {
    await page.goto(spec.home, { waitUntil: "domcontentloaded", timeout: 25000 }).catch(() => {});
    if (await requiresPlatformLogin(page, spec, { waitForRedirect: true })) throw new LoginRequiredError(spec.name, page.url() || spec.home);
    for (currentQueryIndex = 0; currentQueryIndex < platformQueries.length; currentQueryIndex += 1) {
      const query = platformQueries[currentQueryIndex];
      currentQuery = query;
      activity.sourceProgress[spec.id] = { ...activity.sourceProgress[spec.id], phase: "searching", progress: Math.round((currentQueryIndex / platformQueries.length) * 100), queryIndex: currentQueryIndex + 1, queryTotal: platformQueries.length, browsed, reviewed, opened: openedDetails, eligible, saved, skipped: { ...skipped } };
      await updateTask(task.id, "running", activity);
      const result = await searchCommunityCards(page, spec, query, task.project);
      page = result.page;
      const cards = result.cards;
      const coverage = {
        query,
        sort: "平台默认排序",
        resultsBrowsed: cards.length,
        detailsAttempted: 0,
        detailsOpened: 0,
        saved: 0,
        scrollSteps: result.scrollSteps,
        stopReason: result.stopReason,
        diagnostics: result.diagnostics,
      };
      queryCoverage.push(coverage);
      appendCollectionLog(activity, spec.id, {
        type: "search",
        query,
        reason: cards.length ? "search_results_loaded" : result.diagnostics.selectorMatches ? "cards_not_accepted" : "no_result_cards_detected",
        stage: "search_results",
        detail: cards.length
          ? `识别到 ${cards.length} 条结果卡片。`
          : result.diagnostics.selectorMatches
            ? `页面匹配到 ${result.diagnostics.selectorMatches} 个候选节点，但没有节点通过可见性和文本长度筛选。`
            : "页面上没有匹配到当前平台的结果卡片选择器。",
        metadata: result.diagnostics,
      });
      activity.sourceProgress[spec.id].queryCoverage = [...queryCoverage];
      await updateTask(task.id, "running", activity);
      browsed += cards.length;
      syncProgress("reading");
      await updateTask(task.id, "running", activity);
      const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
      if (spec.loginPattern.test(bodyText)) throw new LoginRequiredError(spec.name, page.url() || spec.home);
      for (const card of cards) {
        const identityKey = `${card.title}:${card.text.slice(0, 120)}`;
        if (seen.has(identityKey)) { skip("duplicate_in_run", { title: card.title, url: card.sourceUrl || card.url, stage: "dedupe" }); continue; }
        if (spec.id !== "voiceOfUser" && spec.id !== "weibo" && !card.url) { skip("missing_post_url", { title: card.title, stage: "result_validation" }); continue; }
        seen.add(identityKey);
        coverage.detailsAttempted += 1;
        reviewed += 1;
        syncProgress("reading");
        const resultsPage = page;
        let detailPage = page;
        let voicePopup = null;
        let voiceOriginalUrl = page.url();
        let voiceOpened = false;
        let voiceFeedbackLink = "";
        let voiceOpenDiagnostics = null;
        let weiboDetailPopup = null;
        let weiboSourceUrl = "";
        try {
          if (spec.id === "voiceOfUser") {
            const opened = await openVoiceOfUserDetail(resultsPage, card, agent);
            detailPage = opened.page;
            voicePopup = opened.popup;
            voiceOriginalUrl = opened.originalUrl;
            voiceOpened = opened.opened;
            voiceFeedbackLink = opened.feedbackUrl || "";
            voiceOpenDiagnostics = opened.diagnostics || null;
            if (voiceOpened) {
              openedDetails += 1;
              coverage.detailsOpened += 1;
              appendCollectionLog(activity, spec.id, {
                type: "detail_identified",
                query: currentQuery,
                reason: "voice_detail_identified",
                title: card.title,
                url: voiceFeedbackLink,
                stage: "open_detail",
                detail: `已确认详情内容与结果卡片匹配；feedbackId 来源：${voiceOpenDiagnostics?.feedbackIdSource || "未知"}。`,
                metadata: voiceOpenDiagnostics,
              });
            }
            syncProgress("reading");
            if (!voiceOpened) {
              skip("detail_feedback_id_not_found", {
                title: card.title,
                url: voiceOpenDiagnostics?.finalUrl || voiceOriginalUrl,
                stage: "open_detail",
                detail: voiceOpenDiagnostics?.clickError
                  ? `点击详情时发生错误：${String(voiceOpenDiagnostics.clickError).slice(0, 120)}`
                  : voiceOpenDiagnostics?.detailVisible
                    ? "详情内容已出现并与结果卡片匹配，但未能从详情 URL、详情链接或详情元素属性中提取 feedbackId。"
                    : "点击后未检测到与结果卡片匹配的详情区域；请检查点击目标、页面变化和加载状态。",
                metadata: voiceOpenDiagnostics,
              });
              continue;
            }
          } else if (spec.id !== "weibo") {
            await page.goto(card.url, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
            await page.waitForTimeout(600);
          }
          let weiboCard = null;
          let weiboCardIsBody = false;
          if (spec.id === "weibo") {
            // Prefer the exact post URL observed on the result card (normally
            // its timestamp link). Verify author and body on the opened page;
            // if the platform blocks that route, fall back to the uniquely
            // matched result card and label its URL honestly.
            const openedWeibo = await openWeiboPostDetail(resultsPage.context(), resultsPage, card);
            if (openedWeibo.opened) {
              detailPage = openedWeibo.page;
              weiboDetailPopup = openedWeibo.page !== resultsPage ? openedWeibo.page : null;
              weiboSourceUrl = openedWeibo.url;
              weiboCard = openedWeibo.post;
              weiboCardIsBody = Boolean(openedWeibo.postIsBody);
              openedDetails += 1;
              coverage.detailsOpened += 1;
              syncProgress("reading");
            }
          }
          if (spec.id === "weibo" && !weiboCard) {
            const primaryPostCount = await detailPage.locator("div[action-type='feed_list_item']").count().catch(() => 0);
            const weiboCards = detailPage.locator(primaryPostCount ? "div[action-type='feed_list_item']" : "div.card-wrap");
            const expectedBody = String(card.identityText || "").replace(/\s+/g, " ").trim();
            const matchingIndexes = await weiboCards.evaluateAll((nodes, args) => {
              const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
              const normalizeName = (value) => clean(value).normalize("NFKC").toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
              const normalizeText = (value) => clean(value).normalize("NFKC").toLocaleLowerCase().replace(/https?:\/\/\S+/g, "").replace(/\b(?:转发|评论|赞|浏览)\s*\d*/g, "").replace(/[\s\p{P}\p{S}]+/gu, "");
              const target = normalizeText(args.identity);
              // Short Weibo posts are common. Use 16 normalized characters as
              // the minimum body signal, but require an exact author match for
              // short-text matches unless a stable post ID matches.
              if (target.length < 16) return [];
              const targetPrefix = target.slice(0, Math.min(48, target.length));
              const candidateStatusId = (() => {
                try {
                  const url = new URL(args.url);
                  const path = url.pathname.split("/").filter(Boolean);
                  return path.length >= 2 && /^\d{5,}$/.test(path[path.length - 2])
                    ? path[path.length - 1]
                    : path.length >= 2 && /^(?:status|detail)$/i.test(path[path.length - 2])
                      ? path[path.length - 1]
                      : "";
                } catch { return ""; }
              })();
              return nodes.map((node, index) => {
                const body = clean(node.querySelector("[node-type='feed_list_content'], .txt, [class*='feed_list_content']")?.innerText || "");
                const normalizedBody = normalizeText(body);
                const author = clean(node.querySelector("a[namecard], .name, [class*='name']")?.textContent || "");
                const expectedAuthor = normalizeName(args.author);
                const liveAuthor = normalizeName(author);
                const authorMatches = Boolean(expectedAuthor && liveAuthor && expectedAuthor === liveAuthor);
                const authorConflicts = Boolean(expectedAuthor && liveAuthor && expectedAuthor !== liveAuthor);
                const liveStatusIds = [...node.querySelectorAll("a[href]")].map((anchor) => {
                  try {
                    const path = new URL(anchor.href).pathname.split("/").filter(Boolean);
                    if (path.length >= 2 && /^\d{5,}$/.test(path[path.length - 2])) return path[path.length - 1];
                    if (path.length >= 2 && /^(?:status|detail)$/i.test(path[path.length - 2])) return path[path.length - 1];
                  } catch {}
                  return "";
                }).filter(Boolean);
                const statusIdMatches = Boolean(candidateStatusId && liveStatusIds.includes(candidateStatusId));
                const bodyMatches = normalizedBody.includes(targetPrefix);
                const shortBody = target.length < 48;
                const accepted = !authorConflicts && (statusIdMatches || (bodyMatches && (!shortBody || authorMatches)));
                return { index, accepted, bodyMatches, authorMatches, statusIdMatches, bodyLength: normalizedBody.length };
              }).filter((item) => item.accepted).map((item) => item.index);
            }, { identity: expectedBody, author: String(card.author || "").trim(), url: card.sourceUrl || "" }).catch(() => []);
            // Result indices captured while scrolling become stale. Match the
            // actual post body (and author when available) in the live DOM and
            // require a unique match before pairing its text with a screenshot.
            if (matchingIndexes.length !== 1) { skip(matchingIndexes.length ? "weibo_ambiguous_post_match" : "weibo_post_text_not_found", { title: card.title, url: card.sourceUrl, stage: "match_post_detail", detail: `正文、作者或帖子 ID 匹配数：${matchingIndexes.length}。`, metadata: { candidateUrl: card.sourceUrl || "", author: card.author || "", candidateTextLength: (card.identityText || "").length, minimumNormalizedBodyLength: 16 } }); continue; }
            openedDetails += 1;
            coverage.detailsOpened += 1;
            syncProgress("reading");
            const matchedIndex = matchingIndexes[0];
            weiboCard = weiboCards.nth(matchedIndex);
            await weiboCard.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
          }
          const expectedFeedbackId = spec.id === "voiceOfUser" ? voiceFeedbackId(detailPage.url()) : "";
          if (spec.id === "voiceOfUser" && !expectedFeedbackId && !voiceFeedbackId(voiceFeedbackLink)) { skip("feedback_id_missing_after_card_click", { title: card.title, url: detailPage.url(), stage: "validate_detail_identity", metadata: voiceOpenDiagnostics }); continue; }
          const voiceDetail = spec.id === "voiceOfUser"
            ? await waitForVoiceFeedbackDetail(detailPage, card.identityText || card.text, expectedFeedbackId || voiceFeedbackId(voiceFeedbackLink))
            : null;
          if (spec.id === "voiceOfUser" && !voiceDetail) { skip("voice_detail_content_not_matched", { title: card.title, url: voiceFeedbackLink || detailPage.url(), stage: "validate_detail_content", metadata: voiceOpenDiagnostics }); continue; }
          let detail = spec.id === "weibo"
            ? await weiboCard.innerText({ timeout: 5000 }).catch(() => card.text)
            : spec.id === "voiceOfUser" ? voiceDetail.text : await detailPage.locator("body").innerText({ timeout: 5000 }).catch(() => "");
          if (!detail.trim() || spec.loginPattern.test(detail) || detail.length < 80) { skip("detail_text_empty_or_login", { title: card.title, url: detailPage.url(), stage: "validate_detail_content", detail: `详情文本长度 ${detail.trim().length}。`, metadata: { textLength: detail.trim().length, loginPatternMatched: spec.loginPattern.test(detail) } }); continue; }
          let rawComments = [];
          if (spec.id === "weibo") {
            // A Weibo post's detail is already the expanded feed card; there is
            // no second detail page. Open the comment thread from its action row.
            if (!weiboCardIsBody) {
              await expandWeiboComments(detailPage, weiboCard);
              detail = await weiboCard.innerText({ timeout: 5000 }).catch(() => detail);
              rawComments = await readWeiboComments(detailPage, weiboCard);
            }
          }
          // The platform result list is already filtered by the selected query.
          // Requiring the entire phrase again in the post body drops relevant
          // posts whose wording differs from their search phrase.
          const date = normalizedPostDate(detail);
          if (!isWithinFeedbackDateRange(detail, task.project)) { skip("post_date_missing_or_out_of_range", { title: card.title, url: spec.id === "voiceOfUser" ? voiceFeedbackLink : card.sourceUrl, stage: "date_filter", detail: `解析日期：${date || "未识别"}；范围：${task.project?.feedbackStartDate || "默认起始日期"} 至 ${task.project?.feedbackEndDate || "今天"}。` }); continue; }
          const screenshot = spec.id === "weibo"
            ? await weiboCard.screenshot({ type: "png" }).catch(() => null)
            : spec.id === "voiceOfUser" ? voiceDetail.screenshot : await detailPage.screenshot({ type: "png" }).catch(() => null);
          if (!screenshot) { skip("screenshot_failed", { title: card.title, stage: "capture_screenshot" }); continue; }
          if (spec.id === "voiceOfUser") {
            rawComments = await detailPage.locator("[class*='voice'], [class*='reply'], [class*='feedback'], [class*='comment']").allTextContents().then((items) => items.map((item) => item.replace(/\s+/g, " ").trim()).filter((item) => item.length >= 8 && item.length <= 500).slice(0, 8)).catch(() => []);
          } else if (spec.id !== "weibo") {
            rawComments = await detailPage.locator("[class*='comment'], [class*='reply'], [class*='feedback']").allTextContents().then((items) => items.map((item) => item.replace(/\s+/g, " ").trim()).filter((item) => item.length >= 12 && item.length <= 320).slice(0, 8)).catch(() => []);
          }
          const distilled = await agent.summarizeCandidate({ title: spec.id === "weibo" ? "无独立标题（以微博正文为准）" : card.title, text: detail, comments: rawComments, query, projectContext: `项目目标：${projectWords(task.project).join("、")}` }).catch(() => null);
          const candidateUrl = spec.id === "voiceOfUser" && voiceFeedbackId(voiceFeedbackLink) && !voiceFeedbackId(detailPage.url())
            ? voiceFeedbackLink : detailPage.url();
          const voiceDetailUrl = spec.id === "voiceOfUser"
            ? voiceFeedbackId(candidateUrl) ? canonicalVoiceDetailUrl(candidateUrl) : ""
            : "";
          if (spec.id === "voiceOfUser" && (!voiceDetailUrl || !voiceFeedbackId(candidateUrl))) { skip("voice_permalink_missing", { title: card.title, stage: "validate_source_link" }); continue; }
          // Keep only the post's own visible text as its identity. The detail
          // page body can contain surrounding results/navigation, and AI
          // summaries are intentionally not stable enough for deduplication.
          const identityText = String(card.identityText || card.text || "").trim();
          const screenshotHash = createHash("sha256").update(screenshot).digest("hex");
          const dedupeKey = spec.id === "voiceOfUser" && voiceDetailUrl
            ? `url:${voiceDetailUrl}`
            : `content:${spec.id}:${createHash("sha256").update(canonicalPostText(`${card.author || ""} ${identityText}`)).digest("hex")}`;
          // Keep the real detail URL (including JD's case-sensitive
          // `feedbackId` parameter) for the visible source link. Use the
          // stripped canonical URL only as the dedupe identity.
          const sourceUrl = spec.id === "voiceOfUser"
            ? candidateUrl
            : spec.id === "weibo" ? (weiboSourceUrl || card.sourceUrl || candidateUrl || card.url)
              : card.sourceUrl || candidateUrl || card.url;
          const savedResponse = await api(`/api/research/tasks/${task.id}/candidates`, { method: "POST", body: JSON.stringify({ candidates: [{
            id: `candidate-${spec.id}-${createHash("sha1").update(dedupeKey || identityKey).digest("hex").slice(0, 12)}`,
            source: spec.source, title: spec.id === "weibo" ? "" : String(distilled?.insightTitle || card.title).slice(0, 120), url: sourceUrl, author: card.author || spec.name, publishedAt: date || null,
            capturedAt: new Date().toISOString(), excerpt: String(spec.id === "weibo" ? identityText.slice(0, 500) : distilled?.summary || detail.replace(/\s+/g, " ").slice(0, 500)), screenshotBase64: screenshot.toString("base64"),
            mediaType: "community_post", keywords: [query, spec.name], valuableComments: Array.isArray(distilled?.comments) ? distilled.comments.slice(0, 8) : rawComments, relevance: relevance(detail, task.project, query),
            identityText, dedupeKey, screenshotHash,
          }] }) });
          const saveResult = await savedResponse.json().catch(() => ({}));
          const actuallySaved = Number(saveResult.saved || 0);
          eligible += 1;
          coverage.saved += actuallySaved;
          if (!actuallySaved) skip(savedResponse.ok ? "duplicate_in_database" : "save_request_rejected", { title: card.title, url: sourceUrl, stage: "save_candidate", detail: savedResponse.ok ? "保存接口判定为重复记录。" : `保存接口返回 HTTP ${savedResponse.status}。` });
          else appendCollectionLog(activity, spec.id, { type: "saved", query, reason: "candidate_saved", title: card.title, url: sourceUrl, stage: "save_candidate" });
          saved += actuallySaved;
          syncProgress("reading");
          activity.detailCount = Number(activity.detailCount || 0) + actuallySaved;
          await updateTask(task.id, "running", activity);
        } finally {
          if (weiboDetailPopup) await weiboDetailPopup.close().catch(() => {});
          if (spec.id === "voiceOfUser" && voiceOpened) {
            const closed = await closeVoiceOfUserDetail(resultsPage, detailPage, voicePopup, voiceOriginalUrl);
            if (!closed) throw new Error("用户之声详情未能关闭，已停止该平台采集以避免在遮挡的结果列表上继续操作。");
          }
          syncProgress("reading");
          await updateTask(task.id, "running", activity);
        }
      }
    }
    activity.sourceProgress[spec.id] = { ...activity.sourceProgress[spec.id], phase: "completed", progress: 100, browsed, reviewed, opened: openedDetails, eligible, saved, skipped: { ...skipped } };
    if (saved === 0) activity.message = `${spec.name}本轮没有保存案例：${Object.entries(skipped).map(([reason, count]) => `${reason} ${count}`).join("；") || "没有找到可采集的帖子"}`;
    await updateTask(task.id, "running", activity);
    return saved;
  } catch (error) {
    appendCollectionLog(activity, spec.id, { type: "error", query: currentQuery || undefined, reason: String(error?.message || error), stage: "platform_collection" });
    if (error instanceof LoginRequiredError) holdForLogin = true;
    throw error;
  } finally {
    if (holdForLogin) await page.bringToFront().catch(() => {});
    // Keep the platform tabs available for the user and for the next research stage.
  }
}

async function collectVisibleCards(page) {
  return page.locator("a[href]").evaluateAll((anchors) => {
    const pattern = /xiaohongshu\.com\/(?:explore|discovery\/item|search_result)\/[0-9a-z]+/i;
    const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const looksLikeDate = (value) => /(?:20\d{2}\s*[-./年]\s*\d{1,2}|^\s*\d{1,2}\s*[-./月]\s*\d{1,2}\s*日?(?:\s+\d{1,2}:\d{2})?\s*$|今天|今日|昨天|昨日|前天|前日|刚刚|刚才|\d+\s*(?:秒|分钟|分|小时|天|日|周|个月|个?年)前|^\s*\d{1,2}:\d{2}\s*$)/.test(String(value || "").normalize("NFKC").trim());
    const found = new Map();
    for (const anchor of anchors) {
      if (!pattern.test(anchor.href)) continue;
      const card = anchor.closest("[class*='note-item'], [class*='feed-card'], section, article") || anchor;
      const rect = card.getBoundingClientRect();
      if (rect.width < 120 || rect.height < 100) continue;
      if (rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) continue;
      const text = clean(card.innerText || anchor.innerText || card.querySelector("img")?.alt);
      if (!text) continue;
      const dateCandidates = [];
      const dateNodes = [...card.querySelectorAll("time, [class*='time'], [class*='date'], [aria-label], [title]")];
      for (const node of dateNodes) {
        const label = `${node.className || ""} ${node.getAttribute("aria-label") || ""}`.toLowerCase();
        const values = [node.getAttribute("datetime"), node.getAttribute("title"), node.getAttribute("aria-label"), node.innerText];
        for (const candidate of values) {
          const value = clean(candidate);
          if (!value || value.length > 48 || !looksLikeDate(value)) continue;
          const semantic = /time|date|publish|发布|时间/.test(label) || node.tagName.toLowerCase() === "time";
          dateCandidates.push({ value, source: semantic ? "result_card_time_element" : "result_card_date_attribute", score: semantic ? 2 : 1 });
        }
      }
      if (!dateCandidates.length) {
        const lines = String(card.innerText || "").split(/\n+/).map(clean).filter(Boolean);
        // Titles and post copy can mention dates. Prefer short standalone lines
        // (the author/date rows in Xiaohongshu result cards) over arbitrary text.
        for (const line of lines.slice(1)) {
          if (line.length <= 24 && looksLikeDate(line)) dateCandidates.push({ value: line, source: "result_card_standalone_line", score: 1 });
        }
      }
      dateCandidates.sort((a, b) => b.score - a.score || a.value.length - b.value.length);
      const dateEvidence = dateCandidates[0] || { value: "", source: "not_found" };
      const id = anchor.href.match(/\/(?:explore|discovery\/item|search_result)\/([0-9a-z]+)/i)?.[1];
      if (!id || found.has(id)) continue;
      found.set(id, {
        id,
        url: anchor.href,
        title: clean(anchor.querySelector("img")?.alt || text.split("\n")[0] || text).slice(0, 160),
        cardText: text.slice(0, 1000),
        publishedAtText: dateEvidence.value,
        publishedAtSource: dateEvidence.source,
      });
    }
    return [...found.values()];
  });
}

async function searchCandidates(page, query, agent, onVisibleCards = null) {
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
  await pageGuard(page);
  const url = page.url();
  const rightPanelEvidence = await collectDynamicRightPanel(page).catch(() => ({ recommendations: [], text: "", screenshots: [] }));

  const collected = new Map();
  const scrollDiagnostics = [];
  let resultCardSightings = 0;
  let scrollSteps = 0;
  let noNewResultRounds = 0;
  let stopReason = "达到页面滚动安全上限";
  const maxScrollSteps = 8;
  for (let scroll = 0; scroll <= maxScrollSteps; scroll += 1) {
    const previousCount = collected.size;
    const visibleCards = await collectVisibleCards(page);
    resultCardSightings += visibleCards.length;
    for (const card of visibleCards) collected.set(card.id, card);
    const stop = onVisibleCards ? await onVisibleCards(visibleCards, url) : false;
    if (stop) { stopReason = "达到候选处理停止条件"; break; }
    noNewResultRounds = collected.size === previousCount ? noNewResultRounds + 1 : 0;
    scrollDiagnostics.push({ step: scroll, visibleCards: visibleCards.length, newUniqueCards: collected.size - previousCount, uniqueCards: collected.size, noNewResultRounds });
    if (!collected.size && scroll >= 2) {
      const pageText = await page.locator("body").innerText({ timeout: 1500 }).catch(() => "");
      if (/暂无结果|没有找到|未找到相关/.test(pageText)) {
        stopReason = "平台显示没有搜索结果";
        break;
      }
    }
    if (noNewResultRounds >= 3) {
      stopReason = "连续3轮滚动未发现新结果";
      break;
    }
    if (scroll === maxScrollSteps) break;
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(650);
    await pageGuard(page);
    scrollSteps += 1;
  }
  return { url, cards: [...collected.values()], scrollSteps, stopReason, resultCardSightings, scrollDiagnostics, ...rightPanelEvidence };
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

async function openCandidate(page, card, project, query, agent) {
  if (!page.url().includes("/search_result")) {
    throw new Error("当前页面已经离开搜索结果页");
  }
  const target = page.locator(`a[href*="${card.id}"]`).filter({ visible: true }).first();
  if (!await target.count().catch(() => 0)) throw new Error("候选卡片已离开当前结果区域，跳过；不会通过帖子链接打开。");
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
  }, null, { timeout: 5000 }).then(() => true).catch(() => false);
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
  // Prefer the timestamp visible on the search result card. Detail text often
  // contains unrelated dates from comments, screenshots, or the post body.
  let dateEvidence = postDateEvidence(card.publishedAtText, card.publishedAtSource || "search_result_card");
  if (!dateEvidence.parsed) {
    const detailDate = await root.locator("time, [class*='publish-time'], [class*='publishTime'], [class*='date'], [class*='time']")
      .evaluateAll((nodes) => nodes.map((node) => ({
        text: String(node.getAttribute("datetime") || node.getAttribute("title") || node.getAttribute("aria-label") || node.innerText || "").replace(/\s+/g, " ").trim(),
        source: `detail_${String(node.className || node.tagName || "time").slice(0, 60)}`,
      })).filter((item) => item.text && item.text.length <= 48).slice(0, 12))
      .catch(() => []);
    dateEvidence = detailDate.map((item) => postDateEvidence(item.text, item.source)).find((item) => item.parsed)
      || postDateEvidence("", "detail_timestamp_not_found");
  }
  const date = dateEvidence.parsed;

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
    publishedAtText: dateEvidence.raw || null,
    publishedAtSource: dateEvidence.source,
    feedbackGateText: text,
    feedbackGateComments: rawComments,
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
    relevance: matchesResearchTerms(project, query, title, text, card.cardText, extractHashtags(title, text, card.cardText)) ? 99 : relevance(`${title} ${text} ${card.cardText}`, project, query),
    matchText: text,
    matchTags: extractHashtags(title, text, card.cardText),
  };
}

function buildVisualQueries(selection, directions) {
  const forbidden = /\b(?:game|gaming|gamified|campaign|interactive|engagement|retention)\b|游戏|养成|收集|抽奖|答题|任务|闯关|合成|互动/gi;
  const selected = Array.isArray(selection?.trends) ? selection.trends : [];
  if (!Array.isArray(directions) || !directions.length || selected.length !== directions.length) {
    throw new Error("AI 未能为每个已确认视觉方向生成搜索词，请重新生成搜索词后再采集");
  }
  const normalized = selected.map((trend, index) => ({
    key: `official-${index + 1}`,
    label: String(directions[index]?.label || "").trim(),
    queries: [...new Set((Array.isArray(trend.searchTerms) ? trend.searchTerms : [])
      .map((term) => String(term).replace(forbidden, " ").replace(/[^a-z0-9\s-]/gi, " ").replace(/\s+/g, " ").trim())
      .filter((term) => term.split(/\s+/).length >= 2 && term.split(/\s+/).length <= 4)
    )].slice(0, 5),
    reports: Array.isArray(directions?.[index]?.sourceNames) ? directions[index].sourceNames.filter(Boolean) : [],
    rationale: String(directions?.[index]?.rationale || "").trim().slice(0, 160),
  }));
  const invalid = normalized.find((trend) => !trend.label || trend.queries.length !== 5);
  if (invalid) throw new Error(`视觉方向“${invalid.label || "未命名"}”没有得到5组有效且不重复的英文搜索词，请重新生成搜索词后再采集`);
  return normalized;
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
  const scrollLimit = platform === "pinterest" ? 15 : 10;
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
    if (found.size >= visualCardsPerSearch) break;
    await page.keyboard.press("Escape").catch(() => {});
    await page.mouse.wheel(0, platform === "pinterest" ? 1150 : 850);
    await page.waitForTimeout(platform === "pinterest" ? 900 : 650);
  }
  return [...found.values()].slice(0, visualCardsPerSearch);
}

async function waitForVisualDetail(page, platform) {
  const settleMs = platform === "pinterest" ? 5000 : 4000;
  const contentTimeoutMs = platform === "pinterest" ? 15000 : 12000;
  await page.waitForTimeout(settleMs);
  return page.waitForFunction((site) => {
    const text = document.body?.innerText?.trim() || "";
    const heading = document.querySelector("h1")?.textContent?.trim() || "";
    const hasLoadedLargeImage = [...document.images].some((image) => {
      const rect = image.getBoundingClientRect();
      return image.complete && image.naturalWidth >= 240 && rect.width >= 240 && rect.height >= 180;
    });
    if (site === "pinterest") return text.length >= 80 && (heading.length > 0 || hasLoadedLargeImage);
    return text.length >= 80 && heading.length > 0 && hasLoadedLargeImage;
  }, platform, { timeout: contentTimeoutMs }).then(() => true).catch(() => false);
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
    for (let queryIndex = 0; queryIndex < queries.length; queryIndex += 1) {
      const candidateTrend = queries[queryIndex];
      const baseTerms = candidateTrend.queries || [candidateTrend.query];
      const searchTerms = baseTerms;
      let trendReviewed = 0;
      for (const query of searchTerms) {
      const url = visualPlatformSpecs[platform].search(query);
      activity.sourceProgress[platform] = {
        phase: "searching", progress: Math.round((queryIndex / queries.length) * 100),
        queryIndex: queryIndex + 1, queryTotal: queries.length, browsed, reviewed, saved: 0, eligible: evaluated.length,
      };
      Object.assign(activity, {
        phase: "visual_searching",
        currentQuery: query,
        message: "Behance 与 Pinterest 正在同步研究",
      });
      await updateTask(task.id, "running", activity);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForTimeout(platform === "pinterest" ? 3500 : 2500);
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
        try {
          await page.goto(card.url, { waitUntil: "domcontentloaded", timeout: 20000 });
        } catch (error) {
          const reason = /timeout/i.test(String(error?.message || error))
            ? "visual_detail_navigation_timeout"
            : "visual_detail_navigation_failed";
          console.warn(`${platform}单条视觉详情页打开失败，跳过并继续：${card.url}；${error.message}`);
          appendCollectionLog(activity, platform, {
            type: "skipped", query, reason, title: card.title, url: card.url,
            stage: "detail_navigation", detail: String(error?.message || error).slice(0, 500),
          });
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
          await page.waitForTimeout(platform === "pinterest" ? 900 : 600);
          await updateTask(task.id, "running", activity).catch(() => {});
          continue;
        }
        const detailPath = new URL(page.url()).pathname;
        const validDetail = detailPath.includes(visualPlatformSpecs[platform].detailPath);
        if (!validDetail) {
          appendCollectionLog(activity, platform, {
            type: "skipped", query, reason: "visual_detail_url_not_confirmed",
            title: card.title, url: card.url, stage: "detail_navigation", landedUrl: page.url(),
          });
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
          continue;
        }
        let detailReady = await waitForVisualDetail(page, platform);
        if (!detailReady) {
          console.warn(`${platform}详情内容等待超时，刷新后重试：${card.url}`);
          await page.reload({ waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
          detailReady = await waitForVisualDetail(page, platform);
        }
        if (!detailReady) {
          console.warn(`${platform}详情页未加载出可用内容，跳过：${card.url}`);
          appendCollectionLog(activity, platform, {
            type: "skipped", query, reason: "visual_detail_content_unavailable",
            title: card.title, url: card.url, stage: "detail_content", detail: "等待并刷新后仍未识别到可用详情内容。",
          });
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
          await page.waitForTimeout(1000);
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
        activity.sourceProgress[platform].phase = "analyzing";
        Object.assign(activity, { phase: "visual_analysis", message: "正在识别视觉特征并筛选高相关参考图" });
        await updateTask(task.id, "running", activity);
        const analysis = await agent.analyzeVisualSample({
          screenshot, platform, title: detailTitle || card.title, query,
          directionLabel: candidateTrend.label,
          directionDescription: candidateTrend.rationale,
        })
          .catch((error) => {
            console.warn(`${platform}视觉样本分析失败：${error.message}`);
            return null;
          });
        if (analysis?.useful) {
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
            visualFeatures: Array.isArray(analysis.visualFeatures) ? analysis.visualFeatures : [],
            engagement,
            authorityTags: mapped?.reports || [],
            gameFit: 0,
            visualQuality: 0,
            analysisReason: analysis.reason,
            selectionReason: mapped?.rationale || "该方向来自本次官方视觉趋势候选，需结合项目目标继续验证。",
            relevanceScore: Math.max(0, Math.min(100, Number(analysis.relevanceScore || 0))),
            screenshotBase64: screenshot.toString("base64"),
          });
          activity.agentSummaryCalls = agent.summaryCalls;
          activity.sourceProgress[platform].eligible = evaluated.length;
        }
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(platform === "pinterest" ? 1200 : 900);
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
  } catch (error) {
    const message = String(error?.message || error);
    console.warn(`${platform}视觉研究异常结束，保留已评估通过的 ${evaluated.length} 条：${message}`);
    appendCollectionLog(activity, platform, {
      type: "error", reason: "visual_platform_collection_interrupted",
      stage: "platform_collection", detail: message.slice(0, 1000), preservedEligible: evaluated.length,
    });
    activity.sourceProgress[platform] = {
      ...activity.sourceProgress[platform],
      phase: evaluated.length ? "partial" : "failed", error: message,
      browsed, reviewed, eligible: evaluated.length, saved: 0,
    };
    await updateTask(task.id, "running", activity).catch((saveError) => {
      console.warn(`${platform}部分采集状态写入失败：${saveError.message}`);
    });
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

function selectBestVisualSamples(samples, queries) {
  return queries.flatMap((trend) => {
    const ranked = samples.filter((sample) => sample.trendKey === trend.key)
      .sort((a, b) => (b.relevanceScore - a.relevanceScore) || (b.engagement - a.engagement));
    const selected = [];
    for (const sample of ranked) {
      if (selected.length >= visualSamplesPerTrend) break;
      if (selected.some((chosen) => chosen.projectUrl === sample.projectUrl || visuallySimilar(chosen, sample))) continue;
      selected.push(sample);
    }
    return selected.slice(0, visualSamplesPerTrend);
  });
}

async function collectXiaohongshuVisual(page, task, agent, activity) {
  const seen = new Set();
  const imageHashes = new Set();
  const samples = [];
  let competitors = task.activity?.visualCompetitorsConfirmed && Array.isArray(task.activity?.visualCompetitors)
    ? task.activity.visualCompetitors.filter((item) => item?.name?.trim()).map((item) => ({ ...item, name: item.name.trim() }))
    : [];
  if (!task.activity?.visualCompetitorsConfirmed) {
    const discoveryEvidence = [];
    const discoveryQueries = buildCompetitorDiscoveryQueries(task.project);
    Object.assign(activity, { phase: "xhs_competitor_discovery", message: "正在读取搜索结果并提取竞品候选" });
    for (let index = 0; index < discoveryQueries.length; index += 1) {
      const query = discoveryQueries[index];
      activity.currentQuery = query;
      activity.sourceProgress.xiaohongshuVisual = {
        phase: "discovering_competitors", progress: Math.round((index / Math.max(1, discoveryQueries.length + 1)) * 25),
        queryIndex: index + 1, queryTotal: discoveryQueries.length, browsed: seen.size, saved: samples.length,
      };
      await updateTask(task.id, "running", activity);
      const result = await searchCandidates(page, query, agent);
      discoveryEvidence.push({
        query, resultUrl: result.url, rightPanelRecommendations: result.recommendations,
        rightPanelText: result.text, rightPanelScreenshots: result.screenshots || [],
      });
    }
    const panelText = discoveryEvidence.map((item) => item.rightPanelText || "").filter(Boolean).join("\n\n").slice(0, 24000);
    const panelScreenshots = discoveryEvidence.flatMap((item) => item.rightPanelScreenshots || []).slice(0, 5)
      .map((encoded) => Buffer.from(encoded, "base64"));
    let visionCandidates = [];
    if (panelScreenshots.length && agent?.enabled && agent.remainingCalls > 0) {
      try {
        const recommendationEvidence = discoveryEvidence.flatMap((item) => item.rightPanelRecommendations || [])
          .filter((item) => item.fromRecommendationCard && item.name)
          .map((item) => `${item.name}${item.context ? `：${item.context}` : ""}`)
          .join("\n").slice(0, 4000);
        const result = await agent.extractVisualCompetitors({
          screenshots: panelScreenshots,
          panelText: recommendationEvidence,
          query: discoveryQueries.join(" / "),
          projectContext: task.project?.answers?.game?.[0] || task.project?.customValues?.game || "",
        });
        visionCandidates = Array.isArray(result?.competitors) ? result.competitors
          .map((item) => ({ name: String(item.name || "").trim(), reason: item.evidence || "截图文字识别" }))
          .filter((item) => item.name) : [];
      } catch (error) {
        console.warn(`竞品推荐面板截图识别失败，保留DOM与用户确认：${error.message}`);
      }
    }
    const extractedCompetitors = [
      // Only accept DOM candidates tied to a recommendation card (the parser
      // anchors these rows to their recommendation badge), never arbitrary
      // blue links or colon-delimited prose from the full AI panel.
      ...discoveryEvidence.flatMap((item) => item.rightPanelRecommendations || [])
        .filter((item) => item.name && item.fromRecommendationCard)
        .map((item) => ({ name: item.name, reason: item.context || "来自右侧推荐卡片标题", source: "推荐卡片" })),
      ...visionCandidates.map((item) => ({ ...item, source: "截图识别" })),
    ];
    const nonCompetitorLabels = /^(核心竞品盘点|划定对标范围|竞品盘点|推荐理由|分析重点|三层拆解法|游戏类|工具类|核心玩法|表层|中层|深层|点点(?:\s*ai)?|问点点|查看详情|更多|展开|收起)$/i;
    competitors = extractedCompetitors
      .map((item) => ({ ...item, name: String(item.name || "").replace(/[º°⁰¹²³⁴⁵⁶⁷⁸⁹]+$/g, "").trim() }))
      .filter((item, index, all) => item.name.length >= 2 && item.name.length <= 32 && !nonCompetitorLabels.test(item.name)
        && all.findIndex((other) => other.name.toLowerCase() === item.name.toLowerCase()) === index)
      .slice(0, 12);
    let panelScreenshotCount = 0;
    if (panelScreenshots.length) {
      try {
        const response = await api(`/api/research/tasks/${task.id}/competitor-panel`, {
          method: "POST",
          body: JSON.stringify({ screenshotsBase64: panelScreenshots.map((screenshot) => screenshot.toString("base64")) }),
        });
        panelScreenshotCount = Number((await response.json()).count || 0);
      } catch (error) {
        console.warn(`保存竞品推荐面板截图失败，继续使用文字证据：${error.message}`);
      }
    }
    activity.visualCompetitors = competitors;
    activity.visualCompetitorPanelText = panelText;
    activity.visualCompetitorPanelScreenshotCount = panelScreenshotCount;
    activity.visualCompetitorScreenshotCount = panelScreenshots.length;
    activity.visualCompetitorExtractionNeedsReview = competitors.length === 0;
    activity.visualCompetitorsConfirmed = false;
    activity.competitorDiscoveryQuery = discoveryQueries[0];
    activity.sourceProgress.xiaohongshuVisual = { ...activity.sourceProgress.xiaohongshuVisual, phase: "awaiting_competitor_confirmation", progress: 25, queryIndex: 0, queryTotal: competitors.length };
    Object.assign(activity, {
      phase: "awaiting_competitor_confirmation",
      message: competitors.length ? "请确认要逐个搜索的竞品名称" : "未能可靠提取竞品名称，请查看面板证据并手动补充",
    });
    await updateTask(task.id, "awaiting_competitor_confirmation", activity);
    return null;
  }
  if (!competitors.length) throw new Error("请至少选择或添加一个竞品名称后继续");
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
    const query = competitor.name;
    let competitorSaved = 0;
    let detailsViewedThisQuery = 0;
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
      reviewed: detailsViewedThisQuery,
      saved: samples.length,
    };
    await updateTask(task.id, "running", activity);
    const processedThisQuery = new Set();
    await searchCandidates(page, query, agent, async (visibleCards) => {
      for (const card of visibleCards) {
        const key = identity(card.url);
        if (competitorSaved >= 5 || detailsViewedThisQuery >= visualCompetitorDetailsPerQuery) return true;
        if (processedThisQuery.has(key) || seen.has(key)) continue;
        processedThisQuery.add(key);
        seen.add(key);
        try {
          detailsViewedThisQuery += 1;
          activity.sourceProgress.xiaohongshuVisual = {
            ...activity.sourceProgress.xiaohongshuVisual,
            reviewed: detailsViewedThisQuery,
            currentTitle: card.title,
          };
          await updateTask(task.id, "running", activity);
          const candidate = await openCandidate(page, card, task.project, query, agent);
          const screenshot = Buffer.from(candidate.screenshotBase64, "base64");
          const imageHash = createHash("sha256").update(screenshot).digest("hex");
          if (imageHashes.has(imageHash)) continue;
          const analysis = await agent.analyzeVisualSample({ screenshot, platform: "xiaohongshu", title: candidate.title, query }).catch(() => null);
          imageHashes.add(imageHash);
          const sourceCandidateId = String(candidate.id || crypto.randomUUID()).replace(`${task.id}:`, "");
          const visualCandidateId = `${task.id}:visual-${sourceCandidateId}`;
          const visualCandidate = {
            ...candidate,
            id: visualCandidateId,
            source: "xiaohongshu_visual",
            excerpt: String(analysis?.reason || candidate.excerpt || "").slice(0, 500),
            keywords: [competitor.name, ...(Array.isArray(analysis?.visualFeatures) ? analysis.visualFeatures.slice(0, 6) : [])],
            valuableComments: [],
          };
          await api(`/api/research/tasks/${task.id}/candidates`, {
            method: "POST", body: JSON.stringify({ candidates: [visualCandidate] }),
          });
          samples.push({
            id: visualCandidate.id, title: candidate.title, url: candidate.url,
            competitor: competitor.name,
            trendLabel: analysis?.trendLabel || "待归类", visualFeatures: Array.isArray(analysis?.visualFeatures) ? analysis.visualFeatures : [],
            reason: analysis?.reason || "已保留清晰且不重复的竞品截图，等待视觉归类。",
          });
          competitorSaved += 1;
          activity.sourceProgress.xiaohongshuVisual.saved = samples.length;
          await updateTask(task.id, "running", activity);
        } catch (error) {
          if (error instanceof LoginRequiredError || error instanceof RateLimitedError) throw error;
          console.warn(`跳过小红书视觉案例 ${card.title}: ${error.message}`);
        }
      }
      return competitorSaved >= 5 || detailsViewedThisQuery >= visualCompetitorDetailsPerQuery;
    });
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
  let browsed = 0;
  let reviewed = 0;
  let opened = 0;
  let currentQuery = "";
  const skipped = {};
  const skip = (reason, context = {}) => {
    skipped[reason] = Number(skipped[reason] || 0) + 1;
    appendCollectionLog(activity, "xiaohongshu", {
      type: "skipped", query: currentQuery, reason,
      title: String(context.title || "").slice(0, 160) || undefined,
      url: String(context.url || "").slice(0, 500) || undefined,
      detail: String(context.detail || "").slice(0, 240) || undefined,
      stage: context.stage || "candidate_validation",
      metadata: context.metadata && typeof context.metadata === "object" ? context.metadata : undefined,
    });
  };
  activity.sourceProgress.xiaohongshu = {
    ...activity.sourceProgress.xiaohongshu,
    browsed: 0, reviewed: 0, opened: 0, eligible: 0, saved: 0, skipped: {}, queryCoverage: [],
  };
  for (let index = 0; index < queries.length; index += 1) {
    const query = queries[index];
    currentQuery = query;
    activity.sourceProgress.xiaohongshu = {
      ...activity.sourceProgress.xiaohongshu,
      phase: "searching", progress: Math.round((index / queries.length) * 100),
      queryIndex: index + 1, queryTotal: queries.length,
      browsed, reviewed, opened, eligible: saved, saved, skipped: { ...skipped },
    };
    Object.assign(activity, {
      phase: "searching", queryIndex: index + 1, currentQuery: query,
      message: "三个平台正在同步研究",
    });
    await updateTask(task.id, "running", activity);
    const processedThisQuery = new Set();
    const coverage = { query, sort: "平台默认排序", resultsBrowsed: 0, resultCardSightings: 0, detailsAttempted: 0, detailsOpened: 0, saved: 0, scrollSteps: 0, stopReason: "" };
    const result = await searchCandidates(page, query, agent, async (visibleCards) => {
      coverage.resultsBrowsed = Math.max(coverage.resultsBrowsed, visibleCards.length);
      for (const card of visibleCards) {
        const key = identity(card.url);
        if (processedThisQuery.has(key)) continue;
        if (seen.has(key)) { processedThisQuery.add(key); skip("duplicate_in_run", { title: card.title, url: card.url, stage: "dedupe", detail: "该帖子已在本轮其他关键词下处理。" }); continue; }
        processedThisQuery.add(key);
        const cardDate = postDateEvidence(card.publishedAtText, card.publishedAtSource || "search_result_card");
        const cardDateInRange = isDateInProjectRange(cardDate.raw, task.project);
        const dateLogContext = {
          title: card.title,
          url: card.url,
          stage: "pre_open_date_filter",
          detail: cardDateInRange === false
            ? `搜索结果卡片日期 ${cardDate.raw} 解析为 ${cardDate.parsed}，超出项目日期范围。`
            : cardDateInRange === true
              ? `搜索结果卡片日期 ${cardDate.raw} 解析为 ${cardDate.parsed}，在项目日期范围内。`
              : `搜索结果卡片日期无法识别（原文：${cardDate.raw || "空"}）；为避免误删，将打开详情页核实。`,
          metadata: {
            publishedAtRaw: cardDate.raw || null,
            publishedAtSource: cardDate.source,
            parsedDate: cardDate.parsed || null,
            feedbackStartDate: task.project?.feedbackStartDate || null,
            feedbackEndDate: task.project?.feedbackEndDate || null,
          },
        };
        if (cardDateInRange === false) {
          skip("post_date_out_of_range_before_open", dateLogContext);
          continue;
        }
        appendCollectionLog(activity, "xiaohongshu", {
          type: "date_check",
          query: currentQuery,
          reason: cardDateInRange === true ? "result_card_date_in_range" : "result_card_date_unrecognized_open_for_verification",
          ...dateLogContext,
        });
        seen.add(key);
        reviewed += 1;
        coverage.detailsAttempted += 1;
        activity.sourceProgress.xiaohongshu = {
          ...activity.sourceProgress.xiaohongshu,
          phase: "reading",
          progress: Math.min(94, Math.round(((index + 0.65) / queries.length) * 100)),
          currentTitle: card.title,
          reviewed,
        };
        activity.matchedCount = seen.size;
        await updateTask(task.id, "running", activity);
        try {
          const candidate = await openCandidate(page, card, task.project, query, agent);
          opened += 1;
          coverage.detailsOpened += 1;
          activity.sourceProgress.xiaohongshu.opened = opened;
          await updateTask(task.id, "running", activity);
          // Search results already came from the user's selected keyword. Do not
          // reject a relevant post just because its body omits the full query phrase.
          const resolvedDate = candidate.publishedAtText || cardDate.raw;
          const resolvedDateSource = candidate.publishedAtSource || cardDate.source;
          const resolvedDateCheck = isDateInProjectRange(resolvedDate, task.project);
          const resolvedEvidence = postDateEvidence(resolvedDate, resolvedDateSource);
          const resolvedDateMetadata = {
            publishedAtRaw: resolvedEvidence.raw || null,
            publishedAtSource: resolvedEvidence.source,
            parsedDate: resolvedEvidence.parsed || null,
            feedbackStartDate: task.project?.feedbackStartDate || null,
            feedbackEndDate: task.project?.feedbackEndDate || null,
          };
          if (resolvedDateCheck === false) {
            skip("post_date_out_of_range_after_detail", {
              title: candidate.title || card.title,
              url: candidate.url || card.url,
              stage: "detail_date_verification",
              detail: `详情核实日期 ${resolvedEvidence.raw} 解析为 ${resolvedEvidence.parsed}，超出项目日期范围。`,
              metadata: resolvedDateMetadata,
            });
            continue;
          }
          appendCollectionLog(activity, "xiaohongshu", {
            type: "date_check", query: currentQuery,
            reason: resolvedDateCheck === true ? "detail_date_in_range" : "detail_date_unrecognized_kept",
            title: candidate.title || card.title,
            url: candidate.url || card.url,
            stage: "detail_date_verification",
            detail: resolvedDateCheck === true
              ? `确认日期 ${resolvedEvidence.raw} → ${resolvedEvidence.parsed} 在项目范围内。`
              : "结果卡片和详情页均未识别到可靠发布日期；按约定保留，并记录供追溯。",
            metadata: resolvedDateMetadata,
          });
          const feedbackGate = classifyPureMutualAidPost(
            card.title || "",
            candidate.feedbackGateText || candidate.excerpt || "",
            candidate.feedbackGateComments || candidate.valuableComments || [],
          );
          if (feedbackGate.isPureMutualAid) {
            skip("pure_mutual_aid_no_product_feedback", {
              title: candidate.title || card.title,
              url: candidate.url || card.url,
              stage: "feedback_relevance_gate",
              detail: `检测到纯互助内容，未发现产品体验反馈；依据：${feedbackGate.aidEvidence.join("；")}`,
              metadata: {
                aidEvidence: feedbackGate.aidEvidence,
                feedbackEvidence: feedbackGate.feedbackEvidence,
                classification: "pure_mutual_aid",
                policy: "仅在存在明确互助信号且未发现产品体验信号时过滤；不确定内容保留。",
              },
            });
            continue;
          }
          appendCollectionLog(activity, "xiaohongshu", {
            type: "feedback_gate",
            query: currentQuery,
            reason: feedbackGate.feedbackEvidence.length ? "product_feedback_signal_kept" : "uncertain_or_no_pure_aid_signal_kept",
            title: candidate.title || card.title,
            url: candidate.url || card.url,
            stage: "feedback_relevance_gate",
            detail: feedbackGate.feedbackEvidence.length
              ? `发现体验反馈线索，保留：${feedbackGate.feedbackEvidence.join("；")}`
              : "未能确认这是纯互助帖子，按保守规则保留。",
            metadata: {
              aidEvidence: feedbackGate.aidEvidence,
              feedbackEvidence: feedbackGate.feedbackEvidence,
              classification: feedbackGate.feedbackEvidence.length ? "feedback_signal" : "uncertain_kept",
              policy: "仅在存在明确互助信号且未发现产品体验信号时过滤；不确定内容保留。",
            },
          });
          delete candidate.feedbackGateText;
          delete candidate.feedbackGateComments;
          delete candidate.matchText;
          delete candidate.matchTags;
          if (task.project?.designType === "brand") candidate.source = "jd_feedback";
          const response = await api(`/api/research/tasks/${task.id}/candidates`, {
            method: "POST",
            body: JSON.stringify({ candidates: [candidate] }),
          });
          const result = await response.json().catch(() => ({}));
          if (Number(result.saved || 0) > 0) saved += Number(result.saved);
          coverage.saved += Number(result.saved || 0);
          if (Number(result.duplicates || 0) > 0) skip("duplicate_in_database", { title: candidate.title, url: candidate.url, stage: "save_candidate", detail: "保存接口判定为已有记录。", metadata: { duplicates: Number(result.duplicates || 0), saved: Number(result.saved || 0) } });
          activity.detailCount = saved;
          activity.agentRecoveryCalls = agent.recoveryCalls;
          activity.agentSummaryCalls = agent.summaryCalls;
          activity.sourceProgress.xiaohongshu.saved = saved;
          activity.sourceProgress.xiaohongshu.eligible = saved;
          activity.sourceProgress.xiaohongshu.skipped = { ...skipped };
          await updateTask(task.id, "running", activity);
        } catch (error) {
          if (error instanceof LoginRequiredError || error instanceof RateLimitedError) throw error;
          skip("detail_open_failed", { title: card.title, url: card.url, stage: "open_detail", detail: String(error?.message || error), metadata: { pageUrl: page.url(), query } });
          activity.sourceProgress.xiaohongshu.skipped = { ...skipped };
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
      return false;
    });
    coverage.resultsBrowsed = result.cards.length;
    coverage.resultCardSightings = result.resultCardSightings;
    coverage.scrollSteps = result.scrollSteps;
    coverage.stopReason = result.stopReason;
    coverage.scrollDiagnostics = result.scrollDiagnostics;
    browsed += result.cards.length;
    activity.sourceProgress.xiaohongshu = {
      ...activity.sourceProgress.xiaohongshu,
      queryCoverage: [...(activity.sourceProgress.xiaohongshu.queryCoverage || []), coverage],
    };
    appendCollectionLog(activity, "xiaohongshu", {
      type: "search", query, reason: "search_results_loaded", stage: "search_results",
      detail: `本关键词看到 ${result.resultCardSightings} 次卡片，去重后 ${result.cards.length} 条；滚动 ${result.scrollSteps} 次，停止原因：${result.stopReason}。`,
      url: result.url,
      metadata: { resultCardSightings: result.resultCardSightings, uniqueCards: result.cards.length, scrollSteps: result.scrollSteps, stopReason: result.stopReason, scrollDiagnostics: result.scrollDiagnostics },
    });
    activity.browsedCount += result.cards.length;
    activity.sourceProgress.xiaohongshu.browsed = browsed;
    activity.sourceProgress.xiaohongshu.reviewed = reviewed;
    activity.sourceProgress.xiaohongshu.opened = opened;
    activity.sourceProgress.xiaohongshu.saved = saved;
    activity.sourceProgress.xiaohongshu.eligible = saved;
    activity.sourceProgress.xiaohongshu.skipped = { ...skipped };
    await updateTask(task.id, "running", activity);
  }
  activity.sourceProgress.xiaohongshu = {
    ...activity.sourceProgress.xiaohongshu, phase: "completed", progress: 100, browsed, reviewed, opened, eligible: saved, saved,
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
  const projectDirections = task.project?.visualResearchPath === "existing" && Array.isArray(task.project?.visualDirections)
    ? task.project.visualDirections.map((item) => typeof item === "string" ? { label: item } : item)
      .map((item) => ({ label: String(item?.label || "").trim(), sourceNames: [], rationale: String(item?.rationale || "用户提供的已有视觉方向"), sampleIds: [] }))
      .filter((item) => item.label)
    : [];
  const confirmedDirections = projectDirections.length
    ? projectDirections
    : task.activity?.visualDirectionsConfirmed && Array.isArray(task.activity?.visualDirections)
      ? task.activity.visualDirections : null;
  const confirmedCompetitors = task.activity?.visualCompetitorsConfirmed && Array.isArray(task.activity?.visualCompetitors)
    ? task.activity.visualCompetitors : null;
  const visualOnly = task.project?.researchMode === "visual";
  const selectedFeedbackPlatforms = new Set(Array.isArray(task.project?.feedbackPlatforms) && task.project.feedbackPlatforms.length
    ? task.project.feedbackPlatforms : gameplayPlatformSpecs.map((spec) => spec.id));
  const activity = confirmedDirections || confirmedCompetitors || task.activity?.ignoredPlatforms?.length ? { ...task.activity, sourceProgress: { ...(task.activity.sourceProgress || {}) } } : {
    phase: "starting", queryIndex: 0, queryTotal: queries.length,
    browsedCount: 0, matchedCount: 0, detailCount: 0, message: visualOnly ? "正在准备视觉研究" : "正在准备所选平台的用户反馈研究",
    visualOnly,
    sourceProgress: visualOnly
      ? {
          xiaohongshuVisual: { phase: "queued", progress: 0, queryIndex: 0, queryTotal: 4, browsed: 0, saved: 0 },
          officialTrends: { phase: "queued", progress: 0 },
        }
      : {
          xiaohongshu: { phase: selectedFeedbackPlatforms.has("xiaohongshu") ? "queued" : "skipped", progress: selectedFeedbackPlatforms.has("xiaohongshu") ? 0 : 100, queryIndex: 0, queryTotal: queries.length, browsed: 0, saved: 0 },
          weibo: { phase: selectedFeedbackPlatforms.has("weibo") ? "queued" : "skipped", progress: selectedFeedbackPlatforms.has("weibo") ? 0 : 100, queryIndex: 0, queryTotal: queries.length, saved: 0 },
          voiceOfUser: { phase: selectedFeedbackPlatforms.has("voiceOfUser") ? "queued" : "skipped", progress: selectedFeedbackPlatforms.has("voiceOfUser") ? 0 : 100, queryIndex: 0, queryTotal: queries.length, saved: 0 },
        },
  };
  if (!visualOnly) activity.selectedFeedbackPlatforms = [...selectedFeedbackPlatforms];
  if (projectDirections.length) Object.assign(activity, {
    visualOnly: true,
    visualResearchPath: "existing",
    visualDirections: projectDirections,
    visualDirectionsConfirmed: true,
    phase: "generating_visual_terms",
    message: "正在为已有视觉方向准备 Behance 与 Pinterest 搜索词",
    sourceProgress: Object.fromEntries(visualPlatformsFor(task.project).map((platform) => [platform, {
      phase: "queued", progress: 0, queryIndex: 0, queryTotal: 0, browsed: 0, reviewed: 0, opened: 0, saved: 0,
    }])),
  });

  try {
    if (!confirmedDirections) {
      const xhsAgent = createResearchBrowserAgent();
      if (!visualOnly) {
        for (const spec of gameplayPlatformSpecs) {
          if (!selectedFeedbackPlatforms.has(spec.id) && activity.sourceProgress[spec.id]) activity.sourceProgress[spec.id] = { ...activity.sourceProgress[spec.id], phase: "skipped", progress: 100 };
        }
        if (!await ensureGameplayPlatformLogins(context, task, activity)) return;
        const weiboAgent = createResearchBrowserAgent();
        const voiceOfUserAgent = createResearchBrowserAgent();
        const ignored = new Set(activity.ignoredPlatforms || []);
        for (const platformId of ignored) {
          if (activity.sourceProgress[platformId]) activity.sourceProgress[platformId] = { ...activity.sourceProgress[platformId], phase: "skipped", progress: 100 };
        }
        let saved = 0;
        let weiboSaved = 0;
        let voiceSaved = 0;
        const platformErrors = [];
        const collectIndependently = async (platformId, label, collect) => {
          try { return await collect(); }
          catch (error) {
            if (error instanceof RateLimitedError) throw error;
            const message = String(error?.message || error);
            platformErrors.push(`${label}：${message}`);
            if (error instanceof LoginRequiredError) {
              activity.loginRequiredPlatforms = [...new Set([...(activity.loginRequiredPlatforms || []), label])];
            }
            appendCollectionLog(activity, platformId, { type: "error", reason: message, stage: "platform_collection" });
            activity.sourceProgress[platformId] = {
              ...activity.sourceProgress[platformId], phase: "failed", error: message,
            };
            activity.message = `${label}采集异常，继续采集其他平台`;
            await updateTask(task.id, "running", activity);
            console.warn(`${label}采集异常，已隔离并继续其他平台：${message}`);
            return 0;
          }
        };
        if (selectedFeedbackPlatforms.has("xiaohongshu") && !ignored.has("xiaohongshu")) saved = await collectIndependently("xiaohongshu", "小红书", () => collectXiaohongshu(page, task, queries, xhsAgent, activity));
        if (selectedFeedbackPlatforms.has("weibo") && !ignored.has("weibo")) weiboSaved = await collectIndependently("weibo", "微博", () => collectCommunityPlatform(context, task, gameplayPlatformSpecs[1], queries, weiboAgent, activity));
        if (selectedFeedbackPlatforms.has("voiceOfUser") && !ignored.has("voiceOfUser")) voiceSaved = await collectIndependently("voiceOfUser", "用户之声", () => collectCommunityPlatform(context, task, gameplayPlatformSpecs[2], queries, voiceOfUserAgent, activity));
        if (!saved && !weiboSaved && !voiceSaved) {
          const details = platformErrors.length ? `；${platformErrors.join("；")}` : "";
          throw new Error(`没有成功打开并保存玩法案例帖子${details}`);
        }
        if (task.project?.designType === "brand") await collectBrandStoreCases(context, task, activity);
        Object.assign(activity, {
          phase: "completed",
          message: `本轮采集完成：${[
            selectedFeedbackPlatforms.has("xiaohongshu") ? `小红书 ${saved} 条` : "",
            selectedFeedbackPlatforms.has("weibo") ? `微博 ${weiboSaved} 条` : "",
            selectedFeedbackPlatforms.has("voiceOfUser") ? `用户之声 ${voiceSaved} 条` : "",
          ].filter(Boolean).join("、")}。采集时间：${task.project?.feedbackStartDate || "2025-10-01"} 至 ${task.project?.feedbackEndDate || "今"}。${platformErrors.length ? `平台异常：${platformErrors.join("；")}` : ""}`,
          agentRecoveryCalls: xhsAgent.recoveryCalls,
          agentSummaryCalls: xhsAgent.summaryCalls,
        });
        await updateTask(task.id, "completed", activity);
        return;
      }
      const visualSamples = await collectXiaohongshuVisual(page, task, xhsAgent, activity);
      if (!visualSamples) return;
      if (!visualSamples.length) throw new Error("未采集到可用竞品详情截图，无法生成没有证据的视觉方向");
      const trendAgent = createResearchBrowserAgent();
      Object.assign(activity, { phase: "official_trend_reading", message: "正在读取官方趋势并与竞品视觉特征交叉比较" });
      activity.sourceProgress.officialTrends = { phase: "reading", progress: 30 };
      await updateTask(task.id, "running", activity);
      const currentOfficialSources = await readSources(context, officialTrendSources);
      if (!currentOfficialSources.length) throw new Error("三个官方趋势平台均无法读取，无法形成可追溯的视觉方向");
      activity.sourceProgress.officialTrends = { phase: "comparing", progress: 75 };
      const trendSelection = await trendAgent.selectVisualTrends({
        projectContext: task.project, officialSources: currentOfficialSources, xhsVisualSamples: visualSamples,
      });
      if (!trendSelection?.trends || trendSelection.trends.length !== 4) throw new Error("未能形成4个可确认的视觉方向");
      activity.visualDirections = trendSelection.trends.map((trend, index) => {
        const linkedSampleIds = Array.isArray(trend.sampleIds)
          ? trend.sampleIds.filter((id) => visualSamples.some((sample) => sample.id === id)).slice(0, 4)
          : [];
        // A visual-direction card must always show one or more screenshots.
        // When the model does not explicitly link one, use a collected detail
        // screenshot as the minimum evidence rather than rendering an empty card.
        return {
          label: String(trend.label || "").trim(),
          sourceNames: Array.isArray(trend.sourceNames) ? trend.sourceNames : [],
          rationale: String(trend.rationale || "").trim(),
          sampleIds: linkedSampleIds.length ? linkedSampleIds : [visualSamples[index % visualSamples.length].id],
        };
      });
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
    const selectedSamples = selectBestVisualSamples(evaluatedSamples, visualQueries);
    const incompleteTrends = visualQueries.filter((trend) => {
      const trendSamples = selectedSamples.filter((sample) => sample.trendKey === trend.key);
      return trendSamples.length < visualSamplesPerTrend;
    });
    if (!selectedSamples.length) throw new Error("Behance 与 Pinterest 均未获得可用样本，无法生成视觉案例结果");
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
      const blockedSource = gameplayPlatformSpecs.find((spec) => spec.name === error.platform)?.id || "xiaohongshu";
      await updateTask(task.id, "needs_login", { ...activity, phase: "needs_login", loginRequiredPlatforms: [error.platform || "小红书"], message: error.message }, {
        error: error.message, blockedSource, actionUrl: error.url,
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

#!/usr/bin/env node

const dashboardUrl = process.env.DASHBOARD_URL || "http://localhost:3000";
const cdpUrl = process.env.CHROME_CDP_URL || "http://127.0.0.1:9222";
const workerId = process.env.WORKER_ID || `design-lab-${process.pid}`;
const pollMs = Number(process.env.RESEARCH_POLL_MS || 5000);
const actionTimeoutMs = Number(process.env.RESEARCH_ACTION_TIMEOUT_MS || 15000);
const maxEvidence = Number(process.env.RESEARCH_MAX_EVIDENCE || 8);
const maxResultsPerQuery = Number(process.env.RESEARCH_MAX_RESULTS_PER_QUERY || 30);
const maxDetailInspectionsPerQuery = Number(
  process.env.RESEARCH_MAX_DETAIL_INSPECTIONS_PER_QUERY || 8
);
const maxSavedPerQuery = Number(process.env.RESEARCH_MAX_SAVED_PER_QUERY || 3);
const maxConsecutiveIrrelevant = Number(
  process.env.RESEARCH_MAX_CONSECUTIVE_IRRELEVANT || 3
);
const searchCooldownMs = Number(process.env.RESEARCH_SEARCH_COOLDOWN_MS || 12000);
const detailCooldownMs = Number(process.env.RESEARCH_DETAIL_COOLDOWN_MS || 4500);

const source = {
  id: "xiaohongshu",
  label: "小红书",
  home: "https://www.xiaohongshu.com/explore",
  resultMatch: /xiaohongshu\.com\/(?:explore|discovery\/item|search_result)\/[0-9a-z]+(?:[/?#]|$)/i,
};

const pageState = Object.freeze({
  HOME: "home",
  SEARCH_READY: "search_ready",
  SEARCH_LOADING: "search_loading",
  SEARCH_RESULTS: "search_results",
  DETAIL: "detail",
  LOGIN: "login",
  RATE_LIMIT: "rate_limit",
  MISSING: "missing",
  UNKNOWN: "unknown",
});

const benchmarkByGame = {
  养成: [
    { text: "支付宝 蚂蚁庄园 玩法", mustHave: ["蚂蚁庄园"] },
    { text: "蚂蚁庄园 养成机制", mustHave: ["蚂蚁庄园", "养成"] },
    { text: "QQ音乐 养成活动", mustHave: ["QQ音乐", "养成"] },
    { text: "淘宝 养成活动 玩法", mustHave: ["淘宝", "养成"] },
    { text: "拼多多 养成游戏 任务", mustHave: ["拼多多", "养成"] },
    { text: "美团 养成活动 奖励", mustHave: ["美团", "养成"] },
  ],
  收集: [
    { text: "淘宝 集卡活动 玩法", mustHave: ["淘宝", "集卡"] },
    { text: "拼多多 收集活动 任务", mustHave: ["拼多多", "收集"] },
    { text: "美团 集卡游戏 奖励", mustHave: ["美团", "集卡"] },
    { text: "抖音 收集玩法 兑换", mustHave: ["抖音", "收集"] },
  ],
  抽奖: [
    { text: "淘宝 抽奖活动 玩法", mustHave: ["淘宝", "抽奖"] },
    { text: "拼多多 翻牌游戏 奖励", mustHave: ["拼多多", "翻牌"] },
    { text: "美团 抽奖玩法 任务", mustHave: ["美团", "抽奖"] },
    { text: "抖音 抽奖活动 机制", mustHave: ["抖音", "抽奖"] },
  ],
  答题: [
    { text: "淘宝 答题活动 玩法", mustHave: ["淘宝", "答题"] },
    { text: "抖音 答题互动 分享", mustHave: ["抖音", "答题"] },
    { text: "美团 答题游戏 奖励", mustHave: ["美团", "答题"] },
    { text: "品牌 人格测试 互动", mustHave: ["人格测试"] },
  ],
};

const mechanismByGame = {
  养成: ["任务体系 进度奖励", "连续签到 阶段奖励", "升级 成长值 反馈", "角色养成 复访"],
  收集: ["收集 兑换 玩法", "集卡 稀有度 奖励", "重复任务 收集进度", "交换 分享 集卡"],
  抽奖: ["抽奖 概率 奖励展示", "翻牌 即时反馈", "任务换抽奖次数", "抽奖 保底 机制"],
  答题: ["答题 关卡 反馈", "答题 结果分享", "连续答题 奖励", "人格测试 结果卡"],
};

const genericNoisePatterns = [
  /旅游|旅行攻略|酒店|景点|机票|民宿/,
  /明星|演唱会|电视剧|综艺|追星/,
  /招聘|求职|面试|租房|二手/,
  /纯商品测评|开箱|穿搭|美妆/,
];

const problemTerms = {
  玩法不明确: ["怎么玩", "看不懂", "规则复杂"],
  开始率低: ["不想参加", "入口难找", "必须登录"],
  完成率低: ["任务太难", "做不完", "步骤太多"],
  分享率低: ["不想分享", "分享尴尬", "分享没奖励"],
  转化率低: ["奖励不值", "优惠太小", "套路"],
};

class LoginRequiredError extends Error {
  constructor(actionUrl) {
    super("小红书需要完成登录或安全验证");
    this.sourceId = source.id;
    this.actionUrl = actionUrl;
  }
}

class RateLimitedError extends Error {
  constructor() {
    super("小红书提示访问频繁，任务已停止以避免触发进一步安全限制，请稍后再试");
  }
}

class PostUnavailableError extends Error {
  constructor() {
    super("当前笔记暂时无法浏览");
  }
}

class AccessSafetyStopError extends Error {
  constructor() {
    super("连续帖子无法访问，任务已停止以避免触发小红书安全限制，请稍后再试");
  }
}

class RejectedCandidateError extends Error {
  constructor(message) {
    super(message);
    this.name = "RejectedCandidateError";
  }
}

class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.id = 0;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  send(method, params = {}, sessionId, timeoutMs = actionTimeoutMs) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} 超过 ${Math.round(timeoutMs / 1000)} 秒没有响应`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pacedWait = (baseMs) => wait(baseMs + Math.round(Math.random() * Math.min(baseMs * 0.35, 2500)));

async function connectChrome() {
  const version = await fetch(`${cdpUrl}/json/version`, { signal: AbortSignal.timeout(actionTimeoutMs) });
  if (!version.ok) throw new Error(`无法连接 Chrome 调试端口 ${cdpUrl}`);
  const { webSocketDebuggerUrl } = await version.json();
  const socket = new WebSocket(webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Chrome 连接超时")), actionTimeoutMs);
    socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Chrome WebSocket 连接失败")); }, { once: true });
  });
  return new Cdp(socket);
}

async function createTab(cdp) {
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank", background: false });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  return { targetId, sessionId };
}

async function navigate(cdp, tab, url) {
  await cdp.send("Page.navigate", { url }, tab.sessionId);
  await wait(3000);
}

async function evaluate(cdp, tab, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  }, tab.sessionId);
  return result.result?.value;
}

async function trustedClick(cdp, tab, point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error("无法确认点击位置");
  }
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: point.x,
    y: point.y,
  }, tab.sessionId);
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: point.x,
    y: point.y,
    button: "left",
    buttons: 1,
    clickCount: 1,
  }, tab.sessionId);
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: point.x,
    y: point.y,
    button: "left",
    buttons: 0,
    clickCount: 1,
  }, tab.sessionId);
}

async function pageSummary(cdp, tab) {
  return evaluate(cdp, tab, `(() => {
    const clean = (value) => String(value || "").replace(/\\s+/g, " ").trim();
    return {
      title: clean(document.title),
      url: location.href,
      text: clean(document.body?.innerText).slice(0, 10000),
      links: [...document.querySelectorAll("a[href]")].slice(0, 500)
        .map(a => {
          const card = a.closest("section, article, [class*='note-item'], [class*='feed-card']");
          return {
            title: clean(
              a.innerText
              || a.getAttribute("aria-label")
              || a.querySelector("img")?.alt
              || card?.innerText
              || card?.querySelector("img")?.alt
            ),
            cardText: clean(card?.innerText || a.innerText || a.querySelector("img")?.alt).slice(0, 800),
            url: a.href
          };
        })
        .filter(item => item.url && (item.title || item.cardText))
    };
  })()`);
}

function isSearchResultsUrl(url) {
  return /\/search_result(?:[/?#]|$)/i.test(String(url || ""));
}

function resultLinks(summary) {
  const unique = new Map();
  for (const item of summary?.links || []) {
    if (!source.resultMatch.test(item.url)) continue;
    const identity = postIdentity(item.url);
    if (!unique.has(identity)) unique.set(identity, item);
  }
  return [...unique.values()];
}

async function observePage(cdp, tab) {
  const summary = await pageSummary(cdp, tab);
  if (looksLikeRateLimit(summary)) return { state: pageState.RATE_LIMIT, summary };
  if (looksLikeLogin(summary)) return { state: pageState.LOGIN, summary };
  if (looksLikeMissingPost(summary)) return { state: pageState.MISSING, summary };

  const detail = await detailSummary(cdp, tab);
  if (detail.hasDetailRoot && detail.text.length >= 80) {
    return { state: pageState.DETAIL, summary, detail };
  }

  const links = resultLinks(summary);
  if (isSearchResultsUrl(summary.url)) {
    return {
      state: links.length ? pageState.SEARCH_RESULTS : pageState.SEARCH_LOADING,
      summary,
      links,
    };
  }

  const search = await evaluate(cdp, tab, `(() => {
    const visible = node => {
      if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)) return false;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 120 && rect.height > 20
        && style.display !== "none" && style.visibility !== "hidden";
    };
    const selectors = [
      "#search-input-in-feeds", "#search-input",
      "textarea[name='aiSearchTextarea']:not([aria-hidden='true'])",
      "textarea[placeholder*='搜索小红书']", "input.search-input",
      ".input-box input", "input[placeholder*='搜索']",
      "input[placeholder*='探索']", "input[type='search']"
    ];
    const input = selectors.map(selector => document.querySelector(selector)).find(visible);
    return input ? { found: true, value: input.value || "" } : { found: false, value: "" };
  })()`);
  if (search?.found) return { state: pageState.SEARCH_READY, summary, search };
  if (/\/explore(?:[/?#]|$)/i.test(summary.url)) return { state: pageState.HOME, summary };
  return { state: pageState.UNKNOWN, summary };
}

async function waitForObservedState(cdp, tab, acceptedStates, timeoutMs = 12000, stableCount = 1) {
  const accepted = new Set(acceptedStates);
  const deadline = Date.now() + timeoutMs;
  let lastState = "";
  let stable = 0;
  let observation = null;
  while (Date.now() < deadline) {
    observation = await observePage(cdp, tab);
    if (observation.state === pageState.LOGIN) throw new LoginRequiredError(observation.summary.url);
    if (observation.state === pageState.RATE_LIMIT) throw new RateLimitedError();
    if (accepted.has(observation.state)) {
      stable = observation.state === lastState ? stable + 1 : 1;
      if (stable >= stableCount) return observation;
    } else {
      stable = 0;
    }
    lastState = observation.state;
    await wait(500);
  }
  return observation;
}

async function searchInsideXiaohongshu(cdp, tab, keyword) {
  let observation = await observePage(cdp, tab);
  let summary = observation.summary;
  if (!/^https:\/\/www\.xiaohongshu\.com\//i.test(summary.url) || /captcha|website-login/i.test(summary.url)) {
    await navigate(cdp, tab, source.home);
    observation = await waitForObservedState(
      cdp,
      tab,
      [pageState.HOME, pageState.SEARCH_READY],
      12000
    );
    summary = observation?.summary || await pageSummary(cdp, tab);
  }
  if (looksLikeLogin(summary)) throw new LoginRequiredError(source.home);
  if (looksLikeRateLimit(summary)) throw new RateLimitedError();

  const prepared = await evaluate(cdp, tab, `(() => {
      const visible = node => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return rect.width > 120 && rect.height > 20
          && style.visibility !== "hidden" && style.display !== "none";
      };
      const selectors = [
        "#search-input-in-feeds",
        "#search-input",
        "textarea[name='aiSearchTextarea']:not([aria-hidden='true'])",
        "textarea[placeholder*='搜索小红书']",
        "input.search-input",
        ".input-box input",
        "input[placeholder*='搜索']",
        "input[placeholder*='探索']",
        "input[type='search']"
      ];
      const input = selectors
        .map(selector => document.querySelector(selector))
        .find(node => (
          node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement
        ) && visible(node) && node.getAttribute("aria-hidden") !== "true");
      if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return false;

      input.focus();
      const prototype = input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      setter?.call(input, ${JSON.stringify(keyword)});
      input.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: ${JSON.stringify(keyword)}
      }));
      input.dispatchEvent(new Event("change", { bubbles: true }));

      const rect = input.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return false;
      const searchButton = [
        input.closest("form")?.querySelector("button"),
        input.parentElement?.querySelector("button"),
        input.parentElement?.parentElement?.querySelector("button"),
        ...document.querySelectorAll("button")
      ].find(button => {
        if (!(button instanceof HTMLElement)) return false;
        const buttonRect = button.getBoundingClientRect();
        const label = [
          button.getAttribute("aria-label"),
          button.getAttribute("title"),
          button.innerText
        ].filter(Boolean).join(" ");
        const nearInput = buttonRect.left >= rect.left + rect.width * 0.65
          && buttonRect.left <= rect.right + 80
          && Math.abs((buttonRect.top + buttonRect.height / 2) - (rect.top + rect.height / 2)) < 80;
        return buttonRect.width >= 24 && buttonRect.height >= 24
          && getComputedStyle(button).visibility !== "hidden"
          && getComputedStyle(button).display !== "none"
          && (nearInput || /搜索|search/i.test(label));
      });
      const buttonRect = searchButton?.getBoundingClientRect();
      return {
        filled: input.value === ${JSON.stringify(keyword)},
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        buttonX: buttonRect ? buttonRect.left + buttonRect.width / 2 : null,
        buttonY: buttonRect ? buttonRect.top + buttonRect.height / 2 : null
      };
    })()`);
  if (!prepared?.filled || !Number.isFinite(prepared.x) || !Number.isFinite(prepared.y)) {
    throw new Error("没有找到可用的小红书搜索框");
  }

  await trustedClick(cdp, tab, prepared);
  await wait(250);
  if (Number.isFinite(prepared.buttonX) && Number.isFinite(prepared.buttonY)) {
    await trustedClick(cdp, tab, { x: prepared.buttonX, y: prepared.buttonY });
  }

  observation = await waitForObservedState(
    cdp,
    tab,
    [pageState.SEARCH_RESULTS],
    4500
  );
  if (observation?.state !== pageState.SEARCH_RESULTS) {
    await cdp.send("Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    }, tab.sessionId);
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    }, tab.sessionId);
    observation = await waitForObservedState(
      cdp,
      tab,
      [pageState.SEARCH_RESULTS],
      12000,
      2
    );
  }
  if (observation?.state !== pageState.SEARCH_RESULTS) {
    throw new Error("搜索动作未产生有效结果页，已停止该关键词");
  }

  summary = observation.summary;
  if (looksLikeRateLimit(summary)) throw new RateLimitedError();
  if (looksLikeLogin(summary)) throw new LoginRequiredError(summary.url || source.home);
  return summary;
}

async function scanResultPages(cdp, tab, searchUrl) {
  const collected = new Map();
  let latest = null;
  let stagnantRounds = 0;
  let viewportCount = 0;
  let successfulScrolls = 0;
  const initialLoadDeadline = Date.now() + 12000;

  while (collected.size < maxResultsPerQuery) {
    const batch = await evaluate(cdp, tab, `(() => {
      const clean = value => String(value || "").replace(/\\s+/g, " ").trim();
      const postPattern = /xiaohongshu\\.com\\/(?:explore|discovery\\/item|search_result)\\/[0-9a-z]+(?:[/?#]|$)/i;
      const anchors = [...document.querySelectorAll("a[href]")]
        .filter(anchor => {
          if (!postPattern.test(anchor.href)) return false;
          const card = anchor.closest(
            "[class*='note-item'], [class*='feed-card'], [class*='note-card'], section, article"
          ) || anchor;
          const rect = card.getBoundingClientRect();
          if (rect.width < 120 || rect.height < 120) return false;
          const visibleWidth = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0));
          const visibleHeight = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
          const visibleArea = visibleWidth * visibleHeight;
          const cardArea = rect.width * rect.height;
          return visibleArea >= 120 * 120 && visibleArea / cardArea >= 0.45;
        });

      const scrollable = node => {
        if (!(node instanceof HTMLElement)) return false;
        const style = getComputedStyle(node);
        return /(auto|scroll)/.test(style.overflowY)
          && node.scrollHeight > node.clientHeight + 80;
      };
      let scrollRoot = null;
      for (const anchor of anchors) {
        let parent = anchor.parentElement;
        while (parent && parent !== document.body) {
          if (scrollable(parent)) {
            scrollRoot = parent;
            break;
          }
          parent = parent.parentElement;
        }
        if (scrollRoot) break;
      }
      if (!scrollRoot) {
        scrollRoot = [...document.querySelectorAll("main, section, div")]
          .filter(scrollable)
          .map(node => ({ node, rect: node.getBoundingClientRect() }))
          .filter(({ rect }) => rect.width > innerWidth * 0.45 && rect.height > innerHeight * 0.45)
          .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height))[0]?.node
          || document.scrollingElement;
      }
      const isDocument = scrollRoot === document.scrollingElement
        || scrollRoot === document.documentElement
        || scrollRoot === document.body;
      const scrollTop = isDocument ? window.scrollY : scrollRoot.scrollTop;
      const clientHeight = isDocument ? innerHeight : scrollRoot.clientHeight;
      const scrollHeight = isDocument
        ? Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)
        : scrollRoot.scrollHeight;

      return {
        items: anchors.map(anchor => {
          const card = anchor.closest("section, article, [class*='note-item'], [class*='feed-card']")
            || anchor.parentElement
            || anchor;
          return {
            title: clean(
              anchor.innerText
              || anchor.getAttribute("aria-label")
              || anchor.querySelector("img")?.alt
              || card.innerText
              || card.querySelector("img")?.alt
            ),
            cardText: clean(card.innerText || anchor.innerText || card.querySelector("img")?.alt).slice(0, 800),
            url: anchor.href,
            resultScrollTop: scrollTop
          };
        }).filter(item => item.title || item.cardText),
        scrollTop,
        clientHeight,
        scrollHeight,
        atEnd: scrollTop + clientHeight >= scrollHeight - 12,
        hasScrollableRoot: Boolean(scrollRoot)
      };
    })()`);

    latest = await pageSummary(cdp, tab);
    if (looksLikeRateLimit(latest)) throw new RateLimitedError();
    if (looksLikeLogin(latest)) throw new LoginRequiredError(latest.url || searchUrl);

    const previousSize = collected.size;
    for (const item of batch?.items || []) {
      if (!source.resultMatch.test(item.url)) continue;
      const key = postIdentity(item.url);
      if (!collected.has(key)) collected.set(key, item);
      if (collected.size >= maxResultsPerQuery) break;
    }
    viewportCount += 1;
    stagnantRounds = collected.size === previousSize ? stagnantRounds + 1 : 0;

    if (
      (collected.size >= maxResultsPerQuery && successfulScrolls >= 1)
      || batch?.atEnd
    ) break;
    if (!collected.size && Date.now() >= initialLoadDeadline) {
      throw new Error("搜索结果页已打开，但当前视口没有可浏览的帖子卡片");
    }
    if (stagnantRounds >= 3) break;

    const moved = await evaluate(cdp, tab, `(() => {
      const postPattern = /xiaohongshu\\.com\\/(?:explore|discovery\\/item|search_result)\\/[0-9a-z]+(?:[/?#]|$)/i;
      const visibleAnchor = [...document.querySelectorAll("a[href]")].find(anchor => {
        const rect = anchor.getBoundingClientRect();
        return postPattern.test(anchor.href)
          && rect.bottom > 0 && rect.top < innerHeight;
      });
      const scrollable = node => {
        if (!(node instanceof HTMLElement)) return false;
        const style = getComputedStyle(node);
        return /(auto|scroll)/.test(style.overflowY)
          && node.scrollHeight > node.clientHeight + 80;
      };
      let root = visibleAnchor?.parentElement || null;
      while (root && root !== document.body && !scrollable(root)) root = root.parentElement;
      if (!root || root === document.body) {
        root = [...document.querySelectorAll("main, section, div")]
          .filter(scrollable)
          .map(node => ({ node, rect: node.getBoundingClientRect() }))
          .filter(({ rect }) => rect.width > innerWidth * 0.45 && rect.height > innerHeight * 0.45)
          .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height))[0]?.node
          || document.scrollingElement;
      }
      const isDocument = root === document.scrollingElement
        || root === document.documentElement
        || root === document.body;
      const before = isDocument ? window.scrollY : root.scrollTop;
      const distance = Math.max((isDocument ? innerHeight : root.clientHeight) * 0.82, 620);
      if (isDocument) window.scrollBy({ top: distance, behavior: "instant" });
      else root.scrollBy({ top: distance, behavior: "instant" });
      const after = isDocument ? window.scrollY : root.scrollTop;
      return { before, after, moved: after > before + 4 };
    })()`);
    await wait(1600);

    if (moved?.moved) {
      successfulScrolls += 1;
    } else {
      const afterWait = await evaluate(cdp, tab, "window.scrollY");
      if (!Number.isFinite(afterWait) || afterWait <= Number(batch?.scrollTop || 0) + 4) {
        stagnantRounds += 1;
      }
    }
  }
  return {
    summary: latest,
    links: [...collected.values()].slice(0, maxResultsPerQuery),
    viewportCount,
    successfulScrolls,
  };
}

async function postBoundary(cdp, tab) {
  return evaluate(cdp, tab, `(() => {
    const visible = node => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width >= 420 && rect.height >= 320
        && style.display !== "none" && style.visibility !== "hidden";
    };
    const ownsPost = node => {
      const text = String(node.innerText || "");
      const hasMedia = Boolean(node.querySelector("img, video, [class*='media'], [class*='swiper']"));
      const hasDetail = Boolean(node.querySelector(
        "[class*='interact'], [class*='comment'], [class*='engage'], [class*='note-content'], [class*='author']"
      ));
      return hasMedia && hasDetail && text.length > 60;
    };
    const direct = [
      ...document.querySelectorAll(".note-detail-mask .note-container"),
      ...document.querySelectorAll(".note-container"),
      ...document.querySelectorAll("[class~='note-container']"),
      ...document.querySelectorAll("[class*='note-detail']"),
      ...document.querySelectorAll("[role='dialog']")
    ].filter(node => visible(node) && ownsPost(node));
    let candidates = [...new Set(direct)];
    if (!candidates.length) {
      const mediaNodes = [...document.querySelectorAll(
        ".note-detail-mask [class*='media'], .note-detail-mask [class*='swiper'], .note-detail-mask video"
      )];
      const detailNodes = [...document.querySelectorAll(
        ".note-detail-mask [class*='comment'], .note-detail-mask [class*='interact'], .note-detail-mask [class*='note-content']"
      )];
      for (const media of mediaNodes) {
        let node = media.parentElement;
        while (node && node !== document.body) {
          if (detailNodes.some(detail => node.contains(detail)) && visible(node) && ownsPost(node)) {
            candidates.push(node);
            break;
          }
          node = node.parentElement;
        }
      }
    }
    const ranked = [...new Set(candidates)]
      .map(node => ({ node, rect: node.getBoundingClientRect() }))
      .filter(({ rect }) =>
        rect.width < window.innerWidth * 0.96
        && rect.height < Math.max(window.innerHeight * 1.35, 1100)
      )
      .sort((a, b) => (a.rect.width * a.rect.height) - (b.rect.width * b.rect.height));
    const chosen = ranked[0];
    if (!chosen) return null;
    const { rect } = chosen;
    return {
      x: Math.max(0, rect.left + window.scrollX),
      y: Math.max(0, rect.top + window.scrollY),
      width: Math.ceil(Math.min(rect.width, document.documentElement.scrollWidth)),
      height: Math.ceil(Math.min(rect.height, 1500)),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      scale: 1
    };
  })()`);
}

async function screenshot(cdp, tab) {
  const clip = await postBoundary(cdp, tab);
  if (!clip) throw new Error("无法确认完整帖子详情边界");
  const { viewportWidth: _viewportWidth, viewportHeight: _viewportHeight, ...captureClip } = clip;
  const result = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: true,
    clip: captureClip,
  }, tab.sessionId);
  return result.data;
}

function canonicalPath(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function postIdentity(url) {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(
      /\/(?:explore|discovery\/item|search_result)\/([0-9a-z]+)/i
    );
    return match?.[1]?.toLowerCase() || `${parsed.origin}${parsed.pathname}`;
  } catch {
    return String(url || "").split(/[?#]/, 1)[0].toLowerCase();
  }
}

function looksLikeMissingPost(summary) {
  const lead = `${summary.title} ${summary.text.slice(0, 2400)}`;
  return /你访问的页面不见了|当前笔记暂时无法浏览|笔记不存在|内容已删除|该内容无法展示|页面不存在|该笔记已删除|内容不存在|笔记已失效/i.test(lead);
}

function looksLikeRateLimit(summary) {
  const lead = `${summary.title} ${summary.text.slice(0, 2400)}`;
  return /请求太多|请求过多|操作频繁|访问频繁|请求频繁|稍后再试|休息一下/i.test(lead);
}

async function waitForPostState(cdp, tab, timeoutMs = 10000) {
  const startedAt = Date.now();
  let readyCount = 0;
  while (Date.now() - startedAt < timeoutMs) {
    const detail = await detailSummary(cdp, tab);
    if (looksLikeLogin(detail)) throw new LoginRequiredError(detail.url);
    if (looksLikeRateLimit(detail)) return { state: "rate_limit", detail };
    if (looksLikeMissingPost(detail)) return { state: "missing", detail };
    if (detail.hasDetailRoot && detail.text.length >= 80) {
      readyCount += 1;
      if (readyCount >= 2) return { state: "ready", detail };
    } else {
      readyCount = 0;
    }
    await wait(500);
  }
  return { state: "timeout", detail: await detailSummary(cdp, tab) };
}

async function openCandidateFromSearch(cdp, tab, searchUrl, candidate) {
  const wanted = canonicalPath(candidate.url);
  const expectedIdentity = postIdentity(candidate.url);
  const searchScrollY = Number.isFinite(candidate.resultScrollTop)
    ? candidate.resultScrollTop
    : await evaluate(cdp, tab, "window.scrollY");
  if (Number.isFinite(candidate.resultScrollTop)) {
    await evaluate(cdp, tab, `(() => {
      const target = ${Math.max(0, candidate.resultScrollTop)};
      const postPattern = /xiaohongshu\\.com\\/(?:explore|discovery\\/item|search_result)\\/[0-9a-z]+(?:[/?#]|$)/i;
      const anchor = [...document.querySelectorAll("a[href]")].find(item => postPattern.test(item.href));
      const scrollable = node => {
        if (!(node instanceof HTMLElement)) return false;
        const style = getComputedStyle(node);
        return /(auto|scroll)/.test(style.overflowY)
          && node.scrollHeight > node.clientHeight + 80;
      };
      let root = anchor?.parentElement || null;
      while (root && root !== document.body && !scrollable(root)) root = root.parentElement;
      if (!root || root === document.body) {
        root = [...document.querySelectorAll("main, section, div")]
          .filter(scrollable)
          .map(node => ({ node, rect: node.getBoundingClientRect() }))
          .filter(({ rect }) => rect.width > innerWidth * 0.45 && rect.height > innerHeight * 0.45)
          .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height))[0]?.node
          || document.scrollingElement;
      }
      const isDocument = root === document.scrollingElement
        || root === document.documentElement
        || root === document.body;
      if (isDocument) window.scrollTo({ top: target, behavior: "instant" });
      else root.scrollTo({ top: target, behavior: "instant" });
      return true;
    })()`);
    await wait(900);
  }
  for (let index = 0; index < 2; index += 1) {
    const clickTarget = await evaluate(cdp, tab, `(() => {
        const wanted = ${JSON.stringify(wanted)};
        const canonical = value => {
          try {
            const url = new URL(value, location.href);
            return url.origin + url.pathname;
          } catch { return String(value || ""); }
        };
        const link = [...document.querySelectorAll("a[href]")]
          .find(item => canonical(item.href) === wanted);
        if (!link) return null;
        link.scrollIntoView({ block: "center", behavior: "instant" });
        const card = link.closest(
          "[class*='note-item'], [class*='feed-card'], section, article"
        ) || link;
        const cover = card.querySelector("img, video, [class*='cover']") || link;
        const rect = cover.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return null;
        return {
          freshUrl: link.href,
          x: Math.max(2, Math.min(innerWidth - 2, rect.left + rect.width / 2)),
          y: Math.max(2, Math.min(innerHeight - 2, rect.top + Math.min(rect.height / 2, 180)))
        };
      })()`);
    if (clickTarget?.freshUrl) {
      await trustedClick(cdp, tab, clickTarget);
      const state = await waitForPostState(cdp, tab);
      if (state.state === "ready") {
        const detailHasPostUrl = source.resultMatch.test(state.detail.url);
        const actualIdentity = detailHasPostUrl ? postIdentity(state.detail.url) : "";
        const identityConfirmed = !detailHasPostUrl
          || actualIdentity === expectedIdentity
          || state.detail.url.includes(expectedIdentity);
        if (!identityConfirmed) {
          return {
            opened: false,
            wrongPost: true,
            sourceUrl: clickTarget.freshUrl,
            detail: state.detail,
            searchScrollY,
          };
        }
        return {
          opened: true,
          sourceUrl: clickTarget.freshUrl,
          detail: state.detail,
          searchScrollY,
        };
      }
      if (state.state === "rate_limit") throw new RateLimitedError();
      if (state.state === "missing") {
        return {
          opened: false,
          unavailable: true,
          sourceUrl: clickTarget.freshUrl,
          detail: state.detail,
          searchScrollY,
        };
      }
      return {
        opened: false,
        sourceUrl: clickTarget.freshUrl,
        detail: state.detail,
        searchScrollY,
      };
    }
    await evaluate(cdp, tab, "window.scrollBy({ top: Math.max(window.innerHeight * 0.8, 600), behavior: 'instant' }); true");
    await wait(900);
  }
  return { opened: false, sourceUrl: candidate.url, detail: null, searchScrollY };
}

async function returnToSearchResults(cdp, tab, searchUrl, scrollY = null) {
  if (!/\/search_result(?:[/?#]|$)/i.test(searchUrl)) {
    throw new Error("搜索结果页地址无效，拒绝返回首页继续采集");
  }
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 27,
  }, tab.sessionId).catch(() => {});
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 27,
  }, tab.sessionId).catch(() => {});
  let observation = await waitForObservedState(
    cdp,
    tab,
    [pageState.SEARCH_RESULTS],
    1800
  );
  if (observation?.state !== pageState.SEARCH_RESULTS) {
    await evaluate(cdp, tab, "history.back(); true");
    observation = await waitForObservedState(
      cdp,
      tab,
      [pageState.SEARCH_RESULTS],
      6500,
      2
    );
  }
  if (observation?.state !== pageState.SEARCH_RESULTS) {
    await navigate(cdp, tab, searchUrl);
    observation = await waitForObservedState(
      cdp,
      tab,
      [pageState.SEARCH_RESULTS],
      12000,
      2
    );
  }
  if (observation?.state !== pageState.SEARCH_RESULTS) return false;
  if (Number.isFinite(scrollY)) {
    await evaluate(cdp, tab, `(() => {
      const target = ${Math.max(0, scrollY)};
      const postPattern = /xiaohongshu\\.com\\/(?:explore|discovery\\/item|search_result)\\/[0-9a-z]+(?:[/?#]|$)/i;
      const anchor = [...document.querySelectorAll("a[href]")].find(item => postPattern.test(item.href));
      const scrollable = node => {
        if (!(node instanceof HTMLElement)) return false;
        const style = getComputedStyle(node);
        return /(auto|scroll)/.test(style.overflowY)
          && node.scrollHeight > node.clientHeight + 80;
      };
      let root = anchor?.parentElement || null;
      while (root && root !== document.body && !scrollable(root)) root = root.parentElement;
      if (!root || root === document.body) root = document.scrollingElement;
      const isDocument = root === document.scrollingElement
        || root === document.documentElement
        || root === document.body;
      if (isDocument) window.scrollTo({ top: target, behavior: "instant" });
      else root.scrollTo({ top: target, behavior: "instant" });
      return true;
    })()`);
    await wait(500);
  }
  return true;
}

async function detailSummary(cdp, tab) {
  return evaluate(cdp, tab, `(() => {
    const clean = value => String(value || "").replace(/\\s+/g, " ").trim();
    const roots = [
      ...document.querySelectorAll(".note-detail-mask .note-container"),
      ...document.querySelectorAll(".note-container"),
      ...document.querySelectorAll("[class~='note-container']"),
      ...document.querySelectorAll("[class*='note-detail']"),
      ...document.querySelectorAll("[role='dialog']")
    ];
    const root = [...new Set(roots)]
      .map(node => ({ node, rect: node.getBoundingClientRect() }))
      .filter(({ node, rect }) =>
        rect.width >= 420 && rect.height >= 320
        && rect.width < window.innerWidth * 0.96
        && Boolean(node.querySelector("img, video, [class*='media'], [class*='swiper']"))
        && (
          Boolean(node.querySelector("[class*='interact'], [class*='comment'], [class*='note-content']"))
          || String(node.innerText || "").trim().length >= 80
        )
      )
      .sort((a, b) => (a.rect.width * a.rect.height) - (b.rect.width * b.rect.height))[0]?.node;
    const scope = root || document.body;
    const text = clean(scope?.innerText).slice(0, 12000);
    const titleSelectors = ["#detail-title", "[class*='title']", "h1", "h2"];
    const authorSelectors = ["[class*='author'] [class*='name']", "[class*='username']", "[class*='user-name']"];
    const findText = selectors => selectors
      .map(selector => clean(scope?.querySelector(selector)?.textContent))
      .find(Boolean) || "";
    const date = text.match(/20\\d{2}[年./-]\\d{1,2}[月./-]\\d{1,2}日?/)?.[0]
      || text.match(/\\d{1,2}[月./-]\\d{1,2}日?/)?.[0]
      || text.match(/(?:今天|昨天|\\d+\\s*(?:天|小时|分钟)前)/)?.[0]
      || "";
    const metricText = selector => clean(scope?.querySelector(selector)?.textContent);
    const likes = metricText(".like-wrapper .count")
      || metricText("[class*='like'] [class*='count']")
      || metricText("[data-type='like']")
      || "";
    const collects = metricText(".collect-wrapper .count")
      || metricText("[class*='collect'] [class*='count']")
      || "";
    const comments = metricText(".chat-wrapper .count")
      || metricText("[class*='comment'] [class*='count']")
      || "";
    return {
      title: findText(titleSelectors) || clean(document.title),
      author: findText(authorSelectors),
      publishedAt: date,
      likes,
      collects,
      comments,
      url: location.href,
      text,
      hasDetailRoot: Boolean(root)
    };
  })()`);
}

async function inspectPostMedia(cdp, tab) {
  const media = await evaluate(cdp, tab, `async (() => {
    const root = document.querySelector(".note-detail-mask .note-container")
      || document.querySelector(".note-container")
      || document.querySelector("[class~='note-container']");
    if (!root) return { type: "post", count: 1 };
    const video = root.querySelector("video");
    if (video) {
      video.muted = true;
      try {
        if (Number.isFinite(video.duration) && video.duration > 0) video.currentTime = 0;
        await video.play();
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 10000));
      video.pause();
      return {
        type: "video",
        count: 1,
        watchedSeconds: Math.min(10, Math.round(video.currentTime || 10))
      };
    }
    const slides = [...root.querySelectorAll(".swiper-slide:not(.swiper-slide-duplicate), [class*='carousel'] img")]
      .filter(node => {
        const rect = node.getBoundingClientRect();
        return rect.width > 120 && rect.height > 120;
      });
    const uniqueSlides = new Set(slides.map(node =>
      node instanceof HTMLImageElement ? (node.currentSrc || node.src) : node.textContent
    ).filter(Boolean));
    const next = root.querySelector(
      ".swiper-button-next, button[aria-label*='下一'], button[aria-label*='next'], [class*='carousel'] [class*='next']"
    );
    const previous = root.querySelector(
      ".swiper-button-prev, button[aria-label*='上一'], button[aria-label*='previous'], [class*='carousel'] [class*='prev']"
    );
    const expected = Math.min(Math.max(uniqueSlides.size, 1), 10);
    let viewed = 1;
    if (expected > 1 && next instanceof HTMLElement) {
      for (let index = 1; index < expected; index += 1) {
        next.click();
        viewed += 1;
        await new Promise(resolve => setTimeout(resolve, 650));
      }
      if (previous instanceof HTMLElement) {
        for (let index = 1; index < viewed; index += 1) {
          previous.click();
          await new Promise(resolve => setTimeout(resolve, 180));
        }
      }
    }
    return { type: viewed > 1 ? "carousel" : "post", count: viewed };
  })()`);
  return media || { type: "post", count: 1 };
}

function cleanEvidenceText(text, fallback) {
  const cleaned = String(text || "")
    .replace(/首页 点点 ai RED 直播 发布 通知 消息 我.*?更多 关于我们/gi, "")
    .replace(/沪ICP备.*$/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || fallback || "").slice(0, 5000);
}

function cleanOption(value) {
  return String(value || "").replace(/（.*?）/g, "").trim();
}

function selected(project, key) {
  return (project.answers?.[key] || []).map(cleanOption).filter(Boolean);
}

function buildResearchQueries(project) {
  const projectName = String(project.projectName || "").trim();
  const game = selected(project, "game")[0] || cleanOption(project.customValues?.game);
  const problems = selected(project, "problem");
  const goals = selected(project, "goal");
  const wants = selected(project, "reference");
  const queries = [];

  if (projectName) {
    queries.push(
      { text: `${projectName} 玩法`, intent: "direct", mustHave: [projectName] },
      { text: `${projectName} 任务 奖励`, intent: "direct", mustHave: [projectName] },
      { text: `${projectName} 攻略 体验`, intent: "direct", mustHave: [projectName] },
    );
  }
  const benchmarks = benchmarkByGame[game] || [
    { text: `${game || "营销互动"} 活动 玩法案例`, mustHave: [game || "互动"] },
    { text: `${game || "营销互动"} 游戏 任务奖励`, mustHave: [game || "互动"] },
    { text: `${game || "营销互动"} 用户体验 反馈`, mustHave: [game || "互动"] },
  ];
  queries.push(...benchmarks.map((query) => ({ ...query, intent: "benchmark" })));
  if (game) {
    const mechanisms = mechanismByGame[game] || ["任务体系 进度反馈", "奖励节奏 复访", "分享传播 结果反馈"];
    queries.push(...mechanisms.map((mechanism) => ({
      text: `${game}活动 ${mechanism}`,
      intent: "mechanism",
      mustHave: [game],
    })));
  }
  for (const problem of problems) {
    for (const term of problemTerms[problem] || []) {
      queries.push({
        text: `${projectName || game || "营销活动"} ${term}`,
        intent: "problem",
        mustHave: [projectName || game || "活动"],
      });
    }
  }
  for (const goal of goals.slice(0, 2)) {
    queries.push({
      text: `${game || projectName || "营销互动"} ${goal} 玩法案例`,
      intent: "goal",
      mustHave: [game || projectName || "互动"],
    });
  }
  for (const want of wants.slice(0, 2)) {
    queries.push({
      text: `${game || projectName || "营销互动"} ${want}`,
      intent: "reference",
      mustHave: [game || projectName || "互动"],
    });
  }
  const unique = new Map();
  for (const query of queries) {
    const normalized = query.text
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[·•、，,。.!！?？:：;；"'“”‘’（）()【】[\]_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (normalized && !unique.has(normalized)) unique.set(normalized, query);
  }
  return [...unique.values()].slice(0, 15);
}

function looksLikeLogin(summary) {
  const pageLead = `${summary.title} ${summary.text.slice(0, 1600)}`;
  return /扫码登录|手机号登录|请先登录|登录后查看|安全验证|拖动滑块|请输入验证码/i.test(pageLead)
    || /login|passport|captcha/i.test(summary.url);
}

function relevanceScore(item, project, query) {
  const haystack = `${item.title} ${item.cardText || ""} ${item.url}`.toLowerCase();
  const projectName = String(project.projectName || "").trim().toLowerCase();
  const game = selected(project, "game")[0]?.toLowerCase();
  const queryTokens = query.text.toLowerCase().split(/\s+/).filter((token) => token.length >= 2);
  let score = 0;
  if (projectName && haystack.includes(projectName)) score += 10;
  for (const token of queryTokens) if (haystack.includes(token)) score += token.length >= 4 ? 4 : 2;
  if (game && haystack.includes(game)) score += 3;
  if (/玩法|活动|游戏|任务|奖励|养成|集卡|抽奖|答题|攻略|体验|吐槽|分享/.test(haystack)) score += 2;
  const mustHits = query.mustHave.filter((token) => haystack.includes(String(token).toLowerCase())).length;
  score += mustHits * 6;
  if (mustHits < Math.min(query.mustHave.length, 1)) score -= 12;
  const hasGameplaySignal = /玩法|活动|游戏|任务|奖励|养成|集卡|抽奖|答题|攻略|签到|进度|兑换|分享/.test(haystack);
  if (genericNoisePatterns.some((pattern) => pattern.test(haystack)) && !hasGameplaySignal) score -= 20;
  return score;
}

function detailRelevanceScore(detail, project, query) {
  return relevanceScore({
    title: detail.title,
    cardText: detail.text,
    url: detail.url,
  }, project, query);
}

function parseMetric(value) {
  const normalized = String(value || "").replace(/[,，\s]/g, "").trim();
  if (!normalized) return 0;
  const match = normalized.match(/(\d+(?:\.\d+)?)(万|w|W|千|k|K)?/);
  if (!match) return 0;
  const base = Number(match[1]);
  const multiplier = /万|w/i.test(match[2] || "") ? 10000 : /千|k/i.test(match[2] || "") ? 1000 : 1;
  return Math.round(base * multiplier);
}

function parsePublishedDate(value, now = new Date()) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const full = raw.match(/(20\d{2})[年./-](\d{1,2})[月./-](\d{1,2})/);
  if (full) return new Date(Date.UTC(Number(full[1]), Number(full[2]) - 1, Number(full[3])));
  const short = raw.match(/(\d{1,2})[月./-](\d{1,2})/);
  if (short) {
    let year = now.getUTCFullYear();
    const candidate = new Date(Date.UTC(year, Number(short[1]) - 1, Number(short[2])));
    if (candidate.getTime() > now.getTime() + 86400000) year -= 1;
    return new Date(Date.UTC(year, Number(short[1]) - 1, Number(short[2])));
  }
  if (/今天/.test(raw)) return now;
  if (/昨天/.test(raw)) return new Date(now.getTime() - 86400000);
  const relative = raw.match(/(\d+)\s*(天|小时|分钟)前/);
  if (relative) {
    const unit = relative[2] === "天" ? 86400000 : relative[2] === "小时" ? 3600000 : 60000;
    return new Date(now.getTime() - Number(relative[1]) * unit);
  }
  return null;
}

function sentenceCandidates(text) {
  return cleanEvidenceText(text, "")
    .replace(/(?:关注|点赞|收藏|评论|分享)\s*\d+(?:\.\d+)?万?/g, " ")
    .split(/(?<=[。！？!?])|\n+/)
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter((sentence) => sentence.length >= 8 && sentence.length <= 180)
    .filter((sentence) => !/ICP备|营业执照|网络文化|举报|关于我们|隐私|条评论$/.test(sentence));
}

function selectEvidenceSentences(text, project, query) {
  const projectName = String(project.projectName || "").trim();
  const game = selected(project, "game")[0] || "";
  const important = [
    projectName, game, ...query.mustHave,
    "养成", "玩法", "任务", "进度", "签到", "奖励", "收集", "兑换",
    "升级", "完成", "分享", "组队", "排行榜", "连续", "反馈", "角色", "故事",
  ].filter(Boolean);
  return sentenceCandidates(text)
    .map((sentence, index) => ({
      sentence,
      index,
      score: important.reduce((score, token) => score + (sentence.includes(token) ? 3 : 0), 0)
        + (/为什么|但是|不想|愿意|喜欢|难|卡|没有|希望|建议/.test(sentence) ? 2 : 0),
    }))
    .filter((item) => item.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.sentence);
}

function mechanicsFromText(text) {
  const labels = [
    ["连续签到", /连续.{0,6}签到|签到.{0,6}连续/],
    ["任务体系", /每日任务|阶段任务|完成任务|任务列表|任务体系/],
    ["进度反馈", /进度|还差|完成度|成长值|等级/],
    ["阶段奖励", /阶段奖励|奖励解锁|领取奖励|兑换奖励/],
    ["收集兑换", /收集|集卡|兑换/],
    ["升级养成", /养成|升级|喂养|成长/],
    ["社交传播", /分享|邀请|组队|助力/],
    ["排行榜", /排行榜|排名/],
    ["角色叙事", /角色|故事|剧情|世界观/],
  ];
  return labels.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

function buildAnalysis(text, game, projectName) {
  const mechanics = mechanicsFromText(text);
  const joined = mechanics.slice(0, 3).join("、") || `${game}玩法`;
  let dimension = "游戏玩法模式";
  let interpretation = `帖子实际展示了${joined}，可据此拆解核心循环与操作门槛。`;
  let implication = `可将${joined}拆成可验证的流程节点，观察用户能否快速理解并完成首轮体验。`;
  if (mechanics.some((item) => ["连续签到", "任务体系", "进度反馈", "阶段奖励", "升级养成"].includes(item))) {
    dimension = "用户牵引及留存机制";
    interpretation = `${joined}共同构成持续参与的牵引：用户既能看到当前进展，也能预期下一次回报。`;
    implication = `${projectName || "当前项目"}可借鉴“${joined}”的组合，但应分别验证首日参与率与任务完成率。`;
  } else if (mechanics.includes("社交传播")) {
    dimension = "达成的业务目标";
    interpretation = `${joined}把玩法结果连接到新增参与或外部传播，而不是停留在单次娱乐。`;
    implication = `${projectName || "当前项目"}可把分享放在明确成果之后，并验证分享率与带来的新增参与。`;
  } else if (mechanics.includes("角色叙事")) {
    dimension = "内容叙事与情绪价值";
    interpretation = `${joined}让任务进度拥有持续的情绪理由，而不只是领取奖励。`;
    implication = `${projectName || "当前项目"}可用角色状态或旅程节点承接任务反馈，验证是否提升复访意愿。`;
  }
  return {
    dimension,
    mechanisms: mechanics.slice(0, 4),
    observableFact: mechanics.length
      ? `帖子画面或原文明确出现：${mechanics.slice(0, 4).join("、")}。`
      : `帖子画面或原文明确展示了与${game}活动相关的参与流程。`,
    designInterpretation: interpretation,
    projectImplication: implication,
  };
}

async function api(path, options = {}) {
  return fetch(`${dashboardUrl}${path}`, {
    ...options,
    signal: options.signal || AbortSignal.timeout(actionTimeoutMs),
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
}

async function heartbeat(taskId, activity, extra = {}) {
  await api(`/api/research/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "running",
      activity: { ...activity, updatedAt: new Date().toISOString() },
      ...extra,
    }),
  });
}

async function saveEvidence(taskId, evidence) {
  const response = await api(`/api/research/tasks/${taskId}/evidence`, {
    method: "POST",
    body: JSON.stringify({ evidence: [evidence] }),
  });
  if (!response.ok) throw new Error(`证据保存失败：${response.status}`);
}

async function searchCandidates(cdp, tab, task, query, activity) {
  await heartbeat(task.id, { ...activity, phase: "searching", currentQuery: query.text, message: `正在搜索「${query.text}」` });
  let summary = await searchInsideXiaohongshu(cdp, tab, query.text);
  const searchUrl = summary.url;
  if (!/\/search_result(?:[/?#]|$)/i.test(searchUrl)) {
    throw new Error("未进入小红书搜索结果页");
  }
  if (looksLikeRateLimit(summary)) throw new RateLimitedError();
  if (looksLikeLogin(summary)) throw new LoginRequiredError(summary.url || searchUrl);
  if (!/xiaohongshu\.com/i.test(summary.url) || summary.text.length < 80) {
    throw new Error("小红书搜索页未正常加载");
  }

  const scan = await scanResultPages(cdp, tab, searchUrl);
  summary = scan.summary;
  const candidates = scan.links;
  const ranked = candidates
    .map((item) => ({ ...item, score: relevanceScore(item, task.project, query) }))
    .sort((a, b) => b.score - a.score)
    // 搜索卡片经常只有封面和很短的标题。这里仅排除明显污染项，
    // 最终相关性必须进入帖子详情后再判断。
    .filter((item) => {
      const haystack = `${item.title} ${item.cardText || ""}`;
      const hasGameplaySignal = /玩法|活动|游戏|任务|奖励|养成|集卡|抽奖|答题|攻略|签到|进度|兑换|分享/.test(haystack);
      return !genericNoisePatterns.some((pattern) => pattern.test(haystack)) || hasGameplaySignal;
    })
    .slice(0, maxDetailInspectionsPerQuery);

  return { candidates, ranked, searchUrl };
}

async function collectDetail(cdp, tab, task, candidate, query, searchUrl, activity) {
  await heartbeat(task.id, {
    ...activity,
    phase: "reading",
    currentQuery: query.text,
    message: `正在查看相关帖子：${candidate.title.slice(0, 36)}`,
  });
  const opened = await openCandidateFromSearch(cdp, tab, searchUrl, candidate);
  if (opened.unavailable) throw new PostUnavailableError();
  if (!opened.opened || !opened.detail) throw new Error("未能从搜索结果卡片打开有效帖子");
  const detail = opened.detail;
  if (looksLikeLogin(detail)) throw new LoginRequiredError(detail.url || candidate.url);
  if (looksLikeMissingPost(detail)) throw new Error("帖子已失效或无法访问");
  if (!detail.hasDetailRoot || detail.text.length < 80) throw new Error("帖子详情内容未正常加载");
  const relevance = detailRelevanceScore(detail, task.project, query);
  if (relevance < 8) {
    throw new RejectedCandidateError("帖子与本次研究主题相关性不足");
  }
  await wait(1200);
  const media = await inspectPostMedia(cdp, tab);
  const publishedDate = parsePublishedDate(detail.publishedAt);
  const cutoff = new Date();
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 2);
  if (!publishedDate || publishedDate < cutoff) {
    throw new RejectedCandidateError("帖子日期不可核验或超过两年");
  }
  const likes = parseMetric(detail.likes);
  const comments = parseMetric(detail.comments);
  const collects = parseMetric(detail.collects);
  if (likes <= 50 && comments <= 50) {
    throw new RejectedCandidateError("帖子互动量未超过 50");
  }
  const evidenceSentences = selectEvidenceSentences(detail.text, task.project, query);
  if (!evidenceSentences.length) {
    throw new RejectedCandidateError("没有提取到与项目强相关的证据句");
  }
  const game = selected(task.project, "game")[0] || "互动";
  const analysis = buildAnalysis(evidenceSentences.join(" "), game, task.project.projectName);
  return {
    searchScrollY: opened.searchScrollY,
    evidence: {
      id: `evidence-${crypto.randomUUID()}`,
      source: source.id,
      sourceLabel: source.label,
      title: detail.title && !/小红书|页面不见了/i.test(detail.title) ? detail.title : candidate.title,
      url: opened.sourceUrl || detail.url,
      author: detail.author || null,
      publishedAt: detail.publishedAt || null,
      capturedAt: new Date().toISOString(),
      originalText: evidenceSentences.join("\n"),
      screenshotBase64: await screenshot(cdp, tab),
      mediaType: media.type,
      mediaCount: media.count,
      watchedSeconds: media.watchedSeconds || null,
      keywords: [query.text, ...analysis.mechanisms],
      likes,
      comments,
      collects,
      primaryDimension: analysis.dimension,
      observableFact: analysis.observableFact,
      designInterpretation: analysis.designInterpretation,
      projectImplication: analysis.projectImplication,
      evidenceStrength: "单点观察",
    },
  };
}

async function processTask(cdp, task) {
  const tab = await createTab(cdp);
  const queries = buildResearchQueries(task.project);
  const visited = new Set();
  const searchedQueries = new Set();
  const warnings = [];
  let consecutiveAccessFailures = 0;
  let consecutiveSearchFailures = 0;
  const activity = {
    phase: "starting",
    currentQuery: "",
    queryIndex: 0,
    queryTotal: queries.length,
    browsedCount: 0,
    matchedCount: 0,
    detailCount: 0,
    message: "正在准备小红书研究",
  };

  try {
    await navigate(cdp, tab, source.home);
    const home = await pageSummary(cdp, tab);
    if (looksLikeLogin(home)) throw new LoginRequiredError(source.home);
    if (looksLikeRateLimit(home)) throw new RateLimitedError();
    await heartbeat(task.id, activity);
    for (let queryIndex = 0; queryIndex < queries.length && activity.detailCount < maxEvidence; queryIndex += 1) {
      const query = queries[queryIndex];
      const queryKey = query.text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
      if (searchedQueries.has(queryKey)) continue;
      searchedQueries.add(queryKey);
      activity.queryIndex = queryIndex + 1;
      let result = null;
      try {
        result = await searchCandidates(cdp, tab, task, query, activity);
        consecutiveSearchFailures = 0;
      } catch (error) {
        if (error instanceof LoginRequiredError) throw error;
        if (error instanceof RateLimitedError) throw error;
        consecutiveSearchFailures += 1;
        warnings.push(`「${query.text}」搜索失败：${error.message}`);
        if (consecutiveSearchFailures >= 2) {
          throw new Error("连续两个关键词未能进入有效搜索结果页，任务已暂停以避免重复请求");
        }
      }
      if (!result) continue;

      activity.browsedCount += result.candidates.length;
      const fresh = result.ranked.filter((item) => !visited.has(postIdentity(item.url)));
      activity.matchedCount += fresh.length;
      await heartbeat(task.id, {
        ...activity,
        phase: "filtering",
        currentQuery: query.text,
        message: `已浏览 ${activity.browsedCount} 条结果，准备进入 ${fresh.length} 条候选帖子核验`,
      });

      let inspectedThisQuery = 0;
      let savedThisQuery = 0;
      let consecutiveIrrelevant = 0;
      for (const candidate of fresh.slice(0, maxDetailInspectionsPerQuery)) {
        if (activity.detailCount >= maxEvidence) break;
        if (savedThisQuery >= maxSavedPerQuery) break;
        if (consecutiveIrrelevant >= maxConsecutiveIrrelevant) break;
        visited.add(postIdentity(candidate.url));
        inspectedThisQuery += 1;
        let searchScrollY = null;
        let shouldReturnToResults = false;
        try {
          const collected = await collectDetail(
            cdp,
            tab,
            task,
            candidate,
            query,
            result.searchUrl,
            activity
          );
          searchScrollY = collected.searchScrollY;
          shouldReturnToResults = true;
          await saveEvidence(task.id, collected.evidence);
          activity.detailCount += 1;
          savedThisQuery += 1;
          consecutiveIrrelevant = 0;
          consecutiveAccessFailures = 0;
          await heartbeat(task.id, {
            ...activity,
            phase: "saved",
            currentQuery: query.text,
            message: `已保存 ${activity.detailCount} 条证据`,
          });
        } catch (error) {
          if (error instanceof LoginRequiredError) throw error;
          if (error instanceof RejectedCandidateError) {
            consecutiveIrrelevant += 1;
            await heartbeat(task.id, {
              ...activity,
              phase: "filtering",
              currentQuery: query.text,
              message: `已核验 ${inspectedThisQuery} 条详情，当前帖子未达到证据标准`,
            });
          }
          if (error instanceof PostUnavailableError) {
            consecutiveAccessFailures += 1;
            warnings.push(`帖子暂时无法访问：${candidate.title.slice(0, 28)}`);
            if (consecutiveAccessFailures >= 2) throw new AccessSafetyStopError();
          }
          if (error instanceof RateLimitedError) {
            throw error;
          }
          if (
            !(error instanceof PostUnavailableError)
            && !(error instanceof RejectedCandidateError)
          ) {
            warnings.push(`帖子读取失败：${candidate.title.slice(0, 28)}`);
          }
        } finally {
          const current = await observePage(cdp, tab).catch(() => null);
          shouldReturnToResults = shouldReturnToResults
            || current?.state === pageState.DETAIL
            || current?.state === pageState.MISSING;
          if (shouldReturnToResults) {
            const recovered = await returnToSearchResults(
              cdp,
              tab,
              result.searchUrl,
              searchScrollY
            ).catch(() => false);
            if (!recovered) {
              throw new Error("无法安全返回当前搜索结果页，任务已暂停以避免重复搜索");
            }
          }
          await pacedWait(detailCooldownMs + Math.floor(Math.random() * 2500));
        }
      }
      if (queryIndex < queries.length - 1 && activity.detailCount < maxEvidence) {
        await heartbeat(task.id, {
          ...activity,
          phase: "cooldown",
          currentQuery: query.text,
          message: "已完成本轮浏览，稍后继续下一个关键词",
        });
        await pacedWait(searchCooldownMs);
      }
    }

    if (!activity.detailCount) throw new Error(warnings.join("；") || "没有找到与项目强相关的小红书帖子");
    await api(`/api/research/tasks/${task.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "completed",
        error: warnings.length ? warnings.join("；") : null,
        activity: { ...activity, phase: "completed", message: `研究完成，已保存 ${activity.detailCount} 条证据`, updatedAt: new Date().toISOString() },
      }),
    });
    console.log(`[${task.id}] 完成，已保存 ${activity.detailCount} 条证据`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const needsLogin = error instanceof LoginRequiredError;
    await api(`/api/research/tasks/${task.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: needsLogin ? "needs_login" : "failed",
        error: message,
        blockedSource: needsLogin ? error.sourceId : null,
        actionUrl: needsLogin ? error.actionUrl : null,
        activity: {
          ...activity,
          phase: needsLogin ? "needs_login" : "failed",
          message,
          updatedAt: new Date().toISOString(),
        },
      }),
    });
    console.error(`[${task.id}] ${message}`);
  } finally {
    await cdp.send("Target.closeTarget", { targetId: tab.targetId }).catch(() => {});
  }
}

async function main() {
  console.log(`设计调研与评审专家 Browser Agent Worker 已启动：${workerId}`);
  console.log(`看板：${dashboardUrl}；Chrome：${cdpUrl}`);
  const cdp = await connectChrome();
  while (true) {
    try {
      const response = await api("/api/research/tasks/claim", {
        method: "POST",
        body: JSON.stringify({ workerId }),
      });
      if (response.status === 204 || response.status === 409) {
        await wait(pollMs);
        continue;
      }
      if (!response.ok) throw new Error(`领取任务失败：${response.status}`);
      const { task } = await response.json();
      await processTask(cdp, task);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      await wait(pollMs);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

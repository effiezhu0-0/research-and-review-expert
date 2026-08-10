const DEFAULT_TIMEOUT_MS = 45000;
const DEFAULT_MAX_CALLS = 40;

const allowedStates = new Set([
  "home",
  "search_results",
  "post_detail",
  "login_required",
  "rate_limited",
  "loading",
  "unknown",
]);

const allowedActions = new Set([
  "click_element",
  "next_media",
  "previous_media",
  "scroll_element",
  "capture_frame",
  "save_candidate",
  "press_escape",
  "retry",
  "request_human",
  "finish",
  "none",
]);

function isSafeClickableElement(element) {
  const text = String(element?.text || "");
  if (/登录|注册|验证码|关注|点赞|收藏|发布|评论|私信|购买|支付|下单/i.test(text)) return false;
  if (element?.href && !/^https:\/\/(?:www\.)?xiaohongshu\.com\//i.test(element.href)) return false;
  return Boolean(element?.box);
}

function isSafeScrollableElement(element) {
  return Boolean(element?.box && element?.scrollable);
}

async function clickMediaDirection(page, direction) {
  const selectors = direction === "next"
    ? [
      ".note-detail-mask .swiper-button-next",
      ".note-detail-mask [class*='arrow-controller'][class*='right']",
      ".note-detail-mask [class*='right-arrow']",
      ".note-detail-mask [class*='next']",
      "[role='dialog'] .swiper-button-next",
      "[role='dialog'] [class*='arrow-controller'][class*='right']",
      "[role='dialog'] [class*='right-arrow']",
      "[role='dialog'] [class*='next']",
    ]
    : [
      ".note-detail-mask .swiper-button-prev",
      ".note-detail-mask [class*='arrow-controller'][class*='left']",
      ".note-detail-mask [class*='left-arrow']",
      ".note-detail-mask [class*='prev']",
      "[role='dialog'] .swiper-button-prev",
      "[role='dialog'] [class*='arrow-controller'][class*='left']",
      "[role='dialog'] [class*='left-arrow']",
      "[role='dialog'] [class*='prev']",
    ];
  for (const selector of selectors) {
    const matches = page.locator(selector);
    const count = await matches.count();
    for (let index = 0; index < count; index += 1) {
      const candidate = matches.nth(index);
      if (!await candidate.isVisible().catch(() => false)) continue;
      const box = await candidate.boundingBox().catch(() => null);
      if (!box || box.width < 12 || box.height < 12) continue;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(900);
      return true;
    }
  }

  const detail = page.locator(
    ".note-detail-mask .note-container, "
    + "[class*='note-detail'] [class*='note-container'], "
    + "[role='dialog']"
  ).filter({ visible: true }).first();
  const detailBox = await detail.boundingBox().catch(() => null);
  if (!detailBox) return false;
  const x = direction === "next"
    ? detailBox.x + detailBox.width * 0.485
    : detailBox.x + detailBox.width * 0.035;
  await page.mouse.click(x, detailBox.y + detailBox.height * 0.5);
  await page.waitForTimeout(900);
  return true;
}

function endpoint(base) {
  const normalized = String(base || "").replace(/\/$/, "");
  return normalized.endsWith("/chat/completions")
    ? normalized
    : `${normalized}/chat/completions`;
}

function parseToolArguments(message, functionName = "report_browser_decision") {
  const call = message?.tool_calls?.find((item) => item?.function?.name === functionName);
  if (!call?.function?.arguments) return null;
  try {
    return JSON.parse(call.function.arguments);
  } catch {
    return null;
  }
}

async function visibleElements(page) {
  return page.locator(
    "a, button, input, textarea, [role='button'], [tabindex], "
    + "[class*='comment'], [class*='scroll'], [class*='content']"
  ).evaluateAll((nodes) => {
    const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const output = [];
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      if (
        rect.width < 18 || rect.height < 18
        || rect.bottom <= 0 || rect.top >= innerHeight
        || rect.right <= 0 || rect.left >= innerWidth
      ) continue;
      const text = clean(
        node.innerText
        || node.getAttribute("aria-label")
        || node.getAttribute("placeholder")
        || node.getAttribute("title")
        || node.querySelector("img")?.alt
      );
      const href = node instanceof HTMLAnchorElement ? node.href : "";
      const style = getComputedStyle(node);
      const scrollable = (
        node.scrollHeight > node.clientHeight + 20
        && /(auto|scroll)/.test(style.overflowY)
      );
      if (!text && !href && !scrollable) continue;
      output.push({
        id: `visible-${output.length}`,
        tag: node.tagName.toLowerCase(),
        text: text.slice(0, 140),
        href: href.slice(0, 300),
        scrollable,
        box: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      });
      if (output.length >= 80) break;
    }
    return output;
  });
}

function toolDefinition() {
  return {
    type: "function",
    function: {
      name: "report_browser_decision",
      description: "报告当前小红书页面状态，并选择一个受限的恢复动作。",
      parameters: {
        type: "object",
        properties: {
          state: {
            type: "string",
            enum: [...allowedStates],
          },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
          },
          action: {
            type: "string",
            enum: [...allowedActions],
          },
          elementId: {
            type: "string",
            description: "click_element或scroll_element时填写可见元素ID；其他动作填写空字符串。",
          },
          reason: {
            type: "string",
          },
        },
        required: ["state", "confidence", "action", "elementId", "reason"],
        additionalProperties: false,
      },
    },
  };
}

function candidateSummaryTool() {
  return {
    type: "function",
    function: {
      name: "report_candidate_summary",
      description: "返回适合设计研究看板的提炼信息和纯评论内容。",
      parameters: {
        type: "object",
        properties: {
          insightTitle: { type: "string", description: "12至28字的研究型标题，不照抄原帖标题。" },
          summary: { type: "string", description: "只保留玩法、机制、体验、问题或可借鉴点，2至4句。" },
          comments: {
            type: "array",
            items: { type: "string" },
            description: "每项只包含用户评论原意，删除用户名、日期、地点、点赞数、回复数和作者标识。",
          },
        },
        required: ["insightTitle", "summary", "comments"],
        additionalProperties: false,
      },
    },
  };
}

export function createResearchBrowserAgent(options = {}) {
  const apiBase = options.apiBase || process.env.AGENT_API_BASE;
  const apiKey = options.apiKey || process.env.AGENT_API_KEY;
  const model = options.model || process.env.AGENT_MODEL;
  const enabled = process.env.AGENT_ENABLED !== "false" && Boolean(apiBase && apiKey && model);
  const timeoutMs = Number(process.env.AGENT_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const maxCalls = Number(process.env.AGENT_MAX_CALLS_PER_TASK || DEFAULT_MAX_CALLS);
  let calls = 0;

  return {
    get enabled() {
      return enabled;
    },
    get calls() {
      return calls;
    },
    get remainingCalls() {
      return Math.max(0, maxCalls - calls);
    },
    async summarizeCandidate({ title, text, comments, query }) {
      if (!enabled || calls >= maxCalls) return null;
      calls += 1;
      const response = await fetch(endpoint(apiBase), {
        method: "POST",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{
            role: "user",
            content: [
              "你是设计研究编辑。不要照抄小红书标题和整段正文，只提炼对当前项目有用的信息。",
              "评论必须删除用户名、日期、地点、点赞、回复数和作者标识，每条只保留评论正文。",
              `研究关键词：${query}`,
              `原帖标题：${title}`,
              `原始内容：${String(text).slice(0, 5000)}`,
              `候选评论：${JSON.stringify(comments)}`,
            ].join("\n"),
          }],
          tools: [candidateSummaryTool()],
          tool_choice: {
            type: "function",
            function: { name: "report_candidate_summary" },
          },
          stream: false,
        }),
      });
      if (!response.ok) throw new Error(`案例提炼接口返回 ${response.status}`);
      const payload = await response.json();
      return parseToolArguments(payload?.choices?.[0]?.message, "report_candidate_summary");
    },
    async decide(page, { goal, failure = "", expectedStates = [] }) {
      if (!enabled || calls >= maxCalls) return null;
      if (!/^https:\/\/(?:www\.)?xiaohongshu\.com\//i.test(page.url())) return null;

      const elements = await visibleElements(page).catch(() => []);
      const screenshot = await page.screenshot({
        type: "jpeg",
        quality: 58,
        fullPage: false,
        animations: "allow",
      }).catch(() => null);
      if (!screenshot) return null;

      calls += 1;
      const prompt = [
        "你是 Design Lab 的小红书研究浏览器 Agent。",
        "搜索完成后，由你编排候选点击、详情确认、多图、评论、截图和保存。",
        "不得登录、绕过验证码、发布、点赞、收藏、关注、评论或访问小红书以外的网站。",
        "click_element 只能使用下面可见元素列表中的 elementId。",
        "轮播翻页必须使用 next_media 或 previous_media，不要寻找普通elementId。",
        "scroll_element 只能用于 scrollable=true 的评论或正文区域。",
        "capture_frame 表示当前画面稳定，应由截图工具保存。",
        "save_candidate 表示当前候选有效，应由后端保存。",
        "不确定时选择 none；看到登录、验证码或访问频繁时选择 request_human。",
        `目标：${goal}`,
        failure ? `刚才失败：${failure}` : "",
        expectedStates.length ? `期望状态：${expectedStates.join(", ")}` : "",
        `当前 URL：${page.url()}`,
        `可见元素：${JSON.stringify(elements)}`,
      ].filter(Boolean).join("\n");

      const response = await fetch(endpoint(apiBase), {
        method: "POST",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${screenshot.toString("base64")}` },
              },
            ],
          }],
          tools: [toolDefinition()],
          tool_choice: {
            type: "function",
            function: { name: "report_browser_decision" },
          },
          stream: false,
        }),
      });
      if (!response.ok) {
        const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 300);
        throw new Error(`Agent接口返回 ${response.status}${detail ? `：${detail}` : ""}`);
      }
      const payload = await response.json();
      const decision = parseToolArguments(payload?.choices?.[0]?.message);
      if (
        !decision
        || !allowedStates.has(decision.state)
        || !allowedActions.has(decision.action)
        || typeof decision.confidence !== "number"
      ) {
        throw new Error("Agent返回了无效的结构化决定");
      }
      if (decision.action === "click_element") {
        const element = elements.find((item) => item.id === decision.elementId);
        if (!element) throw new Error("Agent选择了不可用的页面元素");
        if (!isSafeClickableElement(element)) throw new Error("Agent选择的元素不在安全点击范围内");
        decision.element = element;
      }
      if (decision.action === "scroll_element") {
        const element = elements.find((item) => item.id === decision.elementId);
        if (!element || !isSafeScrollableElement(element)) {
          throw new Error("Agent选择了不可滚动的页面区域");
        }
        decision.element = element;
      }
      return decision;
    },
  };
}

export async function executeAgentDecision(page, decision) {
  if (!decision || decision.confidence < 0.55) return { executed: false, needsHuman: false };
  if (decision.action === "request_human") {
    return { executed: false, needsHuman: true };
  }
  if (decision.action === "press_escape") {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(700);
    return { executed: true, needsHuman: false };
  }
  if (
    decision.action === "click_element"
    && decision.element?.box
    && isSafeClickableElement(decision.element)
  ) {
    const { x, y, width, height } = decision.element.box;
    await page.mouse.click(x + width / 2, y + height / 2);
    await page.waitForTimeout(900);
    return { executed: true, needsHuman: false };
  }
  if (decision.action === "next_media" || decision.action === "previous_media") {
    const executed = await clickMediaDirection(
      page,
      decision.action === "next_media" ? "next" : "previous"
    );
    return { executed, needsHuman: false };
  }
  if (
    decision.action === "scroll_element"
    && decision.element?.box
    && isSafeScrollableElement(decision.element)
  ) {
    const { x, y, width, height } = decision.element.box;
    await page.mouse.move(x + width / 2, y + height / 2);
    await page.mouse.wheel(0, Math.max(420, Math.round(height * 0.78)));
    await page.waitForTimeout(750);
    return { executed: true, needsHuman: false };
  }
  if (decision.action === "retry") {
    await page.waitForTimeout(900);
    return { executed: true, needsHuman: false };
  }
  return { executed: false, needsHuman: false };
}

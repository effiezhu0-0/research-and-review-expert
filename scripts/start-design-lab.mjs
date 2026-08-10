#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const stateDir = join(root, ".design-lab");
const lockFile = join(stateDir, "launcher.lock");
const dashboardUrl = process.env.DASHBOARD_URL || "http://localhost:3000";
const cdpUrl = process.env.CHROME_CDP_URL || "http://127.0.0.1:9222";
const chromePath = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromeProfile = process.env.CHROME_PROFILE_DIR || join(homedir(), ".design-lab-chrome");
const children = [];
let shuttingDown = false;

mkdirSync(stateDir, { recursive: true });

function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

if (existsSync(lockFile)) {
  const activePid = Number(readFileSync(lockFile, "utf8"));
  if (processExists(activePid)) {
    console.log("Design Lab 已经在运行。");
    await openDashboard();
    process.exit(0);
  }
  rmSync(lockFile, { force: true });
}
writeFileSync(lockFile, String(process.pid));

async function isReady(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1200) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitUntil(url, label, timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isReady(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${label}启动超时`);
}

function startChild(command, args, label, options = {}) {
  const { quiet = false, ...spawnOptions } = options;
  const child = spawn(command, args, {
    cwd: root,
    env: process.env,
    stdio: quiet ? "ignore" : ["ignore", "pipe", "pipe"],
    ...spawnOptions,
  });
  children.push({ child, label });
  child.stdout?.on("data", (chunk) => {
    const text = String(chunk).trim();
    if (text) console.log(`[${label}] ${text}`);
  });
  child.stderr?.on("data", (chunk) => {
    const text = String(chunk).trim();
    if (text && !/ExperimentalWarning/.test(text)) console.error(`[${label}] ${text}`);
  });
  child.on("exit", (code) => {
    if (!shuttingDown && code) console.error(`${label}已停止（代码 ${code}）`);
  });
  return child;
}

async function ensureChrome() {
  if (await isReady(`${cdpUrl}/json/version`)) {
    console.log("✓ 已连接专用 Chrome");
    return;
  }
  if (!existsSync(chromePath)) {
    throw new Error(`未找到 Google Chrome：${chromePath}`);
  }
  mkdirSync(chromeProfile, { recursive: true });
  startChild(chromePath, [
    "--remote-debugging-port=9222",
    `--user-data-dir=${chromeProfile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
  ], "Chrome", { quiet: true });
  await waitUntil(`${cdpUrl}/json/version`, "专用 Chrome", 20000);
  console.log("✓ 专用 Chrome 已启动");
}

async function ensureDashboard() {
  if (await isReady(dashboardUrl)) {
    console.log("✓ 看板已运行");
    return;
  }
  startChild("npm", ["run", "dev", "--", "--port", "3000", "--strictPort"], "看板", { quiet: true });
  await waitUntil(dashboardUrl, "看板", 45000);
  console.log("✓ 看板已启动");
}

async function openDashboard() {
  try {
    const response = await fetch(`${cdpUrl}/json/new?${encodeURIComponent(dashboardUrl)}`, { method: "PUT" });
    if (!response.ok) throw new Error();
  } catch {
    if (process.platform === "darwin") {
      spawn("open", ["-a", "Google Chrome", dashboardUrl], { detached: true, stdio: "ignore" }).unref();
    }
  }
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n正在停止 Design Lab…`);
  for (const { child } of children.reverse()) {
    if (!child.killed) child.kill("SIGTERM");
  }
  rmSync(lockFile, { force: true });
  if (signal) process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("exit", () => rmSync(lockFile, { force: true }));

try {
  console.log("正在启动 Design Lab…");
  await ensureChrome();
  await ensureDashboard();
  startChild(process.execPath, ["scripts/playwright-research-worker.mjs"], "Playwright研究服务");
  await openDashboard();

  console.log("\nDesign Lab 已就绪");
  console.log(`看板：${dashboardUrl}`);
  console.log("研究范围：小红书（单来源模式）");
  console.log("按 Ctrl+C 可统一停止本次启动的服务。\n");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  await shutdown();
  process.exitCode = 1;
}

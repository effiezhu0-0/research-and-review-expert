# 设计调研与评审专家｜项目概览

> 更新时间：2026-10-15  
> 用途：用于双方项目整合前的现状对齐、模块边界确认与 GitHub 协作。  
> 讨论背景：[Vibe Coding 协作合并方案](https://chatgpt.com/share/6ad09b0a-c438-83ec-887c-c54ddeab0e1e)

## 1. 项目定位

设计调研与评审专家是面向设计师的 AI 设计调研与评审工作台。当前目标是把项目背景、案例与反馈、归因策略、方案评价和上线复盘串成同一条可追溯链路：

```text
项目需求 → 案例与反馈 → 归因结论 → 方案评价 → 上线复盘
```

项目目前由若焉维护的部分主要包括：

- 平台公共框架和项目入口。
- 互动、品牌和大促三个研究场域。
- 小红书案例、用户反馈和竞品视觉调研。
- 官方趋势交叉分析及视觉参考收集。
- 基于人工选择证据生成设计策略。
- 方案导入、设计点识别、基础 AI 评价和上线复盘原型。

计划与靖雯负责的多 Agent 评审、评分和评审报告模块合并，形成完整产品。

## 2. 当前完成度

### 已实现

- 三种项目入口：创建空白项目、导入已有方案、创建上线复盘。
- 三个设计场域：互动设计、品牌设计、大促设计。
- PDF 项目背景读取、链接录入和 AI 自动填写项目条件。
- 研究开放度滑杆，用于控制聚焦与探索程度。
- 用户主动点击后才创建并执行研究任务。
- 本地 Worker 配对、任务领取、进度回传和异常状态展示。
- 小红书帖子详情、截图、正文和评论采集。
- 互动项目先识别最多 4 个主要竞品，再按竞品定向采集视觉案例；每个竞品目标 5 张，不足时降级，链接和图片双重去重。
- 对视觉案例提取风格、材质、色彩、字体、构图、角色和动效特征。
- 将竞品视觉特征与 Pinterest Predicts、Canva Design Trends、Adobe Creative Trends 交叉比较。
- 用户确认视觉方向后，再从 Behance、Pinterest、ZCOOL 收集视觉参考。
- 人工选择或排除案例，只有已选择案例进入策略生成。
- 生成带证据、风险和验证指标的机会点、策略和初步方向。
- 导入最多 5 张方案图片，AI 识别可编辑设计点与建议指标。
- 基于“业务诉求 → 研究策略 → 设计点 → 指标”进行基础方案评分。
- 录入基线、目标、上线结果和观察周期，保存复盘结论。

### 尚未完成或仍属原型

- 真正的多角色、多 Agent 独立评审与角色间追问。
- 评审意见的采纳/不采纳状态、理由和完整审计记录。
- 统一的服务端项目、方案、评审和复盘数据模型。
- 团队级登录、权限、项目共享和数据隔离。
- 公司内网生产部署和后续公网部署方案。
- 稳定的第三方视觉平台采集；页面变动、登录和限流仍可能导致降级。
- AI API 的额度监控、错误分类和生产 SLA。

## 3. 技术架构

### 3.1 技术栈

| 层级 | 当前实现 |
| --- | --- |
| 前端 | React 19、Next.js 16 App Router、TypeScript |
| 构建与运行 | vinext、Vite 8、Cloudflare Vite Plugin |
| API | Next.js Route Handlers，运行在 Cloudflare Worker 兼容环境 |
| 数据库 | Cloudflare D1（SQLite），本地由 Miniflare 模拟 |
| 图片证据 | Cloudflare R2，本地由 Miniflare 模拟 |
| 数据访问 | D1 Prepared Statements；已安装 Drizzle，但当前研究表主要由 `ensureResearchSchema()` 维护 |
| 浏览器自动化 | Playwright Core + 用户电脑上的专用 Google Chrome/CDP |
| AI 接口 | OpenAI Chat Completions 兼容 HTTPS/HTTP 接口，支持工具调用和图像输入 |
| 本地状态 | localStorage、sessionStorage、IndexedDB |
| 测试 | Node test + 生产构建检查 |

运行要求：Node.js `>=22.13.0`，本地视觉研究还要求 macOS、Google Chrome 和相应网站访问权限。

### 3.2 双运行时结构

```text
浏览器中的设计调研与评审专家
        │
        ├── Web/API：vinext + Cloudflare Worker
        │      ├── D1：任务、候选、策略、视觉样本、配对关系
        │      └── R2：帖子截图、媒体和视觉样本
        │
        └── 用户电脑上的 Playwright Research Worker
               ├── 专用 Chrome 登录态
               ├── 小红书与视觉平台浏览
               ├── 受限 Browser Agent
               └── 通过任务 API 领取与回写结果
```

Web 应用可以部署，但依赖用户登录态的研究采集目前不能完全迁入无状态云端。部署后仍需要每位研究用户在本机运行并配对 Worker，或者未来建设公司统一、合规的浏览器执行服务。

### 3.3 启动方式

```bash
npm install
npm run design-lab   # 看板 + 专用 Chrome + 已配对的研究 Worker
npm run dev          # 仅启动看板
npm run agent:worker # 仅启动研究 Worker
npm run build        # 生产构建检查
npm test             # 构建并运行现有测试
```

`npm run design-lab` 会检查 `localhost:3000`、启动 CDP Chrome、按本机配对信息启动 Worker，并打开看板。

## 4. 代码结构

```text
app/
  api/
    meeting-context/          项目背景提炼
    research/                 任务、候选、证据、策略、视觉样本、Worker 配对
    solution-analysis/        从方案截图识别设计点
    solution-review/          基础方案评价
  components/                 导航、流程、案例、进度、视觉方向等组件
  lib/                        AI 适配、本地状态、身份、研究配置
  projects/
    new/                      项目需求
    research/                 案例与反馈
    strategy/                 归因结论和视觉参考
    import/                   方案导入
    import/identify/          设计点识别与确认
    score/                    方案评价
    retrospective/            上线复盘

scripts/
  start-design-lab.mjs        一键启动器
  playwright-research-worker.mjs
                              研究任务编排与浏览器采集
  research-browser-agent.mjs  受限浏览 Agent、摘要和视觉分析
  agent-runtime.mjs           Worker 侧模型适配

worker/index.ts               Cloudflare Worker 入口
app/api/research/store.ts     当前实际研究表结构与运行时迁移
migrations/                   研究数据增量迁移
tests/                        静态流程和关键约束测试
```

## 5. 功能流程

### 5.1 项目需求

1. 必填项目名称。
2. 选择互动、品牌或大促场域。
3. 录入目标、感知、边界、受众或玩法等场域条件。
4. 可上传 PDF 项目背景，或粘贴会议纪要、文档、网页和 PRD 链接。
5. `/api/meeting-context` 调用模型提炼项目名、最多 3 个要点，并自动填写结构化条件。
6. 开放度滑杆控制后续研究的聚焦/探索取向。
7. 用户点击继续后才创建任务，不会因打开页面自动研究。

### 5.2 案例、反馈与视觉方向

1. Web API 创建 `queued` 任务。
2. 研究页在用户明确开始后写入 `executionRequested`。
3. 已配对 Worker 只能领取属于当前 owner 的任务。
4. Worker 从项目条件生成搜索词，在小红书采集案例与真实反馈。
5. 互动视觉研究先搜索该互动类型的主要竞品，再逐个竞品搜索视觉案例。
6. Agent 从截图识别视觉特征，并与官方趋势资料交叉生成 4 个待确认方向。
7. 竞品案例与视觉方向只在确实相关时关联，不强制每个方向绑定案例。
8. 用户确认方向和案例后，任务再次入队，收集 Behance、Pinterest、ZCOOL 视觉参考。
9. 每个方向目标 10 张参考图，区分灵感参考与执行参考；平台或样本不足时记录降级原因后完成。

### 5.3 归因策略

- 输入仅使用人工选择的候选案例、摘要和用户评论。
- 输出为结构化 `opportunities`、`strategies`、`directions`。
- 每条策略包含证据候选 ID、用户原话、风险和优先指标。
- AI 不可用时存在基于本地证据的可编辑降级结果。
- 结果按任务保存在 `research_strategies`，可复用或强制重新生成。

### 5.4 方案评价与复盘

- 方案导入支持图片；原始图片暂存在 IndexedDB。
- AI 从截图识别 2–6 个设计点、所在区域、绑定策略和 1–3 个验证指标。
- 用户确认后形成 `SolutionPackage`。
- 当前评价接口输出总体分、业务目标分和逐设计点评价。
- 上线复盘按设计点记录基线、目标、实际值、观察周期、验证结论和干扰因素。

## 6. AI 与 Agent 架构

### 6.1 统一模型适配

模型调用统一使用 OpenAI Chat Completions 兼容协议：

```text
{AGENT_API_BASE}/chat/completions
Authorization: Bearer <API Key>
model: AGENT_MODEL
```

配置有两条路径：

- Web API：优先读取浏览器个人配置请求头，否则读取部署环境变量。
- 本地研究 Worker：读取本机 `.env` 中的内网或其他兼容模型配置。

浏览器个人配置保存在当前浏览器 localStorage；Key 会随具体 AI 请求发送到设计调研与评审专家 API，但不会写入 D1、R2 或项目记录。浏览器个人配置只允许 HTTPS 非本机地址；HTTP 内网模型应由本地 Worker 使用。

### 6.2 当前 AI 能力

- 项目背景提炼与表单自动填写。
- 帖子摘要与代表性评论清洗。
- 当前互动类型的竞品识别。
- 截图视觉特征分析。
- 竞品视觉与官方趋势交叉归纳。
- 为确认方向生成视觉搜索词。
- 基于人工证据生成策略。
- 方案截图中的设计点识别。
- 业务诉求导向的基础方案评价。

### 6.3 Browser Agent 边界

Browser Agent 只能操作当前小红书页面暴露的有限动作，例如点击可见元素、翻页、滚动、截图、保存候选、关闭和重试。它不能登录、处理验证码、点赞、收藏、关注、评论、发布或绕过平台安全限制。

### 6.4 当前风险

- `429` 可能代表请求频率、Token 配额或 API 余额耗尽；当前研究 Worker 不会自动更换 Key。
- 本地默认模型配置仅适合开发，生产需要有 SLA、限额管理和可观测性的公司批准服务。
- 当前 Web API 和 Worker 各有一份 Agent Runtime，整合时应收敛为共享协议和错误模型。
- 视觉平台 DOM 变化、登录状态和限流会影响采集稳定性。

## 7. 数据管理

### 7.1 服务端数据

| 数据对象 | 存储 | 说明 |
| --- | --- | --- |
| `research_tasks` | D1 | 项目载荷、状态、owner、Worker、进度、错误、重试次数 |
| `research_candidates` | D1 | 候选案例、摘要、指标、评论、选择和排除状态 |
| `research_evidence` | D1 | 正式研究证据及事实/解释/启示字段 |
| `research_strategies` | D1 | 策略结果、证据 ID、模型和时间 |
| `research_visual_samples` | D1 | 平台视觉样本、趋势、特征、类型、相关度和选择理由 |
| `research_worker_pairs` | D1 | owner 与本地 Worker 的哈希配对令牌 |
| 截图与媒体 | R2 | 候选截图、多图、证据截图和视觉样本图 |

### 7.2 浏览器本地数据

| 数据 | 存储方式 |
| --- | --- |
| 项目草稿、当前任务、保存项目 | localStorage |
| 个人 AI 配置和设备身份 | localStorage |
| 策略生成、入口和临时流程标记 | sessionStorage |
| 方案原图 | IndexedDB |
| 方案包、评分结果和复盘记录 | 目前主要为 localStorage |

目前同一项目的数据跨 D1、R2、localStorage、sessionStorage 和 IndexedDB 分布。它能支持单机原型，但不是团队协作的最终数据架构。

### 7.3 主要 API

| API | 作用 |
| --- | --- |
| `POST /api/research/tasks` | 创建归属于当前用户/设备的任务 |
| `GET/PATCH /api/research/tasks/:id` | 查询状态、启动/恢复任务、回写进度 |
| `POST /api/research/tasks/claim` | 配对 Worker 领取 owner 的待执行任务 |
| `/api/research/tasks/:id/candidates` | 候选案例读写、人工选择和排除 |
| `/api/research/tasks/:id/evidence` | 正式证据读写 |
| `/api/research/tasks/:id/visual-samples` | 视觉样本读写和清理 |
| `/api/research/tasks/:id/strategies` | 生成或读取证据驱动策略 |
| `POST /api/workers/pair` | 生成本机 Worker 配对信息 |
| `POST /api/meeting-context` | 提炼项目背景 |
| `POST /api/solution-analysis` | 识别方案设计点 |
| `POST /api/solution-review` | 生成基础评价 |

## 8. 部署现状与目标

### 当前能力

- 项目已经具备 Cloudflare Worker、D1、R2 的部署结构。
- `.openai/hosting.json` 声明了 `DB` 和 `EVIDENCE` 绑定。
- 本地开发通过 Cloudflare Miniflare 保存项目级状态。
- GitHub 当前远端为 `effiezhu0-0/design-lab`，另有 Sites 托管远端。

### 目标路径

共享对话确定的方向是：

```text
GitHub 或公司代码仓库
→ PR 审核并合并 main
→ 公司 CI/CD / 部署平台
→ 第一阶段公司内网域名
→ 安全与合规评估后再考虑公网环境
```

部署前必须确认：

- 公司是否允许使用 GitHub，或需要迁移至内部 Git。
- JoyCode / DevCloud 等平台是否支持当前 Node、Worker、D1/R2 或等价服务。
- 内网环境能否访问所选模型和研究来源。
- 文件、截图、评审结果和用户数据的正式存储位置。
- SSO、权限、项目隔离、审计和密钥管理方案。
- 本地 Playwright Worker 如何与内网部署后的任务 API 安全配对。

不要把内网模型地址、存储地址或域名写死在业务代码中；继续使用环境变量和部署绑定。

## 9. 与多 Agent 评审项目的整合分析

### 9.1 可直接复用

- 页面外壳、侧边栏、项目上下文和三种入口。
- 项目需求、PDF/链接读取和开放度配置。
- 统一 Agent Runtime 配置方式。
- D1/R2 API 模式和 owner/Worker 配对机制。
- 方案图片导入、设计点识别和区域裁切数据。
- 当前“业务诉求 → 策略 → 设计点 → 指标”评价链。
- 归因策略中的证据 ID、用户原话、风险和指标，可直接成为多 Agent 的共享上下文。

### 9.2 建议由靖雯模块接管或替换

- `/api/solution-review` 当前单次、单角色的基础评分逻辑。
- `/projects/score` 当前单一汇总结果界面。
- 评审角色、独立上下文、追问、分歧汇总、采纳状态和报告生成。

现有接口可以作为临时适配层，但不应与新的多 Agent 评审逻辑并行长期维护。

### 9.3 主要冲突风险

1. **数据模型不统一**：研究数据在 D1/R2，方案、评分和复盘主要在浏览器本地。
2. **AI 调用入口重复**：两个项目可能各自封装模型、错误和限流处理。
3. **项目 ID 不统一**：当前研究以 `taskId` 充当项目关联键，评审项目可能有自己的 project/review ID。
4. **流程命名不同**：当前 UI 为“归因结论、方案评价”，共享讨论中为“多 Agent 评审、多维度评分、评审报告”。
5. **样式与组件重复**：合并页面前应先统一基础控件、布局、状态和设计 token。
6. **部署假设不同**：当前研究依赖本地 Chrome Worker，另一模块可能假设所有逻辑都在服务端。
7. **数据库定义漂移**：`db/schema.ts` 仍为空，而实际表结构集中在 `app/api/research/store.ts`；整合前必须建立正式迁移源。
8. **工作区尚有大量未提交修改**：合并前需要先形成可构建、可测试的基线提交，避免把功能整合和历史修改混在同一个 PR。

### 9.4 推荐统一数据对象

```text
Project
├── ProjectBrief / ProjectSource
├── ResearchTask
│   ├── ResearchCandidate
│   ├── ResearchEvidence
│   ├── VisualDirection
│   └── VisualReference
├── StrategyConclusion
├── Solution
│   └── DesignPoint
├── ReviewSession
│   ├── ReviewAgentRun
│   ├── ReviewFinding
│   ├── Decision / Adoption
│   └── ReviewReport
└── Retrospective
    └── MetricResult
```

所有对象应使用稳定 `projectId` 关联；`taskId` 只代表一次异步执行，不再承担项目主键职责。

### 9.5 推荐统一接口边界

- 研究模块输出：`ProjectContext + Evidence[] + StrategyConclusion + VisualDirection[]`。
- 方案模块输出：`Solution + DesignPoint[]`。
- 多 Agent 评审输入：项目上下文、人工确认的证据与策略、方案及设计点、评审任务和角色配置。
- 多 Agent 评审输出：角色意见、问题、分歧、分数、建议、采纳状态和报告。
- 复盘输入：最终方案、采纳决定、预期指标和上线数据。

## 10. 推荐整合步骤

1. 双方分别提交并交换 `PROJECT_OVERVIEW.md`。
2. 备份原项目，保证双方都有可独立恢复的版本。
3. 确定主仓库、`main` 保护规则和 `ruoyan` / `jingwen` 分支。
4. 先统一 `Project`、`Solution`、`DesignPoint`、`ReviewSession` 数据契约。
5. 将当前 localStorage 中的方案、评分和复盘数据迁入统一服务端存储。
6. 将模型调用、个人 API 配置、超时和错误类型收敛为一个共享适配层。
7. 保留研究模块的本地 Worker 边界，为部署后的 Worker 建立明确鉴权协议。
8. 接入靖雯的多 Agent 评审模块，替换当前单 Agent 评价实现。
9. 跑通最小闭环：`上传方案 → 多 Agent 评审 → 多维度评分 → 评审报告`。
10. 验证完整闭环：`项目需求 → 调研 → 归因 → 评审 → 复盘`。
11. 建立合并前检查：构建、测试、数据库迁移检查、API 契约检查和关键流程回归。
12. 确认公司内网部署平台，再配置 CI/CD、密钥、数据服务和域名。

## 11. 协作约定建议

- `main` 始终保持可构建、可运行。
- 若焉在独立分支维护研究、视觉参考和公共框架。
- 靖雯在独立分支维护多 Agent 评审、评分和报告。
- 跨模块改动先更新共享类型或接口文档，再修改各自实现。
- 每个 PR 写清影响页面、API、数据结构、迁移和验证结果。
- 合并前由 Codex 做代码审查，并在测试分支验证组合流程。
- 合并后双方立即同步最新 `main`，避免长期分叉。

## 12. 当前优先决策

在开始代码合并前，需要双方共同确认：

1. 哪个项目作为主仓库和主应用外壳。
2. 多 Agent 评审需要哪些研究与策略字段。
3. 统一 `projectId` 和服务端数据模型。
4. 哪些本地状态必须迁移到服务端。
5. 生产模型服务、额度、错误处理和数据合规要求。
6. 内网部署平台及其数据库、对象存储、Worker/容器能力。
7. 本地研究 Worker 在内网环境中的安装、配对和升级方式。

完成以上决策后，再进入功能迁移，可以显著减少重复开发和后续返工。

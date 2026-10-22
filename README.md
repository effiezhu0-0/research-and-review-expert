# 设计调研与评审专家

面向设计师的营销互动研究工具。用户在可视化看板中创建项目，后台
Playwright Worker 使用专用 Chrome 搜索和浏览小红书，并在固定规则失败时调用
受限的视觉恢复 Agent，将候选帖子、完整详情
截图、多图内容和代表性评论保存到案例区，供设计师勾选、收藏或排除。

## 当前功能

- 可视化项目需求录入和研究进度展示
- 根据项目名称、营销目标和玩法类型生成研究关键词
- 每次测试最多使用 3 个关键词
- 每个关键词最多保存 3 个帖子详情
- 从小红书首页通过真实搜索框执行搜索
- 点击当前可见的搜索结果卡片进入详情
- 识别登录、安全验证、访问频繁和不可访问帖子
- Playwright 固定流程只负责打开首页、输入关键词并进入搜索结果
- GPT-5.5 负责候选点击、详情确认、多图翻页判断和评论区定位
- Playwright 在 Agent 决策后负责稳定截图、连续滚动、关闭详情和保存
- 所有 Agent 动作通过受限工具执行，不开放任意浏览器、文件或数据库权限
- 多图使用独立的 `next_media` / `previous_media` 工具，可处理无文字的 div/svg 箭头
- Agent 仅能点击当前可见元素、按 Escape、重试、结束或请求人工接管
- 单任务 Agent 调用次数可配置，模型不可用时自动退回固定规则
- 多图帖子自动向右查看，发现没有新画面后停止
- 保存每一张完整帖子详情截图
- 滚动评论区域并保存代表性评论
- 案例卡片支持多图左右切换
- 评论与对应帖子合并展示
- 支持选择为依据、收藏、查看来源和排除

## 技术结构

```text
设计师操作看板
      ↓
Next.js / vinext 任务 API
      ↓
Playwright Research Worker
      ↓
专用 Chrome / 小红书
      ↓
D1 保存任务和案例数据
R2 保存帖子截图
      ↓
案例看板实时展示
```

GPT-5.5 只参与需要看懂页面的关键决策：选择帖子、确认详情、判断下一张和定位
评论区。截图、连续评论滚动、关闭和保存使用确定性流程，减少模型调用和等待。

## 环境要求

- macOS
- Node.js `>=22.13.0`
- Google Chrome
- 可正常访问小红书

## 安装

```bash
npm install
```

项目使用 `playwright-core` 连接本机专用 Chrome，不会额外下载 Chromium。

## 启动

```bash
npm run design-lab
```

启动器会统一启动：

1. 本地设计看板
2. 使用独立用户目录的专用 Chrome
3. Playwright Research Worker 与按需视觉恢复 Agent

看板地址：

```text
http://localhost:3000
```

停止全部由启动器创建的服务：

```text
Ctrl + C
```

## 第一次使用

1. 运行 `npm run design-lab`。
2. 在打开的专用 Chrome 中登录小红书。
3. 回到看板创建项目并点击“开始研究”。
4. Worker 会依次搜索最多 3 个关键词。
5. 每个关键词最多保存 3 个可访问的帖子详情。
6. 研究完成后，在案例区勾选采用、收藏或排除案例。

小红书登录信息保存在专用 Chrome 用户目录中，不会提交到 Git。

## 研究流程

```text
领取看板任务
→ 打开小红书首页
→ 检查登录或安全验证
→ 输入关键词并点击真实搜索按钮
→ 确认搜索结果页
→ 读取当前可见帖子
→ 立即点击候选卡片
→ 验证真实详情弹层
→ 浏览多张图片
→ 滚动评论区域
→ 保存完整截图、正文和评论
→ 关闭详情并处理下一条
→ 将候选展示到案例区
```

## 常用命令

```bash
# 启动完整本地环境
npm run design-lab

# 仅启动看板开发服务
npm run dev

# 仅启动 Playwright Worker
npm run agent:worker

# 生产构建检查
npm run build

# ESLint 检查
npm run lint
```

## 主要目录

```text
app/
  api/research/                 研究任务、候选和截图 API
  components/                   看板组件
  projects/                     项目流程页面

scripts/
  playwright-research-worker.mjs  当前 Playwright 研究服务
  research-browser-agent.mjs       受限的 GPT-5.5 页面恢复 Agent
  start-design-lab.mjs            一键启动器
  browser-agent-worker.mjs        旧版 CDP Worker，保留作参考

migrations/                     数据库迁移
```

## 本地数据与隐私

以下内容已在 `.gitignore` 中排除，不会推送到 GitHub：

- `.env*`
- `.wrangler/` 本地 D1 与 R2 数据
- `.design-lab/` 启动状态
- `node_modules/`
- 构建输出

不要将小红书 Cookie、验证码、浏览器用户目录或任何 API Key 手动加入仓库。

## 已知限制

- 小红书页面结构或交互更新后，浏览规则可能需要调整。
- 登录失效、验证码、访问频繁和账号风控无法由 Playwright绕过。
- 当前候选相关性主要使用本地规则判断，没有使用模型语义分析。
- 当前 Agent 不负责登录、验证码、点赞、收藏、关注、评论、发布、支付或绕过平台
  安全验证。
- 内网 GPT-5.5 基础授权无 SLA，只适合开发调试，不能作为生产唯一依赖。
- 已采集的旧案例不会自动补抓后来新增的多图和评论字段。

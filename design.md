# 设计调研与评审专家 — Design specification

> **Source of truth:** [Design Lab Design System in Figma](https://www.figma.com/design/c1VemCIxba0f7oZkJ9fSvT/Design-Lab-Design-System?node-id=7-3)
>
> 本文件是共同开发的设计规范。Figma 为 tokens、组件与文字样式的最终来源；代码不得自行扩充未批准的色阶、字号或组件状态。

## Principles

- **Warm neutral first**：用暖灰画布、白色面板与 1 px 边框建立层级，不默认加阴影。
- **White means selected**：选中使用白色 `surface/selected` 和 `border/strong`，不用紫色或分类色铺底。
- **Violet is punctuation**：紫色只用于链接、AI 提示和少量强调；Primary Button 保持深色。
- **Semantic before primitive**：页面与组件使用 semantic tokens，不直接使用 primitive 色值。
- **Auto Layout by default**：组件使用 Auto Layout；padding、gap 与 radius 均绑定现有 tokens。

## Token architecture

| Collection | Purpose |
|---|---|
| `Primitives / Color` | 原始色值，仅用于维护 token |
| `Semantic / Color` | 组件和业务页面的颜色入口 |
| `Foundation / Spacing` | `space/*` 的 gap 与 padding |
| `Foundation / Radius` | `radius/*` 圆角 |
| Typography collection + text styles | 字号变量与最终文字样式 |

### Primitive colors

| Token | Value | Token | Value |
|---|---:|---|---:|
| `neutral/0` | `#FFFFFF` | `neutral/50` | `#F7F6F5` |
| `neutral/75` | `#F1EEEB` | `neutral/100` | `#EAE6E2` |
| `neutral/200` | `#D5D0CB` | `neutral/500` | `#827C76` |
| `neutral/700` | `#24211F` | `neutral/900` | `#191715` |
| `violet/50` | `#EEEAF6` | `violet/100` | `#DDD8EF` |
| `violet/500` | `#6D4ABF` | `violet/700` | `#4A2A8E` |
| `orange/50` | `#FFF1E5` | `orange/500` | `#FF7800` |
| `green/50` | `#E9F1EB` | `green/500` | `#1AA145` |
| `red/50` | `#FFE7E9` | `red/500` | `#FF0F23` |
| `pink/50` | `#FEE5F4` | `pink/500` | `#F4008E` |
| `amber/500` | `#EC9B00` | `blue/500` | `#177DE6` |

### Semantic colors

| Token | Value | Use |
|---|---:|---|
| `bg/canvas` | `#F7F6F5` | 页面背景 |
| `bg/panel` / `surface/primary` | `#FFFFFF` | 卡片与内容面板 |
| `bg/sidebar` / `surface/secondary` | `#F1EEEB` | 侧栏、次级容器 |
| `surface/hover` | `#F7F6F5` | 中性 hover |
| `surface/selected` | `#FFFFFF` | 已选项 |
| `text/primary` | `#191715` | 标题、正文、关键数值 |
| `text/secondary` | `#24211F` | 次级信息 |
| `text/muted` / `text/tertiary` | `#827C76` | 标签、提示 |
| `text/inverse` | `#FFFFFF` | 深色背景文字 |
| `border/default` | `#EAE6E2` | 默认边框 |
| `border/strong` | `#D5D0CB` | 选中、强调边框 |
| `interactive/primary` | `#191715` | Primary Button |
| `interactive/hover` | `#24211F` | 深色操作 hover |
| `interactive/disabled` | `#EAE6E2` | 禁用表面 |
| `accent/primary` | `#6D4ABF` | 链接、AI 强调 |
| `accent/surface` | `#DDD8EF` | 浅紫强调面 |
| `status/success` / `warning` / `error` / `info` | `#1AA145` / `#EC9B00` / `#FF0F23` / `#177DE6` | 状态反馈 |

### Direction categories

| Direction | Main | Surface |
|---|---:|---:|
| 互动设计 | `#F4008E` | `#FEE5F4` |
| 大促设计 | `#FF7800` | `#FFF1E5` |
| 品牌设计 | `#FF0F23` | `#FFE7E9` |

分类色只用于方向识别、Direction Card 图标容器和同类标记，不替代通用选中或交互状态。

## Typography

- Font family: **PingFang SC**；只使用当前 `Regular`、`Medium` text styles。
- 所有文字绑定 Figma text style，不在页面里临时定义字号、字重或行高。

| Style | Weight | Size / line height | Use |
|---|---|---:|---|
| `Display` | Medium | `48 / 48` | 少量主展示数值、空状态主标题 |
| `Heading/Page` | Medium | `32 / 32` | 页面标题 |
| `Heading/Section` | Medium | `24 / 24` | 区块标题 |
| `Heading/Card` | Medium | `18 / 18` | 卡片、步骤标题 |
| `Body/Default` | Regular | `16 / 22` | 正文、输入内容 |
| `Body/Compact` | Regular | `14 / 20` | 次级正文、辅助信息 |
| `Label` | Medium | `14 / 14` | 按钮、字段名、标签 |
| `Caption` | Regular | `12 / 12` | 时间、来源等极短元信息 |

## Layout and icons

- Spacing: `2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64`。
- Radius: `4, 6, 8, 10, 12, 16`；紧凑控件用 `6–8`，普通输入、按钮、卡片用 `10–12`，大容器使用 `16`。
- 文本通常 Hug contents，可拉伸的输入和卡片内容区用 Fill container，图标保持 Fixed。
- 图标仅用 **Strange Icons → Nightingale → Regular** 的 SVG；视觉尺寸只能为 **16 / 20 / 24 px**。
- Icon Button 最小交互目标为 **40 × 40 px**；禁止 emoji、Unicode 字符图标和其它线宽风格。

## Current component inventory

只复用本表中现有 variants；需要新状态时先在 Figma 补齐组件与 token bindings。

| Component | Variants | Use |
|---|---|---|
| `Button` | `Primary/Default`, `Secondary/Default`, `Ghost/Default`, `Primary/Disabled` | 主、次、低优先级操作 |
| `Chip` | `Default`, `Selected`, `Custom` | 单选节点、筛选、自定义项 |
| `TextField` | `Default`, `Focus`, `Error`, `Disabled` | 文本输入 |
| `Card` | `Default`, `Selected` | 通用内容与方案选择 |
| `DirectionCard` | `Interaction/Marketing/Brand` × `Default/Hover/Selected` | 设计方向选择 |
| `NavigationItem` | `Default`, `Active` | 导航 |
| `Step` | `Future`, `Active`, `Complete` | 创建流程、进度 |
| `Notice` | `Information`, `Success`, `Warning`, `Error` | 系统反馈 |
| `IconButton` | `Default`, `Selected`, `Destructive`, `Disabled` | 图标级操作 |
| `ProjectMode` | `New project`, `Project iteration` | 项目模式 |
| `ProgressBar` | `Queued`, `Running`, `Complete`, `Failed` | 异步任务状态 |
| `EvidenceCard` | `Default`, `Selected` | 调研证据浏览与采纳 |

## Product conventions

- 设计方向顺序：**互动设计 → 大促设计 → 品牌设计**。
- 项目模式：**新项目**、**项目迭代**。
- 活动节点为单选：**618、双11、年货节、跨年、中秋节、端午节、圣诞节、七夕、情人节、自定义**。
- 主看板管理项目、调研、策略、方案与现有方案评分；角色评审模块读取同一项目和方案上下文，承担评审、追问和总结。
- 现有方案评分保持独立，直至双方明确角色评审接入后的统一评分模型。

## Handoff checklist

- [ ] 页面背景是 `bg/canvas`，内容卡片是 `surface/primary`。
- [ ] 选中卡片与 chip 使用白色 selected surface，并有 `border/strong` 或既有 selected variant。
- [ ] 所有颜色、间距、圆角、字体都能映射到 Figma token 或 text style。
- [ ] 图标遵守 Nightingale Regular 与 16 / 20 / 24 px 规范。
- [ ] 没有新增未审批色阶、字体层级、阴影或组件状态。

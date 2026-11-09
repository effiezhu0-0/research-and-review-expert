# 设计调研与评审专家 — DESIGN.md

> **Source of truth:** [Design Lab Design System in Figma](https://www.figma.com/design/c1VemCIxba0f7oZkJ9fSvT/Design-Lab-Design-System?node-id=7-3)
>
> **Scope:** 项目看板、项目新建、调研证据、策略、方案与后续角色评审。本文记录当前已落地的 Figma tokens、文字样式与组件；代码实现不得凭空扩充色阶或组件状态。

## 1. Design intent

这是一个面向设计师的研究与决策工作台，而不是营销型后台。界面应安静、清晰、可追溯：证据、结论和下一步行动优先于装饰。

- **Warm neutral first.** 画布、面板和边框以暖灰建立层级；不使用冷蓝灰替代。
- **White means selected.** 选中为白色表面 `surface/selected` 加深边框 `border/strong`；不能用紫色或分类色铺满选中项。
- **Violet is punctuation.** 紫色只用于链接、AI 提示与少量强调，不能成为默认按钮或通用选中背景。
- **Semantic before primitive.** 业务页面与组件只使用 semantic tokens；primitive 仅用于建立、维护 semantic token。
- **Flat and structured.** 用表面、1 px 边框和留白分层；默认不使用阴影。
- **Auto layout by default.** 组件内部相关元素必须使用 Auto Layout；padding、gap、radius 与颜色均绑定现有变量。

## 2. Token architecture

Figma 现有 collections：

| Collection | Purpose |
|---|---|
| `Primitives / Color` | 原始色值；不直接在业务组件中使用 |
| `Semantic / Color` | 组件和业务页面的唯一颜色入口 |
| `Foundation / Spacing` | `space/*` 尺寸与 Auto Layout gap/padding |
| `Foundation / Radius` | `radius/*` 圆角 |
| Typography collection + text styles | 字号变量与最终可用文本样式；实现时以 text style 规格为准 |

代码中的 token 命名与 Figma 语义保持对应。例如：

```css
:root {
  --color-bg-canvas: #F7F6F5;
  --color-surface-primary: #FFFFFF;
  --color-surface-secondary: #F1EEEB;
  --color-surface-selected: #E0DCD7;
  --color-text-primary: #191715;
  --color-text-muted: #827C76;
  --color-border-default: #EAE6E2;
  --color-border-strong: #E0DCD7;
  --color-accent-primary: #6D4ABF;
}
```

不要在业务代码内以十六进制颜色命名变量（如 `--purple`、`--gray-200`）；应以用途命名（如 `--color-text-muted`）。

## 3. Color

### 3.1 Primitive color scale

Primitive 色阶用于 token 维护，不直接用于页面样式。

| Token | Value | Intended source role |
|---|---:|---|
| `neutral/0` | `#FFFFFF` | 白色表面 |
| `neutral/50` | `#F7F6F5` | 暖白画布 |
| `neutral/75` | `#F1EEEB` | 次级表面 |
| `neutral/100` | `#EAE6E2` | 默认边框 |
| `neutral/200` | `#E0DCD7` | 选中表面与强调边框 |
| `neutral/500` | `#827C76` | 弱文字 |
| `neutral/700` | `#24211F` | 次级文字 / hover |
| `neutral/900` | `#191715` | 主文字 / 主操作 |
| `violet/50` | `#EEEAF6` | 浅紫预留色阶 |
| `violet/100` | `#DDD8EF` | accent 表面 |
| `violet/500` | `#6D4ABF` | accent 主色 |
| `violet/700` | `#4A2A8E` | 深紫预留色阶 |
| `orange/50` | `#FFF1E5` | 大促分类表面 |
| `orange/500` | `#FF7800` | 大促分类主色 |
| `green/50` | `#E9F1EB` | 成功浅色 |
| `green/500` | `#1AA145` | 成功 |
| `red/50` | `#FFE7E9` | 错误 / 品牌分类表面 |
| `red/500` | `#FF0F23` | 错误 / 品牌分类主色 |
| `pink/50` | `#FEE5F4` | 互动分类表面 |
| `pink/500` | `#F4008E` | 互动分类主色 |
| `amber/500` | `#EC9B00` | 警告 |
| `blue/500` | `#177DE6` | 信息 |

### 3.2 Semantic color roles

页面和组件必须从本表选择颜色。

| Semantic token | Value | Use |
|---|---:|---|
| `bg/canvas` | `#F7F6F5` | 应用与页面背景 |
| `bg/panel` / `surface/primary` | `#FFFFFF` | 卡片、表单、内容面板 |
| `bg/sidebar` / `surface/secondary` | `#F1EEEB` | 侧栏、次级容器 |
| `surface/hover` | `#EAE6E2` | 唯一的中性 hover 表面 |
| `surface/selected` | `#E0DCD7` | 中性选中表面，如已选 chip |
| `text/primary` | `#191715` | 标题、正文、关键数值 |
| `text/secondary` | `#24211F` | 次级信息 |
| `text/muted` / `text/tertiary` | `#827C76` | 标签、提示、辅助说明 |
| `text/inverse` | `#FFFFFF` | 深色操作中的文字 |
| `border/default` | `#EAE6E2` | 默认边界与分隔线 |
| `border/strong` | `#E0DCD7` | 需要强调的边界 |
| `interactive/primary` | `#191715` | Primary Button 背景 |
| `interactive/hover` | `#24211F` | 深色操作 hover |
| `interactive/disabled` | `#EAE6E2` | 禁用操作表面 |
| `accent/primary` | `#6D4ABF` | 链接、AI 结果、有限强调 |
| `accent/surface` | `#DDD8EF` | accent 的浅表面 |
| `status/success` | `#1AA145` | 完成、成功通知 |
| `status/warning` | `#EC9B00` | 风险、待注意状态 |
| `status/error` | `#FF0F23` | 失败、错误通知 |
| `status/info` | `#177DE6` | 信息提示 |

### 3.3 Direction category colors

分类色只用于设计方向识别、Direction Card 图标容器或同一语义的标记；不取代通用交互和选中状态。

| Direction | Main token | Surface token | Main value | Surface value |
|---|---|---|---:|---:|
| 互动设计 | `category/interaction` | `category/interaction-surface` | `#F4008E` | `#FEE5F4` |
| 大促设计 | `category/marketing` | `category/marketing-surface` | `#FF7800` | `#FFF1E5` |
| 品牌设计 | `category/brand` | `category/brand-surface` | `#FF0F23` | `#FFE7E9` |

设计方向的产品顺序固定为：**互动设计 → 大促设计 → 品牌设计**。

## 4. Typography

### 4.1 Typeface and rules

- Font family: **PingFang SC**。
- 所有文本优先绑定对应 Figma text style，而非页面内手填字号。
- 字重仅在当前 styles 中使用 `Regular` 与 `Medium`；不要人为新增 Semibold/Bold 层级。
- 中文、英文与数字均使用同一字体栈，避免混用展示字体。

### 4.2 Type scale

| Figma text style | Weight | Size / line height | Typical use |
|---|---|---:|---|
| `Display` | Medium | `48 / 48` | 极少量仪表盘主展示数值或空状态主标题 |
| `Heading/Page` | Medium | `32 / 32` | 页面标题 |
| `Heading/Section` | Medium | `24 / 24` | 区块标题 |
| `Heading/Card` | Medium | `16 / 20` | 通用 Card 标题、步骤标题 |
| `Body/Default` | Regular | `16 / 22` | 正文、输入内容、主要说明 |
| `Body/Compact` | Regular | `14 / 20` | 次级正文、列表辅助信息 |
| `Label` | Medium | `14 / 14` | 按钮、标签、表单字段名 |
| `Caption` | Regular | `12 / 12` | 时间、来源、极短辅助信息 |

排版层级按“页面 → 区块 → 卡片 → 正文 → 辅助信息”收敛。正文默认使用 `Body/Default`；只有信息密度确有需要时才降为 `Body/Compact`。不以小字和浅色同时承载关键结论。

## 5. Layout, spacing and shape

### 5.1 Spacing scale

`space/2`, `space/4`, `space/6`, `space/8`, `space/10`, `space/12`, `space/16`, `space/20`, `space/24`, `space/32`, `space/40`, `space/48`, `space/64`。

建议用法：

| Token | Preferred use |
|---|---|
| `2–6` | 图标与微型文字的细微调整；不作为卡片主 padding |
| `8–12` | 紧凑控件内部 gap、chip、输入框 |
| `16–20` | 按钮、卡片内部内容、表单字段组 |
| `24–32` | 卡片区块、同级内容组 |
| `40–64` | 页面区块之间、空状态与大容器 |

### 5.2 Radius scale

`radius/4`, `radius/6`, `radius/8`, `radius/10`, `radius/12`, `radius/16`。

保持克制：紧凑控件优先 `6–8`；普通输入、按钮与卡片使用 `10–12`；大容器才使用 `16`。不要在同一组件内混用多个圆角值。

### 5.3 Auto Layout rules

- 组件根节点必须为 Auto Layout frame；水平或垂直方向由内容关系决定。
- 固定高度只用于触控目标、进度轨道等明确规格；文字容器应可随内容增长。
- 内部 padding 与 item gap 必须选用 `space/*`，圆角选用 `radius/*`。
- 文本用 Hug contents；可拉伸的输入与卡片内容区用 Fill container；图标保持 Fixed。
- 组件实例不得通过手动挪动子图层来修正间距。若内容密度需要变化，应新增受控 variant 或调整 Auto Layout token。

## 6. Iconography

- 唯一图标来源：**Strange Icons → Nightingale → Regular**。
- 视觉尺寸只使用 **16 / 20 / 24 px**。
- Icon Button 的最小交互目标为 **40 × 40 px**；图标本身不因目标变大而放大。
- 图标颜色继承语义：默认 `text/secondary`，选中或强调视情况使用 `accent/primary`，破坏性操作使用 `status/error`。
- 使用导入的 SVG / 已建 icon component；不要用 emoji、Unicode 符号或其它线宽风格代替。

### Context icon assignment

| Context | Icon | Size | Rule |
|---|---|---:|---|
| 具体项目（侧栏、项目列表） | `File / Regular` | `18 / 20 px` | 所有项目统一使用 File，不以首字母、文件夹或分类色替代 |
| 我的任务 | `Calendar Check / Regular` | `20 px` | 表达可执行且有时间属性的待办 |

这两个 SVG 作为产品内已批准的 Nightingale Regular 图标实例，使用 `currentColor` 继承语义文字颜色。

## 7. Current component inventory

下表是当前 Figma Components 页面已存在的 component sets 与可用 variants。实现时不得假定未列出的状态已经设计完成。

| Component | Available variants | Product use |
|---|---|---|
| `Button` | `Primary / Default`, `Secondary / Default`, `Ghost / Default`, `Primary / Disabled` | 明确提交、次级操作、低优先级操作 |
| `Chip` | `Default`, `Selected`, `Custom` | 单选活动节点、筛选与可自定义项 |
| `Label` | `Default`（互动）、`State2`（大促）、`State3`（品牌） | 用分类色识别项目方向，不表示选中状态 |
| `Dropdown / 下拉菜单` | 收起、触发器悬停、展开、选项悬停、已选择 | 从有限选项中单选，例如项目阶段 |
| `TextField` | `Default`, `Focus`, `Error`, `Disabled` | 项目名称、文本输入；44px 高、8px 圆角、水平内边距 12px，输入内容使用 `14 / 20`，字段标签使用 `12 / 16`、与输入框间距 8px |
| `Card` | `Default`, `Selected` | 通用内容卡片、方案或证据选择；12px 圆角、20px padding、12px 内容 gap |
| `DirectionCard` | `Interaction / Marketing / Brand` × `Default / Hover / Selected` | 项目方向选择 |
| `NavigationItem` | `Default`, `Active` | 左侧或局部导航 |
| `Step` | `Future`, `Active`, `Complete` | 项目创建流程与进度 |
| `Notice` | `Information`, `Success`, `Warning`, `Error` | 系统提示与任务反馈 |
| `IconButton` | `Default`, `Selected`, `Destructive`, `Disabled` | 图标级操作 |
| `ProjectMode` | `New project`, `Project iteration` | 项目模式选择 |
| `ProgressBar` | `Queued`, `Running`, `Complete`, `Failed` | 调研、分析与生成任务进度 |
| `EvidenceCard` | `Default`, `Selected` | 调研证据浏览与采纳 |

### Component use rules

- `TextField/Default` 使用 `surface/primary` 与 `border/default`；Focus 使用 `border/strong`，Disabled 使用 `interactive/disabled`，placeholder 使用 `text/muted`。Error 使用 `status/error` 辅助文案。
- `Card/Default` 使用 `surface/secondary`；`Card` / `EvidenceCard` 的 selected variant 以白色表面和 `border/strong` 表达；不要改成紫色实底。选中状态还须保留勾选、单选标记等非颜色线索。
- `Chip/Selected` 仅表示当前选择。活动节点是单选，选择一个即取消其它选项。
- `Chip/Custom` 用于“自定义”活动节点，输入值仍应通过相邻的明确表单控件收集。
- `DirectionCard` 使用既有分类色做识别；选中仍遵循白色表面原则。
- `Label` 使用对应 `category/*` 文字色与浅色表面、胶囊圆角；Figma 标准规格为 14px Medium。项目列表等高密度区域可使用 **12 / 16 px** 的紧凑规格，保持可读性与分类色语义；这是看板实现中的场景扩展，尚未新增为 Figma variant。
- `Dropdown` 的菜单使用 `surface/primary`、`border/default`、12px 圆角、6px 内边距和 2px 选项间距；选项高 40px、水平内边距 12px、8px 圆角，使用 `Body/Compact`。悬停或键盘聚焦用 `surface/hover`；已选项用勾选图标辅助识别，不以紫色铺底。支持键盘切换、Escape 关闭及点击外部关闭。
- 项目列表的阶段触发器为紧凑文字样式，菜单复用上述 Dropdown 结构；选项修改后保存至本地项目记录。
- 主页“新建项目”“最近项目”采用 **20 / 24 px Medium** 的紧凑区块标题；属于页面场景扩展，Figma 原有 `Heading/Section` 仍为 24 / 24。快捷入口的说明与箭头同一水平行居中对齐，箭头使用 16px 图标。
- Primary Button 每个局部操作区通常只有一个；紫色不作为 Primary Button 的默认底色。
- 未设计的 hover、loading、read-only 或复杂组合状态，先使用当前已有 variant 能表达的状态；需要新增时，先补齐 Figma component set 和 token bindings。

## 8. Product conventions

### 8.1 Project creation

- 设计方向顺序：**互动设计、 大促设计、品牌设计**。
- 项目模式：**新项目**、**项目迭代**。
- 活动节点（单选）：**618、双11、年货节、跨年、中秋节、端午节、圣诞节、七夕、情人节、自定义**。
- 创建流程使用 `Step`；字段输入使用 `TextField`；选择项使用 `DirectionCard`、`ProjectMode` 与 `Chip`。

### 8.2 Dashboard information hierarchy

1. 当前项目及状态
2. 调研证据与可追溯来源
3. 策略结论
4. 方案及现有评分
5. 后续角色评审、追问与总结

项目、调研、策略与方案由主看板承载；后续角色评审读取同一项目与方案上下文。现有方案评分保留，待角色评审接入后再有意识地整合为统一体系。

### 8.3 Evidence and feedback

- 单条证据用 `EvidenceCard`；采纳状态只能使用 `Selected` variant。
- 来源、时间、可信度等低优先级元信息用 `Caption` 或 `Body/Compact`，但不得弱化关键结论。
- 异步状态通过 `ProgressBar` 和 `Notice` 表达：排队、执行、完成、失败必须可区分。
- 破坏性或不可逆操作使用 `IconButton/Destructive` 或错误语义，并给出清晰文案。

## 9. Do / don't

| Do | Don't |
|---|---|
| 以 `surface/selected` + `border/strong` 表达选中 | 用紫色大面积铺底表达通用选中 |
| 在组件和页面中绑定 semantic tokens | 直接填 primitive 色值或任意 hex 值 |
| 用 PingFang SC 的既有 text styles | 临时添加独立字号、字重、行高 |
| 用 16/20/24 px Nightingale Regular SVG | 混入 emoji、字符图标或不同线宽图标 |
| 用 Auto Layout 与 spacing/radius tokens 调整布局 | 手动拖移子图层“对齐”组件 |
| 先复用当前 variant，再设计缺失状态 | 在代码里臆造 Figma 未定义的状态 |
| 让分类色仅承担方向识别 | 让分类色替代通用交互或状态颜色 |

## 10. Implementation handoff checklist

- [ ] 页面背景为 `bg/canvas`，内容卡片为 `surface/primary`。
- [ ] 所有选中卡片和 chip 使用 `surface/selected` 或对应分类 selected variant，且有 `border/strong` 或对应现有 variant。
- [ ] 所有颜色、间距、圆角、字体均可映射到 Figma token 或 text style。
- [ ] 项目方向、项目模式和活动节点名称及顺序符合第 8.1 节。
- [ ] 图标只来自 Nightingale Regular，并遵守 16 / 20 / 24 px 尺寸。
- [ ] 提交前检查：没有新增未审批的色阶、字体层级、阴影或组件状态。

---

本文的“颜色 → 字体 → 间距与形状 → 组件 → 使用规则”结构参考了 [Refero 的 token 化设计系统文档组织方式](https://styles.refero.design/style/a73148b9-449b-42cd-9f38-86ef694f500e)；所有具体视觉值与组件范围均以 Design Lab 当前 Figma 文件为准。

# Research & Review Expert

共同开发仓库：以「设计调研与评审专家」看板为主界面，并在同一项目上下文中接入角色评审、追问与总结。

## Collaboration scope

| Area | Owner | Description |
|---|---|---|
| 项目、调研、策略、方案 | 若焉 | 主看板与方案评分 |
| 角色评审、追问、总结 | 靖雯 | 读取主看板内的项目和方案上下文 |
| 方案评分融合 | Joint | 现有评分先保留；角色评审接入后共同定义统一评分体系 |

## Repository map

```text
apps/
  board/                 # 主看板应用（后续从本地看板迁入）
  review/                # 角色评审、追问与总结
packages/
  ui/                    # 跨产品复用的 UI 与 design tokens
  shared-types/          # 项目、方案、评审的共享类型
docs/
  architecture.md        # 边界、数据流与集成约定
  workflows.md           # 协作、分支与交付流程
design.md                # 共同的设计实现规范
```

## Start here

1. 阅读 [design.md](./design.md)，所有界面实现遵守 Figma tokens、文字样式和组件规范。
2. 阅读 [docs/architecture.md](./docs/architecture.md)，确认应用边界和共享数据契约。
3. 阅读 [docs/workflows.md](./docs/workflows.md)，按独立分支协作。

当前仓库仅包含协作骨架和文档；现有本地看板尚未迁入，也不会因本次初始化被推送。

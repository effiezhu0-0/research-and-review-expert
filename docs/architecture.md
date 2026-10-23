# Architecture

## Product boundary

`apps/board` 是共同产品的主界面，负责项目、调研、策略、方案与现有方案评分。`apps/review` 负责角色评审、追问和总结；它必须读取同一项目与方案上下文，而不是复制一套独立项目数据。

```text
项目 → 调研证据 → 策略 → 方案与现有评分
                         ↓
                 角色评审 → 追问 → 总结
```

## Shared contracts

在 `packages/shared-types` 中维护跨应用共享的数据类型，至少包括：

- `Project`：项目基本信息、方向、项目模式、活动节点。
- `ResearchEvidence`：证据内容、来源、时间、可信度与采纳状态。
- `Strategy`：由调研沉淀的策略结论。
- `Solution`：方案内容与当前方案评分。
- `ReviewSession`：角色、追问记录、评审结论与总结。

角色评审接入前，现有方案评分是主看板的独立能力。评审接入后，由双方共同定义评分模型与迁移策略，不在早期直接替换原有评分。

## Package ownership

| Location | Purpose | Rule |
|---|---|---|
| `apps/board` | 项目和方案工作流 | 只消费 shared types，不定义 review 专属模型 |
| `apps/review` | 角色评审工作流 | 读取 project / solution 上下文，不复制数据源 |
| `packages/ui` | 复用 UI、tokens、图标封装 | 遵循根目录 `design.md` |
| `packages/shared-types` | 跨应用数据契约 | 变更须同时评估两个应用 |

## Migration principle

现有本地看板完成后，再以独立提交迁入 `apps/board`。迁入前不将未完成页面、个人配置、`.env`、数据库凭据或本地缓存带入本仓库。

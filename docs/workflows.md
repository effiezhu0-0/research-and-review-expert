# Collaboration workflow

## Branches

- `main`：稳定、可演示的共同版本；仅通过 Pull Request 合并。
- `feature/board-*`：主看板、调研、策略、方案相关工作。
- `feature/review-*`：角色评审、追问、总结相关工作。
- `chore/*`：文档、依赖与工程维护。

不要直接向 `main` 推送。每项功能从最新 `main` 创建分支，完成后提交 Pull Request，由另一位协作者审阅再合并。

## Pull Request checklist

- [ ] 变更范围只覆盖一个明确目标。
- [ ] 不包含 `.env`、访问令牌、数据库凭据、用户数据或本地缓存。
- [ ] UI 使用根目录 `design.md` 中已有的 token、字体、图标和组件规则。
- [ ] 涉及共享数据时，已同步更新 `packages/shared-types` 与相关文档。
- [ ] 在 PR 描述中说明影响的应用、测试方式与待讨论项。

## Working agreement

先让主看板的项目与方案成为可信的单一上下文；评审模块通过共享契约读取它。需要跨范围修改、调整评分模型或变更共享数据结构时，先在 issue / PR 中对齐，再实施代码变更。

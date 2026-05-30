# PromptHub Workflow Verification

`spec/workflow/04-verification/README.md` 是 PromptHub 当前项目级 verification 主入口，对齐最新 `spec-init` 的 workflow/verification 边界，回答“怎么证明做对了”。

## 当前验证原则

- 高优先级需求必须有自动化验证
- bug fix 必须补回归测试
- 测试应验证行为，而不是堆覆盖率数字
- 需求、设计、验证、任务之间应尽量形成追踪链

## 当前验证真相源

- `AGENTS.md` 中的测试标准
- 各 active change 的 `tasks.md` / `implementation.md`
- 已存在的单元、集成与 E2E 测试文件

## 当前推荐做法

- 项目级长期验证策略逐步沉淀到这里
- 单次变更的验证计划继续写在对应 change 中

## 当前稳定补充

- Cloudflare worker / self-hosted 分支型实现如果进入仓库长期维护范围，至少需要具备独立的 `typecheck`、`lint`、`test` 和构建验证，而不能只依赖主应用验证结果。
- 若变更影响 monorepo 内的 package export / workspace 接入，还必须补根级构建验证，确保真实调用链不会因 `exports` 缺失或 lockfile 未更新而在构建阶段失败。
- 发布候选应优先运行根级 `pnpm verify:release` harness；本地快速排查可先运行 `pnpm verify:release:quick`，但 quick profile 不能替代发布准入。
- 新增或修复线上 bug 时，应先把失败归类到最低有效验证层：shared package typecheck、app lint/typecheck、unit、integration、performance、bundle、E2E smoke 或 packaging。避免通过多个聚合脚本重复运行同一层来制造“已验证”的错觉。
- Skill 相关发布风险必须先对照 `spec/knowledge/reference/skill-defect-taxonomy.md` 给问题定性，再对照 `spec/knowledge/reference/skill-regression-test-matrix.md` 说明哪些测试项已覆盖、哪些尚未覆盖。

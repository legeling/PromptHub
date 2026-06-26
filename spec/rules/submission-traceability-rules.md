# PromptHub Submission and Traceability Rules

本规则定义 PromptHub 的提交、commit、文档编号和引用关联要求。它适用于人类贡献者和 AI agent。

## 1. 提交边界

- AI agent 不得自动 commit；只有用户明确要求“提交 / commit / 分批提交 / 推送”时才能执行 git 提交动作。
- 提交前必须先查看 `git status --short`，区分本轮改动、用户改动和其他 agent 改动。
- 不得 stage 或提交与本轮目标无关的脏文件。
- 每个 commit 必须是一个独立、可回滚的逻辑单元；不要把功能、bugfix、文档迁移和格式化混成一个提交。
- 大改动应按可验证边界分批提交，例如 `docs`、`test`、`fix`、`feat`、`refactor` 分开。
- 如果远端或工作区存在其他 agent 的并行改动，提交前必须再次确认 status，并只提交当前批次文件。

## 2. Commit Message

PromptHub 使用 Conventional Commits：

```text
<type>(optional-scope): <imperative summary>
```

常用类型：

- `feat`: 新功能或用户可见能力
- `fix`: bug 修复
- `docs`: 文档、spec、README、贡献指南
- `test`: 测试补充或测试基础设施
- `refactor`: 不改变外部行为的结构调整
- `perf`: 性能优化
- `chore`: 构建、脚本、依赖、发布辅助
- `style`: 纯格式或样式调整，且不改变行为

要求：

- summary 使用祈使语气，简短描述“做什么”，例如 `fix: skip web auth captcha when disabled`。
- scope 可选，但建议用于跨域仓库，例如 `fix(web): ...`、`docs(spec): ...`、`feat(desktop): ...`。
- commit body 应在需要时记录验证命令、风险和文档关联。
- 不要在 commit message 中写密钥、真实部署地址、私有路径或个人账号信息。

推荐 body 格式：

```text
Refs: spec/changes/active/<change-key>
Refs: #<issue-number>

Verification:
- pnpm --filter <package> test -- --run <test-file>
- pnpm --filter <package> typecheck
```

只有在目标版本已经发布、且确实要关闭 GitHub issue 时，才使用 `Closes #<issue-number>`。本地实现完成但尚未发布时使用 `Refs #<issue-number>`，并在 `spec/issues/active/local-github-status.md` 标记本地状态。

## 3. 文档编号

非 trivial change 必须在 `spec/changes/active/<change-key>/` 中维护可追踪编号。

默认编号：

- `FR-001`, `FR-002`: 功能需求
- `NFR-001`, `NFR-002`: 非功能需求
- `AC-001`, `AC-002`: 验收标准
- `DES-001`, `DES-002`: 设计决策或设计约束
- `TEST-001`, `TEST-002`: 验证项或测试策略
- `T-001`, `T-002`: 可执行任务

领域较大的 change 可以使用领域前缀：

- `FR-SKILL-001`
- `DES-PLUGIN-001`
- `TEST-MCP-001`
- `T-WEB-001`

编号规则：

- 同一 change 内编号必须稳定；已经被引用的编号不得随意重排。
- 删除或替换需求时，保留原编号并标记 `Superseded by ...`，不要把后续编号整体前移。
- 同一条追踪链内建议使用一致的领域前缀，避免 `FR-SKILL-001` 链到 `DES-001` 造成歧义。
- 稳定文档里的长期编号可以被 active change 引用，但 active change 内仍应有自己的 delta 编号。

## 4. 引用关联

每个非 trivial change 至少维护以下文件：

- `proposal.md`
- `specs/<domain>/spec.md`
- `design.md`
- `tasks.md`
- `implementation.md`

最低追踪链：

```text
FR-001 -> DES-001 -> TEST-001 -> T-001
```

推荐在 `specs/<domain>/spec.md` 或 `design.md` 中增加 Traceability 表：

| Requirement | Design | Verification | Task |
| --- | --- | --- | --- |
| `FR-001` | `DES-001` | `TEST-001` | `T-001` |

引用要求：

- `proposal.md` 说明为什么做、范围、风险和回滚思路。
- `specs/<domain>/spec.md` 写用户可见或系统可观察的行为，不写实现细节。
- `design.md` 写模块、数据、接口、错误处理、迁移、回滚和权衡。
- `tasks.md` 写可执行动作，并引用对应 `FR / DES / TEST`。
- `implementation.md` 写实际落地内容、验证命令、跳过项、阻塞和同步过的文档。
- 对外用户文档放 `docs/`，内部事实和规则放 `spec/`；不要把同一规则复制成多个互相竞争的真相源。

## 5. 提交前检查清单

提交前至少确认：

1. `git status --short` 中将要提交的文件都属于本批次。
2. 非 trivial change 已有或更新了 `spec/changes/active/<change-key>/`。
3. `FR -> DES -> TEST -> T` 至少覆盖本批次的核心行为。
4. `implementation.md` 已记录实际验证命令和未通过/未运行原因。
5. 稳定文档、对外文档、issue 本地状态按需同步。
6. 运行了最低有效验证，或记录了明确阻塞。
7. commit message 使用 Conventional Commits，并在需要时引用 change、issue 和验证结果。

## 6. PR / 发布关联

- PR 描述应说明动机、影响范围、验证方式、残留风险和相关 active change。
- PR 不应把 “local_done / release_pending” 的 GitHub issue 提前关闭。
- 版本发布后，才根据发布内容关闭对应 GitHub issue，并刷新 `spec/issues/active/github-open.md` 与 `spec/issues/archive/github-closed.md`。
- 发布型 commit 或 PR 应额外引用 `spec/releases/` 中的版本记录。

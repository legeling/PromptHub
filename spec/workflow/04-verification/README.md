# PromptHub 验证入口

测试设计与验收约束只在 [测试标准](../../rules/testing-standards.md) 维护。本文保存命令、fixture 和发布 harness 的项目接入方式；一次任务的执行结果放在已有计划或交付说明中，不另建七份测试文档或强制手工覆盖矩阵。

Skill 领域继续使用 [缺陷分类](../../knowledge/reference/skill-defect-taxonomy.md) 和 [回归矩阵](../../knowledge/reference/skill-regression-test-matrix.md)。E2E 操作说明见 [Playwright 测试协作](../../../docs/testing-playwright-agents.md)；执行仍遵守用户的 GUI 与委派授权。

## Standard Commands

| Scope          | Command                                           | Use                                      |
| -------------- | ------------------------------------------------- | ---------------------------------------- |
| Focused        | `pnpm --filter <package> exec vitest run <files>` | first feedback for the changed invariant |
| Desktop unit   | `pnpm --filter @prompthub/desktop test:unit`      | renderer/main/service regression         |
| Desktop E2E    | `pnpm test:e2e`                                   | critical Electron workflows              |
| Root quick     | `pnpm verify:release:quick`                       | local multi-package diagnosis            |
| Root changed   | `pnpm verify:changed`                             | affected-surface local/PR diagnosis      |
| Root release   | `pnpm verify:release`                             | release approval                         |
| Harness unit   | `pnpm test:verification-harness`                  | registry/executor/report regression      |
| Lint/typecheck | package-specific or root scripts                  | static contract and quality gates        |

## Trigger Rules

- Run focused tests before broader suites.
- Run affected package lint/typecheck for production-code changes.
- Run integration/E2E only when the risk crosses the corresponding boundary.
- Run the full release harness for release candidates and release-risk changes.
- Use `--surface`, `--exclude-layer`, and `--list --format json` for bounded CI
  selection; do not replace the registry with handwritten workflow commands.
- `--report <path>` is opt-in, writes a bounded redacted JSON report, and treats
  an unwritable explicit report path as a command failure.
- A failed aggregate run followed by passing focused tests is not silently
  converted to success; record both the failure and confirmation run.


## 风险用例选择

## Selection Methods

Use the smallest combination that can expose the real risk:

- Equivalence classes for valid/invalid input families.
- Boundary values for empty, zero, one, maximum, oversized, and malformed
  inputs.
- State transitions for install/update/delete/sync/conflict/recovery flows.
- Decision tables for multi-guard policies and platform/source matrices.
- Property or fuzz tests for parsers, paths, identities, and serialized data.
- Fault injection at every external write/read boundary.
- Contract tests across shared types, IPC/preload, routes, CLI, and adapters.
- Concurrency-like repeated actions for deduplication and stale-result guards.
- Security cases for traversal, symlink escape, injection, SSRF-like sources,
  secret handling, and tampering.


## Current Sources

- Shared desktop fixture builders: `apps/desktop/tests/fixtures/`.
- Test-local temporary SQLite databases and filesystem workspaces.
- Repository-local Git fixtures created in temporary directories for clone,
  package, and branch behavior.
- Component fixtures and service mocks colocated with their owning tests when
  they model only one surface.

## Fixture Rules

- Use synthetic, deterministic, non-secret data.
- Never use a developer's real home directory, credentials, tokens, or private
  deployment URLs.
- Filesystem fixtures cover Unicode, special characters, nested paths, hidden
  files, symlinks, duplicate identities, empty packages, and large inventories
  when relevant.
- Network fixtures preserve protocol and error semantics instead of returning
  the expected answer directly.
- Persistence fixtures prove reopen/rescan/reload behavior and clean up their
  temporary resources.
- Normal-path SQLite suites may copy a closed, current-schema template into an
  isolated temporary directory. Migration, lock, corruption, recovery, and
  concurrent-open tests must create their own precondition and bypass the
  template.
- Template lifetime is bounded to the suite/worker setup; teardown closes the
  database before removing the template directory.
- Security fixtures remain inert and must never execute imported package code.

## Promotion Rule

Promote repeated domain fixtures into an owning shared fixture module. Do not
create a generic fixture bucket for unrelated domains.

## 当前稳定补充

- 根级验证清单的唯一可执行真相源是
  `scripts/verification/checks.mts`；本地 runner 和 CI workflow 只选择
  registry 中的 check，不再维护第二份命令列表。
- `changed`、`quick`、`release`、`package` profile 分别服务受影响面反馈、
  全仓快速诊断、发布候选准入和单平台非发布打包。默认并发上限为 2，
  每个 check 必须有超时；失败依赖会阻塞下游，但不会取消独立 check。
- Pull Request 的 `Quality Checks` 必须始终执行 spec 治理、CI 配置契约、
 显式启用的 traceability 和文件大小门禁；`scripts/detect-ci-surfaces.mjs` 只作为
  `scripts/verification/surface-graph.mjs` 的兼容输出层。
- Self-Hosted Web workflow 负责 `apps/web` 与 Docker；独立的 Cloudflare
  Worker workflow 通过同一 registry 验证 `apps/web-cloudflare`，Worker-only
  变更不触发无关 Docker 构建。
- CLI 行为测试使用一次性初始化且已关闭的空 SQLite 模板复制独立 fixture，避免每个用例重复 schema/migration；新库路径、迁移和并发测试必须显式使用未预置数据库，不能被模板替代。完整 CLI suite 默认受 75 秒预算保护，本地诊断可通过 `PROMPTHUB_CLI_TEST_MAX_MS` 临时调整。
- Self-Hosted Web 正常路径测试由 Vitest global setup 创建一个已迁移且关闭的
  SQLite 模板，每个测试数据目录只复制模板；迁移、损坏恢复和锁恢复测试仍需
  显式使用新库或自己的 fixture，不得以模板替代被测前置状态。
- Cloudflare worker / self-hosted 分支型实现如果进入仓库长期维护范围，至少需要具备独立的 `typecheck`、`lint`、`test` 和构建验证，而不能只依赖主应用验证结果。
- 若变更影响 monorepo 内的 package export / workspace 接入，还必须补根级构建验证，确保真实调用链不会因 `exports` 缺失或 lockfile 未更新而在构建阶段失败。
- 发布候选应优先运行根级 `pnpm verify:release` harness；本地快速排查可先运行
  `pnpm verify:release:quick`，受影响面诊断可运行 `pnpm verify:changed`，
  但 changed/quick profile 不能替代发布准入。
- 新增或修复线上 bug 时，应先把失败归类到最低有效验证层：shared package typecheck、app lint/typecheck、unit、integration、performance、bundle、E2E smoke 或 packaging。避免通过多个聚合脚本重复运行同一层来制造“已验证”的错觉。
- Skill 相关发布风险必须先对照 `spec/knowledge/reference/skill-defect-taxonomy.md` 给问题定性，再对照 `spec/knowledge/reference/skill-regression-test-matrix.md` 说明哪些测试项已覆盖、哪些尚未覆盖。

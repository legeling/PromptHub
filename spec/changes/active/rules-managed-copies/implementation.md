# Implementation

## Status

In progress.

## Shipped

- 新建 `rules-managed-copies` active change，并将方案收敛为 `data/rules` 真相源 + DB 索引 + target-file sync。
- 将“规则市场要求保留副本文本、方便备份和快速替换”的产品约束正式落盘。
- 实现 `apps/desktop/src/main/services/rules-workspace.ts`，将 Rules canonical 副本和版本快照落在 `userData/data/rules/`。
- 改造 `apps/desktop/src/main/ipc/rules.ipc.ts`，让 Rules 读取/保存走 `data/rules/`，外部目标文件只作为同步目标。
- 移除 `workspace-agents` / `Current Project`，项目规则现在只来自用户手动添加目录。
- 让项目规则的新增/删除不再写入 settings 的 `ruleProjects`，而是直接创建/删除 `data/rules/projects/...` 托管规则。
- 扩展 backup / export / restore，让 Rules 正文与历史通过 backup JSON 和 ZIP 导出进入备份链路。
- 新增 `packages/db/src/rule.ts`、`rules` / `rule_versions` 表结构与 migration，使 `data/rules/` 真相源在写入时同步维护 SQLite 索引。
- 补充 Rules 回归测试，覆盖 `RulesManager`、`rules.store`、`Sidebar`、`RuleDB`、`rules-workspace`、`rules.ipc`、`database-backup` 中的导出/恢复路径。
- 补齐桌面端 `DataSettings` 的 Rules 导出选项、导入预览计数、自托管同步统计文案。
- 补齐桌面端 WebDAV 与自托管同步链路，使 Rules 跟随 backup payload 进行上传、下载与恢复。
- 为 Web 端新增 `apps/web/src/services/rule-workspace.ts`，将每个用户的 Rules 持久化到 `data/rules/<userId>/...`，避免多用户规则内容混存。
- 扩展 Web 端 `BackupService`、`/api/sync/*`、`/api/import`、`/api/export`，让 Rules 可通过自托管同步和手工导入导出完整 round-trip。
- 新增/更新回归测试：`self-hosted-sync.test.ts`、`webdav.test.ts`、`data-settings.test.tsx`、`sync.test.ts`、`import-export.test.ts`、`rule-workspace.test.ts`。
- 修复 Rules 详情页打开位置按钮：renderer 现在传外部规则文件的父目录给 `shell:openPath`，不再把 `AGENTS.md` 文件路径直接传给只接受目录的主进程接口。
- 扩展 Rules 冲突读取与解决链路：`rules:read` 在 `out-of-sync` 时返回外部 target content；新增 `rules:resolveConflict`，支持 `use-managed` 写回外部文件和 `use-target` 导入外部文件覆盖 PromptHub 托管副本。
- Rules UI 在选中已冲突规则时展示 PromptHub 版本与外部文件版本，并要求用户显式选择同步方向，避免静默覆盖用户绕过 PromptHub 修改的 `AGENTS.md` / `CLAUDE.md`。
- 优化 Rules 冲突弹窗文案：从“导入/覆盖”改为“保留哪个版本作为事实来源”，并在执行覆盖前增加二次确认。
- 修复设置变更后的 Rules 刷新顺序：修改内置/custom agent 的 root path、`rulesRelativePath` 或启用状态时，先等待 settings 同步到 main/DB，再强制重扫 Rules，避免扫描读到旧的 `AGENTS.md` 路径。

## Verification

- 方案已对齐现有 PromptHub 数据布局：内部持久化资源集中在 `userData/data/`，例如 `data/skills`、`data/assets/images`、`data/assets/videos`。
- 当前实现已新增 `data/rules/` 真相源目录，并将 Rules 纳入 ZIP 导出和 JSON backup 载荷。
- 当前实现已新增 `rules` / `rule_versions` SQLite 索引层，并在 `rules-workspace.ts` 中同步维护。
- 当前实现已为 Rules 建立 renderer/store/main/backup 的关键回归测试覆盖。
- 当前实现已将 Rules 纳入桌面端 WebDAV、自托管同步，以及 Web 端 `/api/sync` / `/api/import` / `/api/export` 数据链路。
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/rules-workspace.test.ts tests/unit/main/rules-ipc.test.ts tests/unit/components/rules-manager.test.tsx tests/unit/stores/rules.store.test.ts` 通过。
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/rules-workspace.test.ts tests/unit/main/rules-ipc.test.ts tests/unit/components/rules-manager.test.tsx tests/unit/stores/rules.store.test.ts tests/unit/stores/settings-rules-sync.test.ts` 通过。
- `pnpm --filter @prompthub/desktop typecheck` 通过。
- `pnpm lint` 通过。
- 尝试运行 `pnpm --filter @prompthub/desktop exec vitest run`；Rules 相关测试通过，但完整套件当前被其他未合并 Skill/TopBar 变更导致的既有失败阻断（例如 `skill-ui.integration.test.tsx`、`skill-filter*.test.ts`、`skill-platform-sync.test.ts`、`skill-db-versioning.test.ts`）。
- `pnpm build` 通过。

## Synced Docs

- `spec/knowledge/behavior/rules-workspace.md`
- `spec/changes/active/rules-managed-copies/proposal.md`
- `spec/changes/active/rules-managed-copies/design.md`
- `spec/changes/active/rules-managed-copies/tasks.md`

## Follow-ups

- 仍需补做旧 `~/.prompthub/rule-history` 到 `data/rules/.versions/` 的完整迁移。
- 仍需补做规则同步状态和部署动作的更完整 UI 文案与测试。

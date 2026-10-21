# Implementation

## Product

Shared

## Status

needs-convergence. T-RULES-COPY-019 and the exact #209 external-edit/restart acceptance remain open.

## `TEST-RULES-COPY-023` Restore Regression

Tests were authored before the production fix and executed after the complete
implementation batch. Coverage includes divergent, empty, symlink, and missing
targets; bounded and identity-stable history merge; managed/version/metadata/DB
rollback; delayed replace cleanup; direct CLI Rules import; and CLI workspace
sync pull. The #209 reopen sequence remains outside this completed #210 batch.

`importRuleBackupRecords()` now publishes only PromptHub-managed state and
derives target status by inspection; it no longer calls the external target
writer. The selected recoverability policy is a content-deduplicated bounded
merge that captures the pre-import managed body and imported current body inside
the existing 20-version Rule history. Per-Rule publication failures restore the
previous managed body, metadata, version files, and rebuilt SQLite projection.
The reopen-time trigger reported by #209 still requires focused reproduction.

## Shipped

- Rule backup import no longer writes or creates external targets. Ordinary
  files, empty-body imports, symlink referents, and missing targets remain
  untouched until an explicit save, deploy, or conflict-resolution action.
- Imported and existing Rule history is content-deduplicated with protected
  pre-import and imported-current bodies, bounded to 20 versions, and processed
  with bounded per-Rule memory even for oversized imported history arrays.
- Failed per-Rule publication restores managed content, metadata, version files,
  and SQLite paths; replace cleanup runs only after every imported record has
  published successfully.
- Desktop IPC fallback, direct CLI import, and CLI workspace/sync restore reuse
  the same managed-only Core contract.
- Import history, rollback, and project preparation now live in
  `packages/core/src/rules-workspace-import.ts`; the owning workspace service
  stays below the repository's 1,500-line preferred limit.
- Canonical project Rule metadata now retains `targetPath` and
  `projectRootPath`; global targets remain device-derived. Catalog rebuild no
  longer points external targets back at `data/rules/<id>/rule.md`.
- The legacy cached-list API now delegates to the bounded authoritative file
  scan, which reconciles current device paths and rebuilds the SQLite
  projection before returning the first list.
- File-owned Rules remain visible when their external deployment target is
  missing, so the managed content can be read, edited, and redeployed.
- Older project bundles without placement recover the binding from the bounded,
  link-safe cache `_rule.json` compatibility source when it is still present.
- Unchanged Rule scans are idempotent and no longer advance bundle revisions or
  invalidate the canonical catalog hash.
- Agent Rules cold loading now creates one RuleDB adapter for the authoritative
  inventory scan, performs canonical Skill hydration once per open database
  connection, and reads only the selected Agent's Rule after inventory load.
- Inventory failures leave the loading state and preserve the existing explicit
  retry path instead of leaving the Agent panel on an indefinite spinner.
- Legacy and canonical-hydrated Rule version indexes are normalized newest
  first before materialization. SQLite version numbers are derived oldest
  first, so canonical publication remains chronological without changing Rule
  bodies or durable version files.
- Canonical Rule hydration now emits compatibility indexes newest first, which
  prevents a rebuilt cache from recreating the invalid order on the next scan.

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
- 补齐旧版 `rule-history` 迁移：首次 materialize 规则时会读取旧版 user data 同级 `rule-history/*.json`，支持数组、`versions` 对象、按 rule id 分组的 map，以及声明 `ruleId` / `fileId` / `ruleFileId` 的散落 JSON；目标文件存在时合并为历史版本，目标文件缺失时用最新 legacy 版本恢复托管正文并保留 `target-missing`。
- 收紧项目规则 id：新增和备份导入的 `project:<id>` 必须是安全单路径段，防止拼接 managed project 目录时路径逃逸。
- 将 Rules 托管正文、元数据、版本正文和版本索引改为同目录临时文件 + rename 写入；备份导入替换版本目录时先写 staging，再发布，失败时保留旧版本目录。
- 修复长规则冲突弹窗无法纵向滚动：根因是只有 `max-height` 的 flex 容器无法为内层滚动节点提供确定高度，同时中间层 `overflow-hidden` 裁掉了溢出内容。现在冲突布局使用确定高度与 `min-height: 0`，差异和并排视图共享一个可聚焦的纵向滚动区，标题、模式切换与底部决策按钮保持可见。
- 新增真实 Electron E2E 回归，使用隔离用户目录创建 220 段 PromptHub/外部规则冲突，分别验证差异模式和并排模式的滚轮滚动，以及底部操作持续可见。
- 重做冲突来源信息：工具行固定展示 PromptHub 托管内部副本与磁盘外部文件两个版本，分别关联红色减项和绿色增项计数；保留操作使用完整版本名称，长差异行和页脚之间增加可读间距。
- 收紧冲突工具栏密度：来源容器不再使用 `flex-1` 拉伸，两个来源状态块在桌面宽度下各自限制为 `19rem`，窄屏自动换行；固定工具栏与滚动正文之间保留稳定间距。

## `TEST-RULESCROLL-001` Conflict Scroll Verification

- Component regression asserts the single focusable scroll owner in both comparison modes.
- Electron E2E verifies actual wheel scrolling with long managed and external rule files and confirms the decision actions remain visible.

## `TEST-RULESCROLL-002` Conflict Source Identity Verification

- Component regression verifies both persistent source labels, storage-role labels, and the complete keep-action names.
- Electron E2E verifies the source key remains visible after actual wheel scrolling and does not overlap the comparison region.
- All seven locales define the managed/external source roles and complete keep-action labels.

## `TEST-RULESCROLL-003` Compact Toolbar Verification

- Component regression verifies the source key uses wrapping content-width layout rather than a stretching grid and that both source blocks have bounded desktop widths.
- Electron E2E verifies the source key stays below 70% of the dialog width and leaves at least 8 pixels before the comparison region.

## Verification

- `TEST-RULES-COPY-022`: 71 focused Core/Desktop tests passed, including the
  real three-version oldest-first compatibility index that previously made
  `rules:list` throw. The regression verifies no Rule is hidden, the index is
  repaired newest first, and SQLite chronology remains valid for canonical
  publication.
- The live Codex Rule was audited read-only after repair: `rule.md` remains
  9,763 bytes, all three durable version bodies remain present, the canonical
  bundle remains version 1 through 3, and the compatibility index is now
  version 3 through 1.
- Core and Desktop typechecks, affected-file Prettier, targeted Desktop ESLint,
  line limits, change traceability, and whitespace checks passed for
  `TEST-RULES-COPY-022`.
- The fresh post-fix `pnpm verify:release:quick` run passed all 29 gates in
  718.6 seconds, including Core Rule tests and every Desktop unit shard.
- `TEST-RULES-COPY-021`: 64 focused Core/Desktop tests passed, covering one
  RuleDB adapter per authoritative scan, one canonical Skill hydration per
  database connection, no unrelated Rule read when opening an Agent Rules tab,
  and loading-state release on inventory failure.
- Core and Desktop typechecks, affected-file Prettier, Desktop targeted ESLint,
  line limits, and change traceability passed. The Core package has no local
  ESLint configuration, so its direct ESLint invocation was not an available
  gate; Core typecheck and focused tests passed.
- `pnpm verify:release:quick` passed all 29 gates in 470.3 seconds, including
  Core, DB, Shared, Desktop unit shards, Web, Cloudflare, Mobile, build, and
  governance checks.

- `TEST-RULES-COPY-020`: Rule resource schema, canonical catalog rebuild,
  legacy project-placement hydration, stale cached-path reconciliation,
  managed target-missing visibility, portable placement consistency, and
  renderer selection regressions pass in 78 focused tests.
- `pnpm --filter @prompthub/core typecheck` passed.
- `pnpm --filter @prompthub/desktop typecheck` passed.
- `pnpm lint:file-size` passed; `packages/core/src/rules-workspace.ts` is below
  the 1,500-line new-file limit after removing the duplicate DB-first list
  policy.
- Targeted Desktop ESLint and affected-file Prettier checks passed.
- `pnpm verify:release:quick` passed 28 of 29 gates, including Core tests,
  Desktop lint/typechecks/unit shards, and governance checks. The only failure
  was the CLI wall-clock budget: all 16 files and 123 tests passed, but the
  86.237-second run exceeded the 75-second budget. No Rules assertion failed.
- `TEST-RULES-COPY-023` final focused verification passed 42/42 Desktop Rules
  tests and 8/8 CLI Rules/workspace-sync tests.
- `packages/core/src/rules-workspace-import.ts` reached 100% coverage for lines
  (379/379), functions (21/21), branches (89/89), and statements (379/379).
- Core, Desktop, and CLI typechecks passed. Targeted ESLint, Prettier, and
  `git diff --check` passed.
- The first current `pnpm verify:release:quick` run passed 28/29 checks and
  exposed only `governance-file-size` for the initial 1,863-line workspace
  implementation. The importer extraction reduced `rules-workspace.ts` to
  1,440 lines; the affected tests/typechecks and `pnpm lint:file-size` then
  passed. The other 28 release-quick checks were not repeated unchanged.
- `pnpm spec:test` passed after the parallel storage change converged its active
  change inventory; change traceability passed for all 15 checked changes.

- 方案已对齐现有 PromptHub 数据布局：内部持久化资源集中在 `userData/data/`，例如 `data/skills`、`data/assets/images`、`data/assets/videos`。
- 当前实现已新增 `data/rules/` 真相源目录，并将 Rules 纳入 ZIP 导出和 JSON backup 载荷。
- 当前实现已新增 `rules` / `rule_versions` SQLite 索引层，并在 `rules-workspace.ts` 中同步维护。
- 当前实现已为 Rules 建立 renderer/store/main/backup 的关键回归测试覆盖。
- 当前实现已将 Rules 纳入桌面端 WebDAV、自托管同步，以及 Web 端 `/api/sync` / `/api/import` / `/api/export` 数据链路。
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/rules-workspace.test.ts tests/unit/main/rules-ipc.test.ts tests/unit/components/rules-manager.test.tsx tests/unit/stores/rules.store.test.ts` 通过。
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/rules-workspace.test.ts tests/unit/main/rules-ipc.test.ts tests/unit/components/rules-manager.test.tsx tests/unit/stores/rules.store.test.ts tests/unit/stores/settings-rules-sync.test.ts` 通过。
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/rules-workspace.test.ts --testNamePattern "legacy rule-history"` 通过。
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/rules-workspace.test.ts` 通过。
- `pnpm --filter @prompthub/desktop typecheck` 通过。
- `pnpm lint` 通过。
- 尝试运行 `pnpm --filter @prompthub/desktop exec vitest run`；Rules 相关测试通过，但完整套件当前被其他未合并 Skill/TopBar 变更导致的既有失败阻断（例如 `skill-ui.integration.test.tsx`、`skill-filter*.test.ts`、`skill-platform-sync.test.ts`、`skill-db-versioning.test.ts`）。
- `pnpm build` 通过。
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/rules-manager.test.tsx --reporter=dot` 通过（10/10）。
- `pnpm --filter @prompthub/desktop typecheck` 通过。
- `pnpm --filter @prompthub/desktop exec eslint src/renderer/components/rules/RulesManager.tsx tests/unit/components/rules-manager.test.tsx tests/e2e/rules-conflict-scroll.spec.ts --report-unused-disable-directives --max-warnings 0` 通过。
- `pnpm --filter @prompthub/desktop build` 通过；仅保留既有 Vite chunk size 与 `fflate` dynamic/static import 警告。
- `pnpm --filter @prompthub/desktop exec playwright test tests/e2e/rules-conflict-scroll.spec.ts --reporter=list` 通过（1/1），隔离测试目录已由 harness 清理。
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/renderer-i18n-smoke.test.tsx --reporter=dot` 通过（2/2）。
- 第二轮 `pnpm --filter @prompthub/desktop exec playwright test tests/e2e/rules-conflict-scroll.spec.ts --reporter=list` 通过（1/1），同时验证来源标识与正文区域无重叠。
- 使用隔离 Electron 数据目录对长规则冲突页进行实际截图检查：模式切换、两个来源卡片和正文区互不重叠，红/绿差异行具有稳定间距，两个完整版本操作在页脚中持续可见；临时截图已在验收后清理。
- 紧凑工具栏回归再次通过组件测试、typecheck、定向 ESLint、生产构建和 Electron E2E（1/1）；实际截图确认两个来源状态块按内容宽度左对齐，不再横跨整行，临时截图与 Playwright 结果目录均已清理。

## Synced Docs

- `spec/knowledge/behavior/rules-workspace.md`
- `spec/changes/active/rules-managed-copies/proposal.md`
- `spec/changes/active/rules-managed-copies/design.md`
- `spec/changes/active/rules-managed-copies/tasks.md`

## Follow-ups

- 仍需补做规则同步状态和部署动作的更完整 UI 文案与测试。
- GitHub #209 仍需在当前构建中完成关闭、外部编辑和重新打开的独立复现。

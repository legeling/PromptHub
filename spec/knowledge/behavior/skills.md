# Skills Spec

## Purpose

本规范定义 PromptHub Skill 体系的稳定真相源，包括 Skill 文件格式、仓库同步、版本管理与相关设计入口。

## Stable Requirements

跨 Skill / MCP / Plugin 的公共管理接口、状态、加载和界面合同由
[公共资源架构](../structure/resource-library-architecture.md) 定义；统一实现待收敛，本文继续定义 Skill 包及来源语义。

### skills.sh Directory Search

- A non-empty search uses the official `/api/search?q=...&limit=...` endpoint,
  not a filter over the HTML leaderboard. The existing store page size bounds
  the ranked result request and detail hydration; no extra retry or network policy
  is introduced. Browse categories apply only when the query is empty.
- Search results retain the API repository and Skill selector through the existing
  detail parser and whole-package installer. Remote ranking is authoritative;
  local substring filtering must not hide semantic matches.
- The search response has no supported cursor or whole-directory total contract.
  Display the returned result count, not the homepage's directory count; do not
  fabricate further pages. Invalid responses surface as load failures, and stale
  requests must not overwrite newer search results or errors.
- Empty queries retain existing leaderboard browsing. API failure does not silently
  fall back to searching that partial leaderboard. No stored data migration is needed.
- The existing package installer supports repository-backed directory results, not
  domain-only hosted catalogs. Mixed search responses retain supported repositories
  and report the skipped hosted-result count in diagnostics; hosted-only responses
  produce an explicit unsupported-source error. Never invent a GitHub repository
  or downgrade a hosted package to a single `SKILL.md` file.
- Contract evidence: [official skills CLI search](https://github.com/vercel-labs/skills/blob/main/src/find.ts).

### 1. Skill Package Contract

- Skill 是目录级 package；`SKILL.md` 是 package 内的必需入口文件，不是 Skill 的完整边界。
- 只有一个 `SKILL.md` 的 Skill 仍然合法，但它仍然必须被视为 `<skill-root>/SKILL.md` 形式的目录包。
- 导入、商店安装、Git/Gitea 安装、本地目录安装、同步、导出、项目分发和平台分发必须保留整个 Skill 目录树，除非命中显式忽略规则（例如 `.git` 与 `.prompthub`）。
- Skill package fingerprint 必须使用显式忽略规则，而不是笼统忽略所有隐藏文件。PromptHub 内部目录（`.prompthub/`）、VCS 元数据、依赖目录、缓存、日志、临时文件、本地环境密钥（例如 `.env` / `.env.local`）、虚拟环境与运行态 pid/socket 文件不参与 fingerprint；可分发模板文件（例如 `.env.example` / `.env.sample` / `.env.template`）仍然参与 fingerprint。
- 仅写入 `SKILL.md` 内容的 API 只适用于新建 UI 原生 Skill 或编辑入口文件；不得作为已有包来源导入/安装的最终持久化路径。

### 1.1 Skill File Contract

- 已发布 canonical Skill bundle 的 inventory 必须完整校验，未声明的目录
  （包括 `.prompthub` 和 `repo`）不能整棵豁免。校验失败必须保留文件，未知数据
  只能通过显式恢复流程处理；源码发布前排除 sidecar 不等于读取时忽略它。
- My Skills 的标签候选、实际过滤、计数、侧栏、列表和卡片统一从
  `getSkillFilterTags` 派生。默认仅含用户标签；开启来源标签设置后并入
  `original_tags`，不能出现候选可选但实际过滤不命中的分歧。
  两字段明确分开时，来源集合中出现同名标签不影响该用户标签；仅对缺失来源字段
  的远程旧记录继续使用兼容推断，不改写持久化数据。

- Skill 采用 `SKILL.md` 文件与 YAML frontmatter。
- `name` 为必填字段，且必须符合小写短横线命名规则。
- Desktop、CLI、Web、市场源适配器与 Skill 详情展示必须复用 `packages/core` 所有的标准 YAML parser/serializer，不得各自维护逐行切分或正则提取的 frontmatter 子集。
- 从 HTML、API payload 或其他外层文档提取嵌入式 `SKILL.md` 时，必须保留 YAML 前导缩进后再调用共享 parser。
- Frontmatter 必须支持 YAML literal/folded block scalar、quoted scalar、flow collection 与 nested map，并识别 `license`、`compatibility`、`metadata`、`allowed-tools` 等 Agent Skills 标准可选字段。
- 元数据编辑触发 `SKILL.md` 重写时，必须保留 PromptHub 当前不编辑的标准字段与未知扩展字段；允许规范化 YAML 表达形式，但不得改变字段值或静默删除字段。
- Malformed YAML、非 object root、自定义 tag、重复 key 和超限 alias expansion 必须明确解析失败，不得返回部分可信元数据。
- Skill 元数据与正文分工明确：UI 展示元数据与版本信息由数据库维护，说明正文与指令正文由 `SKILL.md` 持有。

### 1.2 Package Ignore And Secret Guard Contract

- CLI 的本地目录、GitHub 与 JSON 导入、托管副本、package fingerprint、版本快照、
  Project 分发和 Agent 平台分发必须使用同一套内置 ignore policy；package 根目录可以用
  Gitignore 语义的 `.prompthubignore` 增补规则，但不能排除必需的根 `SKILL.md`。
- `.DS_Store`、VCS/PromptHub 内部目录、依赖、缓存、日志、临时文件、本地 `.env*`
  凭据和常见构建输出默认不进入托管副本、fingerprint、快照或分发目标；可分发的
  `.env.example` / `.env.sample` / `.env.template` 继续参与 package。
- 内容审查不参与托管复制、版本快照、Project/Agent 分发或 JSON 导入。凭据示例、脚本和其他可表示内容按既有 ignore 规则保留，不按内容扫描结论拦截。
- package 路径、容量与原子性校验独立于扫描。CLI 复制入口保留过滤后 500 项上限，单文件与累计容量使用共享 package 20 MiB / 100 MiB 上限；不再读取文本以执行旧的 2 MiB / 16 MiB 扫描门禁。
- 托管、Project 与 Agent copy 替换继续使用同级 staging/backup 原子交换；复制、rename 或清理失败时必须恢复原目标。GitHub 导入先在临时 checkout 完成选择、ignore 与 package 校验，再创建最终托管 package。

### 2. Sync Contract

Agent 分发的当前契约以 [FR-AGENT-138](../../changes/active/agent-management-workbench/specs/agent-management/spec.md#fr-agent-138-one-current-contract-per-agent-capability) 为准（2026-09-28 确认，收敛待实施）。
当前源码仍含旧配置读取、自动复制降级和断链状态误报，不能以历史通过记录声称已清理。
设计与分批计划见 [Agent 当前契约设计](../../changes/active/agent-management-workbench/current-contract-design.md)。

- PromptHub 必须支持 DB 与本地 Skill 仓库之间的双向同步。
- UI 编辑元数据后，需要同步 frontmatter；文件系统变更后，需要同步回 DB。
- My Skills 的本地 package source 有两种合法形态：
  - 复制导入：`local_repo_path` 指向 PromptHub 托管 package，托管 package 是 My Skills 的内容真相源。
  - 链接导入：`local_repo_path` 指向用户选择的外部本地 Skill 目录，外部目录是 My Skills 的内容真相源。
- 链接导入的 My Skills 文件浏览、读取、编辑、同步与 fingerprint 刷新必须使用该外部目录；不得在解析路径时静默复制为托管 package。
- 删除链接导入的 My Skills 记录时，只能删除 PromptHub 记录和 PromptHub 拥有的分发链接；不得删除外部源目录。
- 通过 backup/restore 恢复 Skill 时，`local_repo_path` 属于机器本地的写入目标，不能作为可移植数据回放。恢复必须从备份的内容和文件树重建当前机器的 PromptHub 托管 package，同时保留来源标识、来源地址和 package 对账基线。
- Desktop 自部署 Web 备份和兼容期 live-sync 必须在发送前移除 `local_repo_path` 以及非 HTTP(S) 的 `source_url`、`content_url` 和本地 icon 路径；Skill 正文、文件树和可移植的远程来源元数据必须保留。旧 live-sync 拉取合并不能只按数据库 ID 判断同一 Skill，必须优先按 `source_id`、package/content fingerprint 或旧记录规范化名称对齐，并同步重映射版本与文件快照，避免重复名称和孤儿文件写入。
- Web 服务器的备份恢复只按稳定 Skill ID 选择现有记录，不得通过名称认领其他用户的 Skill；元数据、版本和实际包统一接受或跳过。服务器存储和旧镜像迁移见 [Web 存储约定](web.md#10-web-skill-package-storage)。
- Agent Skills 页的 inventory 以当前 Agent 原生 Skill 目录为事实来源。
  `agentScanState` 只允许作为当前 renderer session 的派生缓存，不得跨应用重启
  持久化后阻止新的文件扫描。直接打开 Agent Skills 且本 session 尚无结果时，
  必须自动执行一次有界扫描；未完成、失败和成功空目录必须是三个不同状态。
- 首次自动选择 Agent 与手动选择共用扫描状态；扫描进行中或失败时不打开缺少目标目录的安装弹窗。失败显示扫描错误，由用户显式刷新重试；成功的空目录允许安装 My Skills。同 session 返回页面复用已有结果，不重复扫描其它 Agent。
- 本地 Skill 扫描遇到普通外部断链时，必须静默跳过并继续发现其它有效 Skill；
  若平台 activation 记录、当前 Skill id/name 与链接保存的旧 PromptHub 托管目标
  完全一致，则启动必须在 canonical workspace 物化后原子重绑。不得按名称猜测、
  接管外部断链或覆盖非链接内容；其它解析故障保留有界诊断，单个坏链接不得让
  整个扫描失败或把有效清单变为空。

### Antigravity Historical Link Upgrade

Antigravity 历史默认目录的受托管软链接通过启动迁移
`antigravity-skill-links-v1` 转换至当前平台定义的目录；迁移在 workspace
物化之后、业务入口开放之前执行。SQLite 的 `schema_migrations` 记录完成，
文件系统保存链接及 activation。仅处理 activation 的 id/name 与现存 Skill
一致、指向历史托管 repo 或当前 workspace 的链接；复制目录、非托管文件和
不同的自定义目标不在这项断链修复范围内，必须保留。

迁移先在 profile 的 `recovery/antigravity-skill-links-v1/` 保存原始链接和
身份记录，独占创建新链接并验证可读，再原子写入新 activation，最后撤去旧链接
和旧 activation。目标冲突或缺失源包必须报错且不记录完成；中断后仅凭匹配的
恢复记录接续发布，不覆盖不相关目标。回滚需先退出应用，按恢复记录重建旧链接
与旧 activation，确认后仅撤去仍指向记录 workspace 的新链接及匹配的新 activation，
并删除该迁移的完成记录；历史 repo 已不存在时，恢复其历史包或前向重跑迁移，
不能仅恢复旧链接就声称可用。正常分发不读取历史目录。

迁移扫描为 O(S + A)，S 为 Skill 数、A 为旧目录 activation 数；不复制包正文。
回归入口为 `tests/integration/antigravity-skill-migration.test.ts`，使用真实
SQLite、临时旧目录、完整 package、公开状态及卸载 API 验证升级/重开/失败重试。
`prepareRecord` 保留连续的身份、来源与恢复记录核验；迁移编排保留批次发布及
清理顺序，两函数允许超过 50 行，避免拆散必须一起审查的状态转换。

### Git directory acquisition (#215)

Confirmed and locally implemented 2026-10-20; release pending.

Follow-up scope (locally implemented and verified 2026-10-20): legacy Desktop
`installFromSource` / `installFromGithub` must use the same Core source parser
and materializer as current package acquisition, including branch/directory
selection and the existing HTTPS archive fallback. Keep existing publication
and rollback ownership. Unknown-directory imports discover once, then persist
the actual repository-relative `source_directory` (`.` for root), so reopen,
checks and updates select the same package even if other Skills are later added.
No metadata-only discovery engine, persistent cache, schema migration or
changes to local copy/symlink policy. Existing records with no directory remain
discoverable; no speculative bulk backfill. Regression coverage must include
legacy entrypoints, discovery/reopen/update, ambiguity, fallback and cleanup.
The existing Desktop recursive directory walker moves to Core and is reused by
CLI Git discovery, replacing its two-level, hidden-directory-skipping scan.
Existing traversal bounds, ignored entries and symlink policy remain unchanged;
local CLI scan-preview behavior is outside this change. Discovery visits each
directory once, retaining the existing bounded queue and per-directory sorting.

Acquisition audit:

Review corrections (2026-10-21; locally implemented and verified): first remote
installation must acquire its package once in main, without a renderer snapshot
prefetch. Main persists the discovered directory and canonical entrypoint while
preserving source identity. Caller-owned Git staging is used directly through
publication; CLI Git imports also publish directly from their owned acquisition
directory. External local imports retain copy semantics and their staging copy.
Legacy Git installation delegates publication and rollback exclusively to
canonical storage, with no second copy/update or manual post-create compensation.
Disposable acquisition cleanup failures log the retained path and sanitized
diagnostic without changing a committed success or hiding the primary failure.
Storage rollback failures keep their existing recovery contract. POSIX Git owns
a process group so timeout kills its descendants before staging cleanup; Windows
retains the existing native process-tree terminator. No cache, retries, schema
change or new public operation is introduced. Regression acceptance includes
single acquisition/publication, discovered-directory reopen, injected cleanup
and publication failures, and a real descendant holding process output open.
The existing request shape is unchanged: remote Git/ZIP requests may carry an
empty cached body because staging reads the required authoritative `SKILL.md`;
content-only requests still require a nonempty body. Copy-failure injection also
exposed an empty new Skill container blocking reopen; storage must remove only
that operation's previously absent, empty container after publication rollback.

Convergence follow-up (2026-10-21; locally implemented and verified): the
registered legacy Git/ZIP save IPCs must adapt into the same package lifecycle
as current updates, returning the canonical published path and persisting the
resolved Git directory. They must not commit a second `repo` tree or sidecars
before SQL finalization. SQL failure preserves the previous package, metadata
and history; reopening and retrying remain valid. Git checkout symlinks are
skipped without following their targets, as before the intermediate-copy
optimization. Filtering belongs to owned disposable acquisition, not relaxed
canonical-storage validation or mutation of external local sources. This adds
only a linear metadata traversal, not another package-byte copy. Legacy install
conflicts use the selected package's final name, not a repository-wide name.
Unknown-directory selection includes root and nested candidates in the same
ambiguity check on Desktop and CLI. Explicit directory selection is unchanged.
No schema migration, persistent cache or new retry/rollback mechanism is needed.
The save-IPC adapter keeps request mapping and result translation together
(over 50 lines), with no persistence of its own; its Git/ZIP integration cases
cover publication, metadata, SQL rollback, reopen and retry.

| Entry | Current acquisition boundary |
| --- | --- |
| Legacy Desktop source/Git install | Core source parsing → materializer → selected package → one canonical storage publication/rollback |
| Legacy Desktop remote Git/ZIP save IPC | Request adapter → same lifecycle instance and startup recovery gate as current updates → canonical storage; no independent filesystem publication |
| Desktop package snapshot/install/update | Core materializer; install acquires once in main and persists staging `resolvedDirectory`; snapshot remains the check/preview boundary |
| CLI Git import/check/update | Core materializer; unknown directory uses shared recursive discovery, import persists its actual directory |
| HTTP Git catalog scan | Existing tree metadata + entrypoint reads; no package clone needed |
| SSH Git catalog scan | Shared Git transport + shared discovery; unknown scan remains a full shallow checkout |

Legacy publication now supplies the selected package path, not the checkout
root, to canonical storage. `SKILL.md` remains required and authoritative;
an unreadable entrypoint cannot be replaced by repository README content.
The legacy install orchestration keeps selection and metadata assembly together
(over 50 lines); canonical storage alone owns publication and compensation.

#### Submission review — 2026-10-21

An index-only source snapshot excludes unrelated working-tree changes. Review
found and fixed one additional CLI path-alias defect: realpath validation must
not replace the owned staging prefix passed to publication, or the checkout is
misclassified as external and copied again. An explicit symlinked-root regression
asserts one publication, no intermediate copy, intact binary bytes and reopen.
Ordinary test profiles use canonical paths; the alias case remains explicit.

The final selected regression union passes 413 distinct cases: Core 68 across
nine files, Desktop 306 across twelve files, CLI 39 across five files. The two
CLI files affected by the path correction were rerun (14 cases); unaffected
passing suites were retained. This includes real Git filtering and pinned
revision checkout, package completeness, CLI marketplace install/update/reopen,
legacy IPC convergence, rollback, cleanup and process-tree termination.

Reproduction commands (run in each owning package):

```sh
# packages/core
pnpm exec vitest run tests/skill-git-materialize.test.ts tests/skill-git-process.test.ts tests/skill-git-sparse.test.ts tests/skill-git-transport.test.ts tests/skill-network-settings.test.ts tests/canonical-skill-db.test.ts tests/skill-package-operation.test.ts tests/plugin-git-acquisition.test.ts tests/plugin-third-party-marketplace.test.ts --maxWorkers=2 --minWorkers=1
# apps/desktop
pnpm exec vitest run tests/integration/skill-git-acquisition-convergence.test.ts tests/integration/skill-legacy-git-acquisition.test.ts tests/integration/skill-nested-git-source-update.test.ts tests/unit/main/skill-local-repo-ipc.test.ts tests/unit/main/skill-installer-install-sources.test.ts tests/unit/main/skill-installer-remote-git-package.test.ts tests/unit/main/skill-installer-remote-package.test.ts tests/unit/main/skill-installer-utils.test.ts tests/unit/main/skill-package-lifecycle.test.ts tests/unit/main/skill-package-lifecycle-desktop.test.ts tests/unit/main/plugin-source-reconciliation.test.ts tests/unit/main/plugin-library-marketplace.test.ts --maxWorkers=2 --minWorkers=1
# apps/cli
pnpm exec vitest run tests/plugin-market-acquisition.test.ts tests/plugin-management-parity.test.ts tests/skill-git-source-parity.test.ts tests/skill-package-policy.test.ts tests/skill.test.ts --maxWorkers=2 --minWorkers=1
```

The isolated runs reuse installed dependencies with pnpm's
`--config.verify-deps-before-run=false`; no dependencies are installed.
Core and CLI TypeScript, Desktop source/test TypeScript and scoped ESLint pass.
Local full/sparse Git pack sizes remain 2,098,762 / 971 bytes for the controlled
fixture; this is not a public-network speed guarantee. No native GUI, Windows
runtime or full release harness is claimed. Publication remains pending.

#### Convergence regression acceptance — 2026-10-21

Real Electron follow-up: an open Files tab must invalidate its directory and
loaded file cache when the same managed Skill publishes a new `currentVersion`.
Metadata-only updates do not reload files. Refresh preserves the selected file
when still present and unsaved drafts, reusing the editor's request generation
to reject stale reads. No watcher, polling, extra package acquisition or separate
revision state is introduced. GUI acceptance exposed the stale cache after a
successful source update; `skill-detail-package-refresh.test.tsx` reproduced it
with two failing regressions before correction. The renderer refresh fix passes
30 distinct focused component regressions (package refresh, file editor and
detail platform selection), Desktop source/test TypeScript and scoped ESLint.

Headed macOS Electron acceptance used the existing Vite server with an isolated
profile/keyring and a controlled local Git repository (SSH-form URL rewritten
by Git for the test process only). Actual UI actions scanned and imported two
nested packages from one repository, opened companion files, favorited a Skill,
reviewed and applied whole-package source updates, restarted the application,
and rescanned to confirm both packages are marked imported and cannot be
duplicated. Internal, dangling and external-directory symlinks were absent from
the published package; the external target was unchanged. A temporary SQLite
trigger injected update failure through the UI: all 12 existing package/history
files retained exact hashes, metadata stayed at v1 with the favorite intact,
and no operation journal/staging files remained. Removing the trigger allowed
the same review dialog to retry successfully. After the renderer fix, a further
update to v3 immediately showed the added file and revised selected-file content;
restart preserved all 25 package/history files and the favorite. This exercises
real Electron, IPC, Git, SQLite and filesystem publication, not public-network
transport, Windows, the full release harness or every legacy IPC through UI.
Evidence screenshots remain under the task-specific OS temporary directory
`/tmp/prompthub-real-app-Mm50Q5/artifacts/`; disposable profiles and Git fixtures
are removed after acceptance. No product-repository commit or push was made.

- `apps/desktop/tests/integration/skill-git-acquisition-convergence.test.ts`
  adds nine real-storage cases. All nine failed against the reviewed code and
  pass after correction: Git/ZIP legacy save, SQL failure rollback and retry,
  two explicit packages in one repository, root-plus-nested ambiguity, and
  CLI/current Desktop/legacy Desktop symlink filtering. Assertions include
  nested text/binary bytes, canonical returned path, source-directory reopen,
  preserved personal tags/favorite state/history, no leftover legacy repo,
  one asset publication and zero intermediate Git directory copies. Internal,
  broken and external-directory links are skipped without changing targets.
- Selected regression union: 399 distinct tests pass (Desktop 316, Core 47,
  CLI 36). The initial expanded Desktop run had 14 failures in the mocked
  remote-package adapter fixture, whose `readdir` returned the same child at
  every depth. Correcting that fixture, without relaxing product assertions,
  made its 28 cases pass; the affected three-file rerun passed 71 cases.
- Desktop source/test TypeScript (including Core tests), CLI source/test
  TypeScript, scoped ESLint and diff whitespace checks pass. The first type
  check caught an invalid empty category in the adapter; it now uses the
  existing `general` category. ESLint runs from the repository root with the
  Desktop config so Core files are included rather than ignored.
- Existing local real-Git sparse regression preserved package bytes and
  measured full/sparse pack sizes of 2,098,762 / 971 bytes. This is local pack
  evidence, not public-network throughput. The new integration substitutes
  Git/HTTP and Electron transport only; lifecycle, SQLite, files and reopening
  execute production code. No GUI, Windows runtime or full release-harness
  acceptance is claimed. No commit or publication was performed.

Focused reproduction/acceptance commands (from repository root):

```sh
pnpm --dir apps/desktop exec vitest run tests/integration/skill-git-acquisition-convergence.test.ts tests/unit/main/skill-local-repo-ipc.test.ts tests/unit/main/skill-installer-remote-package.test.ts --maxWorkers=1 --minWorkers=1
pnpm --dir packages/core exec vitest run tests/skill-git-materialize.test.ts --maxWorkers=1 --minWorkers=1
pnpm --dir packages/core exec vitest run tests/canonical-skill-db.test.ts tests/skill-git-sparse.test.ts tests/skill-git-transport.test.ts tests/skill-git-process.test.ts tests/skill-package-operation.test.ts --maxWorkers=1 --minWorkers=1
pnpm --dir apps/cli exec vitest run tests/skill-git-source-parity.test.ts tests/skill-package-policy.test.ts tests/skill.test.ts --maxWorkers=1 --minWorkers=1
pnpm --dir apps/desktop typecheck:tests
pnpm --dir apps/cli typecheck
```

- Desktop and CLI Git package preview, installation, fingerprint checks and
  updates share Core's materialization/transport boundary. A known non-root
  `directory` uses shallow partial clone without checkout, literal root-anchored
  non-cone sparse selection, then checkout of the clone's HEAD. Root `.` and unknown directories retain
  full shallow checkout and existing package discovery. Never infer a directory
  from a Skill name or hardcode `skills/` or `main`.
- Reuse `directory`, snapshot `resolvedDirectory` and persisted `source_directory`.
  No schema, IPC shape, source identity, storage layout or package fingerprint change.
  Discovery results flow through existing install metadata; no repository cache,
  metadata index, additional retry, concurrency policy or user-facing switch.
- `git-transport` owns commands and one shared existing Git timeout budget;
  `git-materialize` passes the requested directory and owns the existing HTTPS
  archive fallback. Desktop/CLI retain their URL policy and network environment.
  All Git subprocesses, including lazy object fetch during checkout, receive the
  same environment; cleanup waits for process exit. No global Git config changes.
- Validate relative directory input before transport/fallback. Escape Git pattern
  characters and select only the requested directory tree, excluding unrelated
  ancestor/root-level files; only the selected package enters validation and
  publication. Existing symlink, ignore, capacity and full-inventory checks apply.
  Missing directory/entrypoint and invalid packages fail without selecting a
  different Skill or adding a full-clone retry.

- Servers ignoring the filter may still complete successfully with reduced
  checkout but no network savings; retain bounded diagnostics. Git acquisition
  failures use only the existing archive policy; SSH is never converted to HTTPS.
  Preserve the installed package and baseline on failure. No migration is needed;
  code rollback restores full shallow acquisition without rewriting user data.
- Cost: repository tree/index metadata remains proportional to repository paths;
  content transfer is the selected package and any Git-required attributes when the server
  supports filtering. Unknown/root acquisition retains current repository cost.
  No persistent cache or extra in-memory package copy is introduced.
- Acceptance: real Git fixtures compare full and sparse package inventory/bytes,
  verify unrelated blobs are absent without lazy fetching them, cover branch and
  unusual directory names, root/unknown selection, invalid paths, acquisition
  failure and existing archive/publication recovery. Desktop/CLI consumers must
  preserve resolved directories and existing reopen/update behavior. Measure
  elapsed time and object/disk bytes separately from network traffic; local Git
  measurements are not remote-network or Windows acceptance.
- The Git process runner keeps timer, stdin/stderr and exit handling together
  (over 50 lines) so cleanup cannot precede process exit. Real Git integration
  fixtures keep package comparison and measurements together for the same reason;
  process lifecycle tests cover timeout and shared-budget failure behavior.

Scope expansion locally implemented and verified 2026-10-21: Skill and Plugin
share literal directory-pattern construction. Plugin Git source and marketplace
acquisition select the package before checkout, including pinned revisions;
CLI marketplace installation/update materialize and publish complete packages.
Each owner's URL policy, process runner, publication and recovery boundary remain.
No schema, persistent layout, external Agent CLI, CI or release-script changes.
Acquisition remains linear in the selected package plus Git tree metadata;
unknown/root packages retain whole-tree acquisition. Existing installations are
unchanged until an explicit update; rollback uses existing package versions.

#### Expanded Skill/Plugin/CLI verification — 2026-10-21

- Core: 34 cases passed, including nine new Plugin acquisition cases and strengthened
  Skill object-inventory assertions. Real filtering-enabled `file://` repositories
  exercise both Plugin materializers, pinned revisions, root packages, literal
  brackets/Unicode/spaces/wildcards, complete hidden/nested/binary files, rejection
  of line-separated patterns, missing-manifest cleanup and preservation of a prior
  package. The POSIX wildcard/quote cases are not Windows acceptance.
- CLI: 14 distinct cases passed across marketplace acquisition, Plugin management
  parity and Skill Git parity. The new marketplace case uses real `runCli`, Git,
  canonical package publication, SQLite close/reopen, binary-only update and a
  failed update with the original package retained and staging removed. Only
  HTTP metadata and the remote Git location are replaced; the latter uses isolated
  Git config to route to the fixture. `check-update` exercises upstream comparison;
  `check` is the separate local package health command.
- Desktop: 138 cases passed across the six selected installer, marketplace,
  source-reconciliation, nested-source and legacy-acquisition suites. Integration
  cases exercise the registered entrypoints with substituted Electron transport,
  real package files and SQLite; this is not graphical application acceptance.
- Defect sensitivity: an isolated source copy with CLI materialization disabled
  fails the new test on missing installed package files (exit 1). Restoring the
  pre-expansion Plugin checkout and Skill cone selection produces eight failures
  in the 15 selected Git cases (exit 1): missing literal paths, unrelated/obsolete
  blobs fetched and line-separated patterns accepted. Working sources were not
  modified for these checks; the isolated copy was removed.
- Controlled Skill measurement: full/sparse local pack bytes 2,098,762 / 971;
  elapsed 241 / 519 ms in one concurrent test run. This verifies reduced object
  materialization, not network-byte savings or universal latency improvement.
- Core strict source types, Desktop source/test types (including Core tests), CLI
  source/test types, scoped ESLint and whitespace checks pass. New files are below
  1,000 lines. Ordered Git fixture and CLI lifecycle test functions retain more
  than 50 lines to keep setup, reopen, update and failure assertions together.
- No Windows machine, live remote rerun, GUI run or full release harness in this
  expansion. No commit, push or remote issue mutation.

Repeat from repository root:

```sh
pnpm --filter @prompthub/core test -- tests/plugin-git-acquisition.test.ts tests/skill-git-sparse.test.ts tests/skill-git-transport.test.ts tests/skill-git-materialize.test.ts tests/skill-git-process.test.ts tests/plugin-third-party-marketplace.test.ts
pnpm --filter @prompthub/cli test -- tests/plugin-market-acquisition.test.ts tests/plugin-management-parity.test.ts tests/skill-git-source-parity.test.ts
pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/plugin-source-reconciliation.test.ts tests/unit/main/plugin-library-marketplace.test.ts tests/unit/main/skill-installer-remote-git-package.test.ts tests/unit/main/skill-installer-utils.test.ts tests/integration/skill-nested-git-source-update.test.ts tests/integration/skill-legacy-git-acquisition.test.ts --minWorkers=1 --maxWorkers=2
pnpm --filter @prompthub/core typecheck
pnpm --filter @prompthub/desktop typecheck:tests
pnpm --filter @prompthub/cli typecheck
```

The new files are selected by the normal Core and CLI Vitest discovery and their
existing root harness checks. This focused run does not imply release readiness.

#### Verification — 2026-10-20

- TDD: before implementation, `skill-git-materialize.test.ts` produced five
  assertion failures (missing directory argument and four unsafe paths accepted).
  All five pass after implementation. Additional regressions cover real package
  acquisition, process lifecycle and the existing consumer workflows.
- Core: 16 tests across `skill-git-{materialize,process,sparse,transport}.test.ts`
  and `skill-network-settings.test.ts` pass. The six sparse cases use real Git;
  the quoted pathname case is POSIX-only because Windows forbids quotes.
  Process fixtures verify shared timeout budget, environment propagation and
  waiting for process exit. Materializer spies prove boundary routing only.
- Desktop: 170 tests pass across the two remote-package suites, installer utils,
  package lifecycle and `skill-nested-git-source-update.test.ts`. The five nested
  Git integration cases exercise renderer actions, registered preload/IPC,
  production partial clone, real files/SQLite and reopen; only remote URL/policy,
  GitHub metadata and Electron transport are substituted. They assert unchanged
  package bytes, binary-only updates, new baseline and failed-source preservation.
  Another 35 source-check/routing/update-failure store regressions pass.
- CLI: 16 Git-source parity/package-policy cases pass, including import/reopen
  and binary-only remote change detection. These substitute network checkout,
  assert the forwarded directory and exercise actual commands/storage.
- Local controlled fixture: same package bytes and commit, unrelated blob absent;
  full/sparse pack sizes 2,098,624 / 854 bytes, measured acquisition 100 / 82 ms.
  Pack size is not a network-byte measurement.
- Real GitHub acquisition: `anthropics/skills`, `skills/pdf`, commit
  `dbd4588f9e1033efb41dad4bef2f7947c8993d44`; all 12 package file hashes match.
  Full/sparse `.git` file bytes 3,931,769 / 144,174; total temporary file bytes
  15,824,235 / 254,620; elapsed 3.67 / 6.36 seconds. This single sequential sample
  proves less local materialization, not universal acceleration or measured
  wire-byte savings. Partial clone introduces extra remote round trips.
- Desktop source/test TypeScript (including Core tests), CLI source/test
  TypeScript, scoped ESLint and file size checks pass. CLI's independent type
  check caught the missing directory argument in its dependency declaration;
  the declaration was corrected and the check passes. No Electron GUI, Windows runtime, full release harness,
  remote authentication or measured public-network byte acceptance is claimed.

#### Legacy/discovery follow-up verification — 2026-10-20

- Test-first evidence: two CLI cases failed because discovered `source_directory`
  was absent; two further deep/hidden-directory cases failed with
  `SKILL_INVALID_PACKAGE` before shared discovery. Legacy integration also exposed
  the wrong root path passed to storage and the missing archive fallback.
  The initial cleanup assertion incorrectly assumed an empty operations folder;
  it now compares against the runtime's existing journal/migration directories.
- 154 distinct selected tests pass: Desktop 120 (legacy acquisition 7,
  install sources 17, local resilience 57, remote Git package 18, discovery 11,
  nested Git source update 5, source routing 5); CLI 34 (Git parity 10,
  package policy 10, existing Skill commands 14). Eleven cases are new in this
  follow-up. The deep/hidden cases exercise import, real SQLite reopen, remote
  check and source update after another package is added upstream.
- Legacy acquisition integration substitutes only Git/HTTP transport and the
  existing isolated desktop runtime transport; package validation, storage,
  byte readback and reopen are real. CLI parity substitutes checkout. Existing
  discovery tests retain symlink, hidden-container, ignore, depth and directory
  budget coverage. Existing rollback injection and real Git integration pass.
- Desktop source/test and CLI TypeScript, scoped ESLint, file-size check and
  `git diff --check` pass. No GUI, Windows, new live-network benchmark or full
  release harness was run for this follow-up. No commits or publication.

Additional follow-up commands (repository root):

```sh
pnpm --config.verify-deps-before-run=false --dir apps/desktop exec vitest run tests/integration/skill-legacy-git-acquisition.test.ts tests/unit/main/skill-installer-install-sources.test.ts tests/unit/main/skill-installer-local-resilience.test.ts tests/unit/main/skill-installer-discovery.test.ts tests/unit/main/skill-installer-remote-git-package.test.ts tests/integration/skill-nested-git-source-update.test.ts tests/unit/stores/skill-store-source-routing.test.ts --maxWorkers=1 --minWorkers=1
pnpm --config.verify-deps-before-run=false --dir apps/cli exec vitest run tests/skill-git-source-parity.test.ts tests/skill-package-policy.test.ts tests/skill.test.ts --maxWorkers=1 --minWorkers=1
```

#### Acquisition/publication review verification — 2026-10-21

- 385 distinct selected tests pass after the review fixes: Core 58, Desktop 291,
  CLI 36. Core covers Git materialization/transport/process/sparse checkout,
  package request validation, canonical Skill storage and SQLite publication.
  Desktop covers both real-runtime Git workflows, installer source/utils/remote
  adapters, lifecycle and its desktop adapter, source routing/check/update-failure
  actions, package IPC and renderer operation contracts. CLI covers Git parity,
  package policy and existing Skill commands. Counts exclude repeated checks.
- Real renderer → preload/IPC → main → filesystem/SQLite installation acquires
  known and unknown directories exactly once; unknown discovery survives reopen.
  The Git lifecycle makes no intermediate directory copy. Legacy installation
  invokes storage create once with no follow-up update. CLI Git import performs
  no intermediate directory copy and copies its binary asset once for canonical
  publication. Source check/apply remains fresh and fingerprint-guarded.
- Failure injection verifies canonical copy failure leaves no installed row,
  removes its new empty container, allows database reopen and a successful retry.
  Nonempty containers remain untouched. Disposable cleanup failures preserve both
  successful installation and primary acquisition errors while logging the path.
  Existing SQLite tests also cover real process exit before/after commit and
  uncertain commit recovery; the publication journal contract is unchanged.
- A real POSIX parent/descendant fixture verifies timeout closes inherited output
  without the fixture rescue timer. Existing real Git sparse/full fixtures retain
  identical package bytes and 2,098,624 / 854-byte packs; this run measured about
  628 / 262 ms under local test load, not remote network traffic or a general speed
  guarantee. No global Git settings were changed.
- Desktop source/test TypeScript (including Core), CLI source/test TypeScript,
  scoped ESLint, source/test size checks and scoped `git diff --check` pass.
  No GUI, Windows runtime, fresh live-network acquisition or release harness was
  run. Test-owned temporary profiles and processes were cleaned up. No commit,
  push or release was performed.

Re-run the selected suites from the repository root (existing dependencies):

```sh
pnpm --config.verify-deps-before-run=false --dir packages/core exec vitest run tests/skill-git-materialize.test.ts tests/skill-git-process.test.ts tests/skill-git-sparse.test.ts tests/skill-git-transport.test.ts tests/skill-network-settings.test.ts --maxWorkers=1 --minWorkers=1
pnpm --config.verify-deps-before-run=false --dir apps/desktop exec vitest run tests/unit/main/skill-installer-remote-git-package.test.ts tests/unit/main/skill-installer-remote-package.test.ts tests/unit/main/skill-installer-utils.test.ts tests/unit/main/skill-package-lifecycle.test.ts tests/integration/skill-nested-git-source-update.test.ts tests/unit/stores/skill-store-source-checks.test.ts tests/unit/stores/skill-store-source-routing.test.ts tests/unit/stores/skill-store-source-update-failures.test.ts --maxWorkers=1 --minWorkers=1
pnpm --config.verify-deps-before-run=false --dir apps/cli exec vitest run tests/skill-git-source-parity.test.ts tests/skill-package-policy.test.ts --maxWorkers=1 --minWorkers=1
pnpm --config.verify-deps-before-run=false --dir apps/desktop exec tsc --noEmit -p tsconfig.test.json
pnpm --config.verify-deps-before-run=false --dir apps/cli exec tsc --noEmit -p tsconfig.json
```

### 2.1 Source Update Reconciliation Contract

- My Skills 的来源更新必须按三方对账处理：`B` 是上次来源安装基线，`L` 是当前本地 package，`R` 是当前来源 package。
- 目录级 Skill 必须优先使用 package fingerprint 对账。`directory_fingerprint` 表示当前本地 package，`installed_directory_fingerprint` 表示上次来源安装基线，`fingerprint_algorithm` 记录算法版本。
- v1 durable package fingerprint 使用 `skill-package-sha256-v1`；桌面主进程、CLI 和 renderer 远程包指纹解析不得把旧版 stable-text 目录摘要标记为该算法。Git tree/API 中只有 blob hash、没有包文件内容时，不得直接产出 durable `directory_fingerprint`；必须留空等待 clone/materialize 后按 v1 计算，或在未来能取得文件内容时按 v1 manifest 计算。旧版只记录 `SKILL.md` hash 的安装，只能在旧 hash 证明本地与远程入口一致时静默升级基线，否则进入无法确定历史的状态。
- 兼容旧版安装时，如果缺少 `installed_directory_fingerprint` 但旧 `installed_content_hash` 与远程入口 hash 一致，来源检查可以把当前本地 package fingerprint 作为可推断基线，再判断远程 package 是否变化。自动检查不得绕过 `baseline-missing` 的冲突保护；PromptHub 托管副本只有在用户显式选择覆盖/重置后，才能重新暂存来源并建立基线。链接外部目录即使显式覆盖也不得被 PromptHub 写入。
- 来源更新检查必须通过共享的 `B/L/R` 对账逻辑产生 `localModified`、`remoteChanged` 和状态，UI/store 不得各自手写不一致的状态机。
- Git 子目录 Skill 的 `source_directory` / `canonical_skill_path` 描述上游包位置，`local_repo_path` 描述安装后的本地包根目录；本地快照不得以仓库根目录或已清理的 checkout 为包根。canonical authority 下的旧托管路径必须按 Skill id 从已有完整 bundle 物化当前 workspace，不能走旧 variant 目录的仅入口引导；外部链接目录仍由用户拥有。Desktop `syncFromRepo` 必须在路径恢复之后读取并返回当前记录，即使内容和 fingerprint 均未改变，也不能返回路径修复之前的对象。不放宽 root `SKILL.md` 校验，不增加目录猜测或持久化格式；bundle 缺失时保持原有无法物化结果，不退回仅入口引导。
- 从 Project/Agent 扫描结果复制导入 My Skills 时，必须立即持久化基于确切本地目录的 `source_id`、内容 hash、目录 fingerprint、安装版本/时间和来源基线；后续检查与更新必须继续从该来源目录解析，而不是把复制后的 PromptHub 托管 repo 误当成远程来源。
- 如果 Project/Agent 扫描条目是指向外部目录的 symlink，复制导入必须以解析后的 `symlinkTargetPath` 作为来源身份和来源读取目录，同时保留扫描到的 shortcut 作为 Agent/Project 分发路径；PromptHub 自己管理的 symlink 不适用该外部目标归一化规则。已导入且由 PromptHub 管理的非内置 Agent Skill 详情必须提供来源检查/更新入口，但不应因此暴露 My Skills 的快照、编辑或删除操作。
- 本地来源的 package 校验、目录复制和 package fingerprint 必须复用同一个忽略谓词；依赖、缓存、运行态和本地环境文件不能因为数量或大小限制让有效 Agent 来源变成 `source-unavailable`，也不能被复制进托管 package。可分发模板仍需参与校验、复制和 fingerprint。
- My Skills 列表的“有可用更新”徽标必须先按确切来源身份匹配远程条目，优先级为 `source_id`、`content_url`、`source_url`；只有完全缺少来源身份的旧记录才能按唯一 `registry_slug` 回退。同 slug 的不同商店条目不得互相覆盖或触发刚安装即有更新的误报；只有算法兼容的 durable package fingerprint 才能优先于版本标签参与徽标判断。
- 来源更新状态限定为 `no-source`、`source-unavailable`、`baseline-missing`、`up-to-date`、`update-available`、`local-modified`、`conflict`。`source-moved` 和 `downstream-stale` 不属于 v1 来源更新主状态。
- `downstream-stale` 属于 Project/Agent 分发拓扑数据，只能作为辅助扫描结果或 `hasStaleTargets` / `staleTargets` 类字段暴露，不得污染 My Skills 来源对账状态机。
- `local-linked` 外部目录是用户外部文件夹的内容真相源。v1 不允许直接把远程来源更新覆盖进外部链接目录；UI 必须引导用户转换为 PromptHub 托管副本或手动更新外部目录。
- 来源解析必须先归类为明确 adapter kind：`remote-store`、`remote-git`、`remote-zip`、`content-url`、`local-linked` 或 `managed-copy`。raw `content-url` 是单文件来源，安装基线与远程 package fingerprint 必须等于该 `SKILL.md` 的内容 hash，不得信任 registry 中陈旧或外部提供的目录指纹。
- 来源检查必须使用与来源类型一致的 transport：`local-linked` 与 `managed-copy` 只读取本地目录；`remote-git` 优先通过经过校验的 Git clone 读取 package，Git 启动或 clone 失败时可以对同一个 HTTPS 仓库执行一次受控 HTTP archive 回退；`remote-zip` 下载并校验解压后的 package；只有纯 `content-url` 才使用通用 HTTP 内容接口。Git archive 回退必须复用现有代理、DNS/SSRF、重定向、超时、下载容量、archive 路径与 package 安全门禁，不得把 SSH 凭据静默转换为匿名 HTTPS，也不得在 Git 成功时额外下载。local/Git/Zip adapter 都必须从同一份经过校验的文件清单产生 `SKILL.md` 和完整 package fingerprint。用户明确配置的私有 Gitea 可以走 Git transport，但不得因此放宽通用 HTTP 的 SSRF 私网拦截。旧记录只剩 GitHub/Gitea raw/file URL 时必须恢复 repo/branch/directory；已安装 Skill 保存的具体本地来源路径优先于复用同一 `source_id` 的远程目录项。
- skills.sh 等目录型商店只提供 repo 与 Skill selector 时不得猜测物理子目录；安装、指纹检查和更新快照必须把同一份已校验 selector 传给主进程，并将 selector 纳入缺少稳定目录/source id 时的来源身份，避免同仓库多个 Skill 冲突。显式 selector 即使面对只有一个 Skill 的仓库也必须匹配，不能静默安装无关 package。克隆后按 frontmatter 精确身份优先、目录名回退的规则执行有深度与目录数上限的递归发现；名称归一化必须支持 Unicode。标准 `skills` / `data/skills` 容器优先于隐藏 Agent Skill 容器，隐藏 Agent Skill 容器优先于普通示例目录；同优先级仍存在多个候选时必须明确失败，不得任意选择。远程发现不得跟随 symlink，必须跳过 VCS 与共享 ignore 规则命中的生成目录，但不得笼统跳过 `.agents/skills`、`.cursor/skills` 等合法隐藏 Agent 容器。
- 非本地远程来源更新必须先完成内容落盘，再写入 DB 元数据和来源基线。Git/Zip 继续暂存并校验 package，raw content-url 在 SKILL.md 写入成功后刷新基线；任何落盘失败都不得提前标记为已更新。所有来源均不运行内容扫描。
- package 结构、路径、archive、容量、fingerprint 和回滚校验继续生效；内容报告不构成批准或阻断条件，不再按来源信任进行扫描重试。认证信息仅供传输使用，持久化诊断必须脱敏。
- 实际网络传输保留超时、代理和 SSRF 边界。配置代理时，远程抓取器保留既有 RFC 2544 合成 DNS 地址处理，不放行真实 loopback/RFC1918 内网地址；独立内容扫描不解析或验证来源地址。
- 如果 raw `content-url` 已写入但最终 DB 基线写入失败，必须通过更新前创建的版本快照回滚，避免本地文件内容与数据库来源基线长期不一致。
- PromptHub 托管 repo 替换必须使用 staging/backup swap；复制、校验或 sidecar 写入失败时，应保留上一个可用 managed repo。
- 来源检查失败时，PromptHub 应保留本地内容，返回 `source-unavailable`，并只保存净化后的 `source_last_error` 摘要，避免把 URL userinfo、token、query secret、堆栈换行等细节暴露到持久化错误字段。
- `source-unavailable` 检查结果还必须携带来源 adapter kind、脱敏后的来源位置和脱敏失败原因；本地目录、托管副本、Git、ZIP、内容地址和商店来源必须按实际类型展示，不能把所有来源都文案化为 URL。
- Git 可执行文件缺失且 HTTP archive 不适用时，安装/更新失败必须明确提示安装 Git 或配置 `PATH` 后重启 PromptHub；Git 与 HTTP archive 都失败时必须明确说明两条 transport 均失败，并引导检查 Git/PATH、网络/代理和来源权限。结构化失败只保存有界 reason 与脱敏摘要，不得向 renderer 暴露原始命令、凭据或本地路径。
- 未配置 Token 时，GitHub 归档回退直接访问 `codeload.github.com`；配置 Token 时使用下述 API 认证下载。两者沿用应用网络代理与安全校验，不修改用户全局 Git 或代理设置。显式指定 Skill 子目录时，ZIP 只解压该目录的完整 package；仓库其他 Skill 不计入单包 500 文件上限。归档所有路径仍需拒绝穿越，仓库根必须唯一，选中包继续执行文件、大小、深度、重复路径和最终落盘校验。未指定子目录的来源保留既有完整解压与选择流程。
- 商店安装前的远程 Git/ZIP 快照 IPC 返回成功值或稳定错误码；preload 保持原有成功 API，以不含诊断的标记跨 contextBridge 传递失败。renderer 将代理不可达、网络超时、容量、权限、磁盘空间、无效包等常见错误本地化；未知失败显示通用重试/日志提示。不得直接显示 Electron IPC 包装、克隆命令或本地临时路径。无持久化 schema 变更，预览失败不得写入 Skill，安装继续经现有审核、fingerprint 与事务流程。
- GitHub Token 的唯一真源为现有 CoreSettingsStore。安装、更新、指纹与预览的包下载必须读取该设置；配置 Token 时，GitHub 归档通过 API zipball 端点认证，无 Token 时仍使用 codeload。Token 不传给 Git 命令、SSH、第三方主机或跨主机归档重定向，不修改全局 Git/SSH 配置。SSH 扫描与后续安装、更新必须保持用户提交的 clone URL；来源身份仍按既有 canonical repository 规则计算。已有 HTTPS 记录不得猜测迁移为 SSH。错误应区分 GitHub 认证/限流、仓库或分支不可访问、SSH 密钥/主机验证、网络代理与 Git 缺失，并指向设置中的 GitHub Access Token 或对应 SSH 配置；Token 不能修复断网，SSH 仍依赖 Git 与有效密钥。无 schema 或存储布局变更。
- Cloud Store 的安装与更新必须先读取已发布 package，展示版本、文件/内容差异，等待用户明确确认后才写入本地；“检查更新”本身不得直接覆盖 Skill。
- My Skills 详情页只能保留一个“检查来源更新”入口，不得在检查后把顶部按钮改成更新动作，也不得追加“覆盖本地修改”按钮。`update-available`、`local-modified`、`conflict` 和 `baseline-missing` 必须先打开本地版本与来源最新版本的差异对比；关闭或保留本地版本不得写入任何内容，只有用户明确选择来源版本后才能进入既有暂存、快照和回滚流程，需要覆盖授权的状态必须显式携带该授权。
- package 来源的更新对比必须使用与 fingerprint 相同的完整有效文件清单，逐项展示新增、修改和删除，并允许用户查看每个变更文本文件的行级差异。二进制或超过安全预览上限的文本文件必须保留在清单中并显示大小/完整摘要比较语义，不得静默忽略或强制解码。raw `content-url` 只对比 `SKILL.md`，不得把本地辅助文件误报为来源删除。
- 同一 Git 仓库包含多个 Skill 时，来源恢复不得仅凭共享的 `source_url` 选择首个目录项；必须优先使用精确 `source_id`、`content_url`、`registry_slug`、已验证目录/路径或唯一 Skill 身份，歧义时回退已安装绑定而不是跨 Skill 更新。成功的 `up-to-date` 对账应修复非空规范来源元数据。skills.sh 页面中带省略号的 Repository 展示值不得保存为 Git URL。来源更新弹窗展示 Skill 身份与完整内容差异，不展示不能代表实际 package 决策的本地/来源版本卡片。
- PromptHub Cloud 的桌面账号与 Skill Store 入口必须受同一个 renderer capability 控制；生产 endpoint 与发布证据未完成时默认关闭。关闭后设置导航、商店来源、程序化选择、持久化恢复和后台刷新都不得访问 Cloud，旧选中状态回退到官方商店。
- Cloud release 的 `store-package-sha256-v1` 只用于远程交付 intent 的版本期望；桌面本地 package 仍必须计算并持久化 `skill-package-sha256-v1`，不得把两种 fingerprint 直接比较或互相标记。
- Cloud 多文件 package 写入失败时必须恢复已写入文件并清理新建文件；安装失败不得留下半成品 Skill，更新失败不得提前刷新来源基线。
- 扫描导入统一使用 package lifecycle，不先调用 content-only create 再复制或更新路径。只有完整 package、来源基线与库记录提交后才计为成功；失败与补偿由生命周期所有者报告，renderer 不执行第二次回滚。Copy 与 Link 均先暂存完整有效目录验证，来源元数据取实际入口而非陈旧扫描结果；用户标签与来源标签分开。
- Link 的 `source_url` 与 `local_repo_path` 由本机 SQLite 保存，portable 导出排除本机路径。旧设备绑定只由 `skill-sqlite-v1` 在升级时读取、核对设备身份并保全到 recovery，然后退出正常路径；不能从缓存猜测 Link 身份。外部来源不删除。升级前保留独立备份，旧程序不得写入升级后的 profile。
- Link 元数据编辑从实际外部包暂存完整 inventory，仅原子替换外部 `SKILL.md`，在同一 finalize 发布元数据、包和历史；失败恢复原入口，已提交错误不再回滚。外部辅助文件不被替换，用户标签仍不进入来源 frontmatter。入口改动检测防止覆盖陈旧编辑；无 schema 或新目录布局。`commitLinkedSkillEdit` 顺序保留文件核验、发布及补偿，允许超过 50 行以一起审查提交边界。

### 2.1.1 Library CRUD command boundary

- Desktop 与 CLI 的库元数据由 SQLite 持有，完整受管包位于 `data/skills/<encoded-id>/files/`。创建、编辑、改名和删除使用 Core 的同一 SQL/文件发布边界，不按 authority marker 切换业务实现。Web 镜像与历史正文/快照的后续转换状态见 Foundation 计划。
- 首启等待 renderer persistence 时，迁移 IPC 必须等待主进程接续已有 authority 发布和数据库/IPC 重新绑定完成后再确认；失败明确返回且允许重试，不要求用户重启，不移除写入保护。CLI/Web 没有 renderer 迁移前置条件。
- 创建先准备入口文件；编辑从实际包目录暂存完整包，入口正文、元数据、fingerprint 和修改前版本通过 SQLite receipt journal 一起提交。用户 tags 不写入来源 frontmatter，未知 YAML 字段、二进制及受管包原有 sidecar 保留；导入与分发继续排除来源 sidecar。仅收藏/用户标签等修改不复制包。不再生成 `skill.json` 或可写缓存副本。
- 改名只迁移明确安装的目标，不传旧名/新名兼容清理列表；目标冲突提前失败。原分发副本暂存用于失败恢复，符号链接保持模式。全部目标处理完才提交库内名称；失败保留旧名称并恢复分发，恢复失败明确报告保留的临时备份位置。备份、分发和清理按目标顺序执行，有界占用为本次包和已部署副本总大小。
- 改名预检包括已分发副本的外部修改和缺失基准；此类冲突不得先创建新名目标。补偿只处理实际成功的安装或移除，不能把被拒绝、未发生的移除当成恢复对象。普通副本改名、库提交失败恢复与外部修改保全由 `skill-library-platform-files.test.ts` 覆盖。
- 详情页的“应用变更”明确调用 changes 操作；点击事件不能成为 redistribution 参数。“重新分发”独立调用 redistribute。`skill-full-detail-platform-selection.test.tsx` 通过真实详情页按钮与 hook 检查首次安装及完成后的状态；`agent-skill-lifecycle.spec.ts` 覆盖实际 Electron、文件分发和重开。
- 删除先撤回指定分发，再由 Core 一起删除 SQLite 记录与受管包。前置撤回失败保留库内记录供重试；外部来源不删除。调用者可保留 copy，symlink 必须撤回。提交回执用于判断中断后的完成或回滚，不以失败后的 SQL 补偿模拟原子性。
- Desktop 和 CLI 使用同一份 Skill 目标替换函数：在同级暂存复制/链接完成后移动旧目标并发布新目标；发布前失败恢复旧目标。发布后的备份清理失败明确报错且保留新目标，不用可能已部分删除的备份覆盖它。
- 来源更新携带检查时的完整 package fingerprint，暂存结果不匹配时在写入前返回 conflict。预览只包含有界文本和摘要，不能用预览重建二进制包；检查和实际获取仍各执行一次，避免另建长期暂存缓存及其过期协议。
- 暂存与历史快照成本为 O(package bytes + file count)，分发为 O(sum of target package bytes)，无递归请求或无界并发。已有 canonical 发布失败恢复仍适用；回退程序前应保留独立备份，不改写用户源目录。
- 本批回归覆盖单次创建/编辑、二进制和未知 YAML 保留、版本和陈旧编辑、改名失败与冲突、删除失败/重试、复制/链接替换失败及来源变化。核心 6 个相关测试文件共 54 项、桌面 8 个相关测试文件共 116 项通过；Desktop TypeScript、相关源码和新增测试 ESLint、文件大小门禁及 diff whitespace 检查通过。目标替换函数达到 100% 行/函数/分支；library command 为 100% 行/函数、95.60% 分支，Desktop CRUD 为 100% 行/函数、95.38% 分支。剩余未命中分支为正文/名称 nullish 防御、创建失败后 ID 回读，以及错误传播的 finally 路径；它们没有被计为完整覆盖，后续需补投影缺字段和组合故障夹具。128 文件、2 MiB 同级目标替换实测 96 ms，单次本机观察不代表所有文件系统。GUI、真实远程服务、跨平台、全量发布构建和中断进程后的分发恢复未执行。改名跨目标补偿和完整包准备函数按顺序集中处理，允许超过 50 行以保持快照、提交和恢复顺序可审查。

### 2.1.2 Functional acceptance

- 来源 frontmatter 标签写入现有 SQLite `skills.original_tags`，与用户 `tags` 分离；更新必须支持空数组清除。详情页 repo sync 在内容和来源标签未变化时保持幂等，不更新 `updated_at`，避免重复同步触发文件暂存操作的并发冲突。已存在的错误标签在下次正常同步时校正，无 schema/layout 迁移；包并发变更保护和失败时原文件保留不变。
- 文件编辑器保存、创建、改名、删除失败使用统一的本地化反馈；真正的包冲突显示重新打开建议并保留编辑草稿，入口文件结构限制显示明确提醒。IPC 包装、堆栈与内部路径仅留日志。`skill-repo-sync-crud.test.ts` 覆盖来源标签更新/清空、同步幂等、同步期间的文件编辑/删除及重开后的字节和元数据；组件用例检查失败草稿与删除重试。这些隔离测试不等同于原生窗口操作验收。
- Skill 文件图片预览在内嵌和全屏模式都允许直接平移，缩小至 50% 或图片未溢出时也能拖动。图片舞台始终在视口中水平、垂直居中，放大缩小围绕中心展开，不锚定左上角；拖动偏移在缩放时保留。平移使用 renderer 临时坐标，不依赖滚动条；鼠标主键/触控指针捕获支持跨边界拖动，松开、取消或捕获丢失结束拖动，禁止浏览器原生图片拖放。方向键可平移，双击画布或全屏重置按钮恢复居中位置与缩放，换图重置位置。图片字节、文件与数据库不变，无迁移。`useResourceImagePan` 将同一手势的状态和短回调集中在一个 hook，函数允许超过 50 行以避免拆散捕获生命周期；当前仅静态检查，既有基于模拟 scrollLeft/scrollTop 的组件断言不再证明此平移行为，真实 GUI 与手势回归待验收。
- 2026-10-17 验证：来源同步/文件显示 integration 3 项、文件编辑器/Toast/同步转换 unit 41 项、Core 包持久化 12 项通过；Desktop 源码与测试 TypeScript、相关 renderer/测试 ESLint、diff whitespace 检查通过。Core 首轮 11/12，一项在夹具创建阶段遇到 Windows 临时 journal 重命名 `EPERM`，单独复跑 12/12；该偶发文件系统失败未被改为忽略。未执行原生 GUI、全量发布 harness，也未更改包并发保护。

- #227：`skill-first-launch.test.ts` 从全新 profile 执行 renderer migration IPC，返回前即可从真实 Skill preload 创建，并验证重复迁移、失败重试及关闭重开。
- #228：`skill-scanned-import.test.ts` 验证 Copy/Link 完整嵌套文本/二进制、用户标签、来源基线、重开、外部文件和元数据编辑、提交失败后的入口恢复/重试及删除保全，并复用 Plugin 子 Skill renderer 组合用例。
- #229：`skill-file-save-display.test.tsx` 等待真实保存完成后验证查看器内容、UTF-8 字节数和重开。Desktop 本机文件写入的规范返回值为 `Promise<void>`；带 revision 的自定义文件源仍返回其定义的文件对象，不把布尔值当成文件。检查结果见现有 [核心操作验收记录](../../changes/active/existing-feature-release-acceptance/skill-actions-audit.md)。

- `apps/desktop/tests/integration/skill-nested-git-source-update.test.ts` 对应 #218：使用报告中的深层 GitHub tree URL 与旁支 Skill，通过实际目录选择、renderer store、preload/IPC、Git checkout、SQLite 和完整包文件验证导入、检查、仅附件/二进制变化的更新与关闭重开；旧托管 checkout 路径恢复必须让数据库和 renderer 都使用修复后的根目录。仓库根目录仍须拒绝；远程入口丢失不得改变本地包、来源基线或版本。替换 Git/GitHub 网络传输和 Electron 运输，不替换业务服务；不代表真实 Windows GUI 或网络验收。此修复属于 Desktop IPC，CLI/Web 不消费该桌面同步和本地快照 IPC，既有 Web bridge 明确不支持本机 repo 操作。
- `apps/desktop/tests/integration/skill-public-workflow.test.ts` 从生产 preload API 和完整 IPC 注册入口执行真实服务、磁盘 SQLite、首次 canonical 迁移与关闭重开。正常流程覆盖手工创建、元数据和嵌套文件编辑、版本、完整目录导入、二进制、copy/symlink 分发、改名、来源更新、卸载和删除；之后从同一 IPC 边界验证非法输入、路径穿越、缺失入口和陈旧来源，检查错误类型与持久化结果。Electron 消息运输及隔离 home 属于测试环境边界，不替换业务服务。
- 该功能用例由现有 desktop integration shards 自动纳入。真实按钮流程 `agent-skill-lifecycle.spec.ts` 纳入既有 E2E smoke；`skill-create-structure.spec.ts` 检查当前 canonical bundle 和 workspace，移除过期 variant container 断言。接口流程与 E2E 证据分别记录，mock 组件/store 测试只证明局部交互。
- 多步骤正常流程测试保留顺序断言，允许超过 50 行以直接呈现输入、结果和关闭重开边界；文件 inventory 一次线性遍历，只在临时小包上比较完整字节。此前 170 项聚焦测试与覆盖率仅证明各自局部边界，不作为完整功能可用的结论。
- 本地来源和 Link 身份由 SQLite 保存。旧 `config/devices/skill-sources/<skill-id>.json` 是一次性迁移输入，不再正常新增或更新。checkpoint 的设备字段从其 SQL 操作源保全，portable 包不携带设备路径。
- 升级在首次 authority 发布或首次 catalog 对账之前，一次性将现有 SQLite 本地来源移交给设备配置，完成标记位于 `data/operations/migrations/skill-source-bindings-v1.json`；标记和来源记录原子发布，之后不再保留 SQLite 回退读取路径。已被旧程序丢失的来源不可凭包内容恢复，需要重新选择来源；回退旧程序前保留完整 data/config 备份，旧程序不能消费新设备记录。单条绑定读取上限 16 KiB，迁移一次 O(skill count)，正常修改仅写本 Skill 的小型绑定。
- 包操作等待启动恢复完成，恢复失败明确拒绝写入；IPC 注册返回就绪 Promise。旧缓存标记 `.canonical-bundle-hash` 只在升级边界处理，不进入当前包、导出或分发。
- 2026-09-12 非 GUI 验证：两条正常公共接口流程和 14 组黑盒异常输入通过，实际检查完整字节、版本、安装状态、关闭重开及外部来源保留。相关目录操作、authority/startup、IPC 与功能用例 7 文件 131 项通过；另有 canonical lifecycle 5 项、Core 来源绑定/Skill DB/catalog 对账 43 项通过。Desktop TypeScript、额外将本次桌面测试纳入 compiler program 的类型检查、相关 ESLint、文件大小门禁和 Desktop main/preload/renderer 构建通过。没有以覆盖率数字证明功能；GUI 实际点击、真实网络来源、跨设备备份恢复、跨平台及完整发布 harness 未执行，不能据此宣称全部应用功能可用。临时测试目录和进程已回收。

### 2.2 Standalone Content Safety Scan Contract

- 安全扫描是默认关闭的独立功能。开启后仍只响应用户手动操作，不在导航、安装、快捷/批量安装、导入、更新、编辑、版本、同步、备份或部署时自动运行。
- 设置使用独立的 skillSafetyScanEnabled 和 static/ai 方式。旧自动扫描、渠道策略和来源信任设置归零，不启用新功能；历史报告继续可读。回退旧版本前应检查其旧设置，旧程序可能恢复旧策略；不改写 package 或历史报告。
- Desktop/Web 扫描请求必须显式 enabled=true；CLI skill scan-safety 命令即本次显式授权。默认本地静态内容检查，不联网；AI 方式须手动选择并配置模型，失败明确报错，不以静态结果冒充 AI。
- 只检查内容意图和上下文，不根据来源域名、Git/Gitea/目录等渠道、source URL 是否存在、DNS、商店审计或脚本文件名判断风险。AI 输入不携带来源信任元数据，不执行被审查内容，不回显凭据值。
- 报告仅供阅读，任何风险等级都不批准或阻止业务写入；旧操作请求的 safetyScan、safetyScanMode、approvedPackageFingerprint 为不生效的兼容字段。安装/更新不保存扫描结论或写入信任列表。
- 路径穿越、不安全 archive、无效 package 结构、容量超限和写入/回滚错误仍按各自业务契约处理。内容扫描预算不得缩减可备份、版本化或安装的 package 内容。
- 标准生命周期在完整暂存和结构校验后创建持久化 Skill 记录。扫描导入也使用同一生命周期，不创建内容式临时记录；失败与补偿由生命周期所有者报告。
- Desktop 进程启动时必须在接受新的 Skill package 请求前恢复上一进程留下的全部
  lifecycle journal 与 pending 记录，不受运行时清理所用年龄租约限制；进程运行期间
  的维护清理仍必须保留租约，避免把正在执行的安装或更新当作中断操作回滚。
- 安装/更新的业务元数据必须以最终暂存 package 中解析后的 `SKILL.md` frontmatter 为准；商店目录值仅作为缺失字段的回退。用户在 PromptHub 中维护的 `tags` 不得被来源更新覆盖，来源标签写入 `original_tags`；目录版本 `source` 是哨兵值，不得作为已安装版本持久化。

### 3. Versioning Contract

- Skill 版本历史属于稳定产品能力。
- 版本快照、恢复、差异对比与平台分发属于 Skill 域内关键流程。

### Export Feedback Contract

- Skill 详情页与侧栏详情共享导出结果语义。桌面 `skill:saveExport` 接收 Skill ID 与 `skillmd | zip`，主进程读取已有导出数据、弹出保存对话框，使用目标目录的临时文件写入后重命名发布；写入失败保留已有目标，清理暂存。无数据库 schema 或持久布局变更。
- IPC 返回 `saved`（含文件名）、`canceled` 或 `failed`；成功以实际文件发布完成为准。renderer 使用统一 Toast 显示本地化成功/失败，取消不提示成功，诊断留日志。执行期间同一详情入口不重复提交。
- Web 继续浏览器下载，只显示“已开始下载”，不得宣称已确认落盘。Toast 是 renderer 反馈，不能仅凭导出内容生成成功就显示保存成功。
- 验证：`skill-export-feedback.test.tsx` 8 项运行真实详情组件与 Toast，替换 preload I/O，覆盖两入口的 MD/ZIP 完成等待、取消和失败；`skill-export-save.test.ts` 3 项使用临时真实文件，仅替换系统对话框，覆盖字节落盘/覆盖、取消及写入失败。连同 `toast.test.tsx`、`skill-detail-utils.test.ts`、`skill-detail-view-timers.test.tsx`、`skill-installer-export.test.ts` 共 44 项通过；源码与测试 TypeScript、聚焦 ESLint 通过。未完成原生保存对话框的实机点击验收，也未对全应用所有业务 Toast 做穷尽验收。

### 3.1 Platform Distribution Feedback Contract

- 平台未适配、版本/schema 不兼容、未初始化、安装方式不支持、权限不足、文件缺失、空间不足、目标占用或同名冲突属于可预期的操作结果，显示普通提醒和处理建议；不使用崩溃式红色错误展示。未知异常显示简短通用错误，诊断留在日志。详情、快捷管理和批量分发复用同一错误分类；批量操作按目标保留结果，单条源文件读取失败不能中断后续 Skill。Copy 回退原因同样使用本地化文案，不直接展示底层路径。
- 操作完成后的状态刷新失败不得覆盖已返回的分发结果：保留成功/失败明细，单独提示重新打开页面刷新；快捷管理在状态未知时保持窗口并阻止继续提交。
- 分发及撤回失败必须显示本地化的原因与可操作建议，不直接显示 Electron IPC 包装、堆栈、SQL 或本机绝对路径。主进程的 `installMd`、`installMdSymlink`、`uninstallMd` 返回结构化成功值或错误码；preload 保持现有成功返回值及失败 rejection 语义，renderer 统一映射错误文案。未知异常使用通用失败提示，诊断留在主进程日志。单个平台失败不得抹去其他平台的成功结果。
- Cherry Studio 1.7.13 已支持 Agent 插件式 Skills（工作目录 `.claude/skills`），但该旧版机制不在当前自动分发契约内。数据库缺失时提示“当前版本或数据目录尚未适配自动分发”，schema 不支持时提示“当前版本暂未适配自动分发”，并引导在 Cherry Studio 的 Agent 插件设置中安装；不得据数据库缺失断言该版本不支持 Skills。检测到应用目录不代表其技能数据库可用于分发。此修复不增加第三方历史数据库写入路径，不替 Cherry Studio 迁移数据，也不修改其数据库或 Skill 文件布局。用户需通过 Cherry Studio 自身升级/初始化，或在 Agents 配置实际数据根目录。
- Cherry Studio 当前适配以 upstream `dac9b72`（2.1.6）为准：只支持 Copy 分发，Symlink 在写入前返回本地化说明。原生启动扫描会删除库中的软链接，因此不得将其报告为已安装。目录、当前表结构、全局启用、完整包哈希及运行时镜像的契约见 `spec/changes/active/agent-management-workbench/platform-adapter-designs.md#des-agent-039-cherry-studio-current-data-and-skill-boundary`。

- 详情页的待分发平台勾选属于当前 Skill ID 的临时 UI 状态；同一 Skill 的打开同步、元数据刷新及安装方式切换不得清空勾选。切换 Skill 或完成分发后的状态刷新可以重置选择。平台状态加载按稳定 Skill ID 触发，不依赖记录对象的引用变化。
- My Skills 的分发计数、画廊平台图标和列表状态共用 `skillPlatformStatuses` 会话快照，由已有批量状态 IPC 读取实际目标目录后一次发布；`deployedSkillNames` 同步派生。图标使用内置资源，已确认安装的平台无需等待额外 Agent 检测。列表加载后立即请求状态，30 秒内复用完整结果；新增 Skill 不能复用缺项缓存，分发操作通过现有 force 刷新失效。失败保留上次结果，未知状态不得显示为“未分发”；退出重启重新校验，不持久化目标状态、不新增表或 IPC。
- 2026-10-17 图标加载验证：6 个定向文件共 26 项通过（`skill-distribution-status`、`skill-store-state-projects`、`skill-distribution-loading`、`skill-gallery-card`、`skill-list-view-actions`、`skill-manager-large-dataset`）。新增组件回归使用真实 renderer store、替换 IPC，验证无需等待平台检测、扫描前不误报未分发、同次发布计数与图标，以及重新挂载复用结果；状态回归覆盖新增 Skill、缺失行、失败保留和恢复。状态输入校验调整后新增两文件 3 项复跑通过，源码 typecheck、定向 ESLint 和 diff 检查通过。扩展 i18n 检查出现两个 `initReactI18next` mock 缺失错误及一个 ZIP 导出断言失败，未作为本次图标验收；日志位于 OS 临时目录 `prompthub-skill-icons-20261017`。未运行原生 GUI，也未测量真实磁盘扫描耗时。

  回归入口：`apps/desktop/tests/unit/components/skill-full-detail-platform-selection.test.tsx`，运行真实详情组件、平台 Hook 和 Zustand store，仅替换 preload I/O 与 Toast。两条用例覆盖打开同步期间的单选保留、再次取消、全选后的元数据刷新和切换 Skill 后清空。隔离加载旧 Hook 时两条用例均在选中状态断言失败；修复后通过。与 `skill-platform-panel.test.tsx`、`skill-quick-install.test.tsx` 合计 12 项通过，命令为 `pnpm --filter @prompthub/desktop exec vitest run --project unit tests/unit/components/skill-full-detail-platform-selection.test.tsx tests/unit/components/skill-platform-panel.test.tsx tests/unit/components/skill-quick-install.test.tsx`。开发环境已热更新；当前原生窗口无法激活，未完成实机点击复验或实际平台分发。

- 当用户选择符号链接方式分发 Skill 到平台目录时，PromptHub 必须明确区分“真实 symlink 成功”和“因权限/文件系统限制而回退为 copy 安装”。
- 如果主进程回退为 copy 安装，渲染层必须收到结构化结果，并向用户显示包含受影响平台与原因的警告提示。
- 回退 copy 安装仍属于成功分发，但不得伪装成普通 symlink 成功。

快捷平台管理弹窗以勾选表示期望安装状态：初始勾选已安装平台，取消勾选生成
卸载变更；点击应用时只执行变更项，并明确显示安装/卸载数量。全部平台已安装
时仍可管理。卸载只撤回平台安装，保留 My Skills 与来源包。状态读取失败时
禁止基于未知状态提交；部分失败显示具体平台错误，刷新真实状态后允许重试。
My Skills 批量入口必须明确包含安装与卸载；商店批量导入入口必须显示文字。
安装、撤回复用现有业务入口，不新增兼容路径或持久化状态。

### 3.2 Project-Local Distribution Contract

- PromptHub 必须支持将项目级 Skill 直接分发到当前项目内的本地目录，而不强制要求先纳入 `My Skills`。
- PromptHub CLI 必须支持从现有 `My Skills` 中选择一个 Skill，并直接安装到当前项目的本地 Skill 目录，而不强制要求先在桌面端登记项目。
- 项目级分发默认目标为当前项目的 `.agents/skills`，并允许用户额外选择多个目标目录。
- 项目级分发必须复制整个 Skill 目录到 `<target>/<skill-name>/`，而不是只写单个 `SKILL.md` 文件；这是全局 Skill package contract 在项目分发场景下的具体要求。

### 3.3 Agent Platform Visibility Contract

- Skill 平台分发的可见目标由“已检测到的平台”与“用户显式配置的平台”共同决定。
- 已启用的 custom Agent 和存在用户覆盖配置的 built-in Agent 必须作为可分发目标显示，即使其根目录当前还不存在；安装流程负责创建缺失目录。
- `disabledPlatformIds` 始终优先于检测和显式配置，用于隐藏用户不希望看到的平台。
- Gemini CLI 默认关闭，默认禁用平台集合由 shared settings 的 `DEFAULT_DISABLED_PLATFORM_IDS` 定义；设置中保留手动开启入口，开启后持久保留。现有安装在 `agent-settings-v1` 之后执行一次 `gemini-default-disabled-v1` 迁移，将 Gemini 加入现有禁用集合；偏好更新和迁移记录在同一 SQLite 事务中提交，失败完整回滚并可重试。此迁移保留其他平台偏好、本地文件和会话，不改变 Gemini API 模型支持。用户可通过现有平台开关撤销禁用，后续启动不重复禁用；恢复明确的设置快照继续以快照中的选择为准。
- 平台检测仍用于默认 built-in 平台降噪和状态提示，但不得单独作为分发目标可见性的唯一门禁。
- `agent-skills-global` 是实验性的共享 Skill 分发目标，不是 Agent 平台，
  因此不得进入 Agent 检测、Agent 数量或 `SKILL_PLATFORMS`。它把完整 package
  安装到 `~/.agents/skills/<skill-name>/`，使用 PromptHub ownership receipt
  区分托管、已修改和外部冲突状态，并在卸载前重新验证所有权。
- 共享目标不得默认参与批量分发。用户同时选择共享目标和已知会发现
  `.agents/skills` 的平台原生目标时，界面必须提示重复发现风险；未完成运行时
  验证的平台继续使用其原生目录，不得被宣称为兼容。
- 分发弹窗与详情侧栏共用平台选择与变更摘要：勾选表示应用后的安装状态，
  已安装项取消勾选显示待卸载，所有全局目标变更通过底部“应用变更”执行。
  弹窗双列、侧栏单列；“全选平台”只选择原生平台，保留用户单独设置的共享目标。
  共享目录位于独立“高级目标”区，显示实验性、目录及兼容说明，不计入平台数量。
  待安装／待卸载数量包括显式选定的共享目标；重复发现提示按应用后的状态计算。
  共享目录未安装时默认关闭，已安装时如实显示，不因重开界面自动撤回。
  状态加载失败时禁止提交；部分成功后按实际状态刷新，仅保留失败项供重试。
  没有新增或卸载且存在已勾选目标时，主按钮显示可用的“重新分发”，明确显示
  更新目标数量，并按当前 copy/symlink 方式重新发布当前完整包。重新分发失败
  保留安装状态，不能把失败目标转成待卸载；再次点击会更新全部已勾选目标。
  无目标时按钮禁用。弹窗底部操作栏位于滚动内容之外，侧栏操作栏按正常文档流
  排列，不能以 sticky 覆盖共享目录说明或重复发现提示。
  本次仅调整 renderer 交互和临时选择状态，沿用已有分发服务，无 schema 或路径迁移。
  `SkillDistributionControls`、共享目标卡片及项目分发适配组件允许超过 50 行的
  声明式 JSX，以保留完整的无障碍标签、状态文案和布局；选择与计数逻辑独立为
  `skill-distribution-selection.ts`，不在两处界面复制。

#### 分发界面验证（2026-10-17）

- `pnpm --filter @prompthub/desktop exec vitest run --project unit tests/unit/components/skill-distribution-controls.test.tsx tests/unit/components/skill-distribution-selection.test.ts tests/unit/components/skill-platform-panel.test.tsx tests/unit/components/skill-quick-install.test.tsx tests/unit/components/skill-full-detail-platform-selection.test.tsx tests/unit/components/skill-detail-project-distribution.test.tsx tests/unit/components/skill-full-detail-async-actions.test.tsx tests/unit/services/skill-locale-regression.test.ts`：67 项通过，覆盖勾选语义、重复提交、共享目录隔离、跨作用域选择保留、键盘焦点与文案。组件测试替换 preload I/O，不用于证明磁盘分发。
- 本轮重新分发与弹窗底栏修正：5 个组件测试文件共 33 项通过，覆盖无变更时重新分发、未选择目标时禁用，以及底栏位于滚动内容之外的 DOM 结构；相关 ESLint 和 `pnpm --filter @prompthub/desktop typecheck:tests` 通过。
- `pnpm --filter @prompthub/desktop exec vitest run --project integration tests/integration/skill-platform-management.test.tsx --minWorkers=1 --maxWorkers=1`：9 项通过。本轮补充已安装目标重新分发、写入失败后保留目标和重试；并修正原参数化测试仍只渲染弹窗的问题，侧栏用例改为实际渲染 `SkillPlatformPanel`。先前 6 项通过不构成侧栏安装／卸载的独立证据。测试经过真实 Hook、preload、IPC、SQLite 和临时文件系统；仅替换 Electron 运输、home、无关 UI 偏好及徽标刷新，复制失败在文件系统 I/O 边界注入。
- 原生窗口与视觉验收由用户自行查看，本轮未运行 GUI；上述结果不代表真实 Agent 消费、跨平台或全量发布验收。

### 3.4 CLI Automation And Asset Topology Contract

- CLI 以 `skill import` 表示纳入 PromptHub，以 `skill distribute` / `skill undistribute`
  表示向 Agent 平台分发或撤回；`install`、`install-md`、`uninstall-md` 作为兼容别名保留。
- Git 来源支持 HTTPS 仓库、GitHub `tree/<branch>/<directory>` URL 和
  `git@host:owner/repo.git`。`--branch`、`--directory` 显式覆盖 URL 中的选择；
  目录必须位于仓库内，选择后的整个 Skill 包（包括二进制附件）纳入库。
  例如 `prompthub skill import git@github.com:example/catalog.git --branch main --directory skills/writer`。
  非 Git 来源不能使用这两个参数；多个 Skill 的仓库必须显式选择目录。
  CLI 与 Desktop 共用 Core Git clone 进程、超时及脱敏错误边界；此项不代表
  CLI 的设置 Token、代理与 HTTP 压缩包回退已全部对齐。
- CLI 的 Skill `list/get/import/versions/create-version/rollback/sync/update` 成功结果默认只返回
  identity、version、fingerprint 与 file count 等有界摘要，不返回正文或文件快照；`--full`
  显式恢复完整 payload，`--quiet` 只抑制成功 stdout，错误仍写 stderr。显式 `repo-read`
  与 export 命令继续返回调用者要求的内容。
- Skill 详情“源码/内容”的资产拓扑只展示 upstream/local external source 与当前可编辑
  package，宽屏两栏、窄屏纵向排列；外部直连目录不能标成 PromptHub 托管副本。
  已分发目标及分发操作集中在预览的分发区域，不在源码页重复列出，避免目标数量撑高
  拓扑区。预览分发区域继续说明 copy 覆盖与 symlink 随编辑生效的区别。

### 4. Translation Contract

- Skill 详情页的 AI 翻译结果属于可恢复的本地用户状态。
- 完整 Skill 文档翻译必须通过 Desktop 主进程 AI transport 访问已配置端点，支持用户明确配置的内网 HTTP base URL；翻译与其他 AI HTTP 请求统一使用 300 秒有界请求超时，不得维护更短的操作级 timeout 或新增自动重试。
- 主进程 transport 的 deadline 必须显示为翻译超时，不得误报为无法连接；超时失败不能写入部分译文缓存。
- 翻译结果不得改写原始 `SKILL.md`，应作为 sidecar 文档保存在 Skill 本地 repo 的 `.prompthub/translations/` 目录下。
- 翻译是否仍然有效必须基于当前 `SKILL.md` 内容 fingerprint 判断，而不是仅凭页面内存态。
- 当 `SKILL.md` 变化导致旧译文失效时，UI 必须回退原文并提供明确的重翻入口。
- `.prompthub/` 目录属于 PromptHub 内部文件空间，默认不参与普通文件树、导出和分发流程。
- 当前完整受管包固定在 `data/skills/<skill-id>/files/`；安装与更新暂存在
  `data/operations/`，不再生成 `cache/skill-workspaces/`。SQLite finalize 与文件
  由同一次发布协调，失败恢复旧状态；生命周期清理暂存，旧安装恢复记录只在升级读取。

### 5. Stable Internal Sources

- Skill 体系设计见 `spec/knowledge/structure/skill-system-design.md` 与 `spec/knowledge/structure/skill-system-design-zh.md`
- Skill 商店需求见 `spec/knowledge/structure/skill-store-requirements.md` 与 `spec/knowledge/structure/skill-store-requirements-zh.md`
- 历史测试演进与状态记录保存在 `spec/changes/legacy/docs-08-todo/`

## Stable Scenarios

### Scenario: Defining a new Skill workflow

When Skill behavior changes materially:

- contributors create a delta spec under `spec/changes/active/<change-key>/specs/skills/spec.md`
- they sync durable behavior back into this stable spec after implementation

### Scenario: Persisting translated Skill content

When a user has already translated a Skill detail page:

- reopening the same Skill with unchanged `SKILL.md` content restores the saved sidecar translation by default
- changing `SKILL.md` content invalidates the old translation and requires a fresh translation before it is shown again

### Scenario: Recovering Skill knowledge

When historical Skill plans or test rounds are still useful but no longer current source of truth:

- they remain readable under `spec/changes/legacy/`
- they are not deleted or replaced with git-history placeholders

## Lossless package snapshots

SQLite owns Skill metadata and version identities. The managed package is the single
current filesystem copy; there is no writable cache to reconstruct. Metadata-only edits
do not rewrite package bytes. Reads never fabricate missing files from SQL content.
Explicit import/restore may publish a supplied complete package into an existing
SQL record without a package path; it validates the supplied entrypoint and bytes.
An explicitly invalid replacement source fails without changing the prior package.
Concurrent stale edits require reload/retry.

CLI deletion uses the same SQL/package publication boundary. An explicit
`--purge-managed-repo` request must not remove files before SQL commits; a failed
delete retains both the row and managed bytes. Managed packages are removed with
their library record, while external source directories remain intact.

Persistence snapshots are separate from file previews. Text remains the historical
`{ relativePath, content }` shape; non-text bytes carry `encoding: "base64"`. All
supported restoration consumers decode bytes and reject unknown encoding. Old text
history is readable, including auxiliary-only snapshots with a separately stored
entrypoint. Historical `[binary file]`/`[file too large]` text cannot recover lost bytes.

Binary snapshots require new-format file envelopes/CLI bundles/canonical documents
and sync capability 2. Raw WebDAV/S3 binary snapshots have a non-JSON version prefix,
so old readers fail before restoration. Do not use an old client with a writable
upgraded root; downgrade from an independently retained pre-upgrade backup. Package
limits remain the shared Skill limits; byte snapshots do not inherit preview limits.

### Current and historical payload ownership (2026-10-16)

Core `SkillStorageDB` is the Desktop/CLI file owner and is also used by Web with
its server root. SQLite owns Skill metadata, source bindings, version IDs,
ordinals, notes and counters. Current text is read from the registered package's
`SKILL.md`. Managed packages use `data/skills/<encoded-id>/files/` on Desktop/CLI
and `data/skill-files/<encoded-id>/files/` on Web. Explicit linked Desktop packages
remain external; migration does not write to those external directories.

Historical payloads use `<skills-root>/.prompthub/versions/<encoded-skill-id>/<encoded-version-id>/`, outside discoverable package directories:
`content.md` holds optional historical text, `files/` holds exact snapshot bytes,
and `index.json` records only content presence and snapshot file paths/encodings.
An absent file snapshot and an empty file snapshot remain distinct. Missing current packages retain metadata and annotations with absent content; body reads, edits and distribution fail without reconstructing files. Version
metadata is not mirrored into this index. Missing or invalid referenced history
fails visibly; it is never replaced with empty content or a SQL fallback.

`skill-payload-files-v1` follows the existing metadata/package migration, preserves
a database safety point, stages and validates the history files, and clears
`skills.content`, `skill_versions.content` and `skill_versions.files_snapshot`
inside the same receipt transaction as file publication. These nullable columns
are retained only for historical import/staging; runtime triggers reject payload
writes after migration. The current runtime uses `SkillMetadataDB` through Core.
Fresh and upgraded roots run the same migration. A failed publication retains or
restores the old SQL and files; reopening recovers its receipt before retrying.
Downgrade requires the paired pre-upgrade database safety point and package files;
do not delete the migration marker or re-enable old SQL writers in place.

Normal reads, version save/delete/rollback, portable export/restore, Web backup
and causal Skill sync include these payloads. Portable staging may use its
explicit legacy SQL codec while building a verified transport artifact; accepted
runtime roots convert it before opening normal operations. History migration
retains only version identities and stages one decoded snapshot at a time.

Upgrade, injected failure recovery and two-reopen checks pass against real SQLite
and files, including binary history and linked-package preservation. The affected
check results are recorded in the Foundation implementation record; these checks
do not establish native GUI, remote-provider or release acceptance.

The Desktop initializer must run `skill-payload-files-v1` immediately after
`skill-sqlite-v1`, before exposing Skill IPC. Omitting this step creates file
history without its migration marker and breaks checkpoint export or reopen.
The full release gate exposed this entrypoint gap; portable recovery acceptance
also asserts the marker and empty SQL payload columns. The corrected candidate
passes all 40 release checks in 1,543.2 seconds with
2,612 selected source/test/configuration hashes unchanged. Real-provider and
signed/notarized cross-platform upgrade acceptance remain separate.

Historical Skill bundles may contain distinct resource IDs with the same source
binding. Adoption preserves every ID, package and history. An existing SQL binding
keeps its owner; other colliding records become `detached` with no active
`source_id`. If SQL has no owner, all ambiguous bindings are detached rather than
choosing one by directory order. Exact original metadata, including source IDs,
remains in the migration recovery bundles. Runtime source uniqueness is unchanged.
The local native startup exposed this previously unresolved legacy-profile case;
the prior 40-check result did not cover that actual profile.

Windows history upgrades first run the named `skill-snapshot-paths-v1`
correction through Core's `migrateSkillPayloadFiles` entrypoint, then the existing
`skill-payload-files-v1` converter. The correction changes only legacy SQL
snapshot separators from `\` to `/`; content, encoding, version identity and
notes remain intact. Shared runtime path validation stays strict. Absolute,
traversing, empty-component and colliding converted paths abort the correction.
No schema or current filesystem layout changes are introduced.

Before correction, a database safety point preserves the original SQL JSON.
Path updates and their completion marker commit in one transaction, decoding
one version at a time. SQL failure preserves the original rows. If subsequent
file publication fails, the corrected SQL still holds all history for retry;
the existing publication receipt restores files before reopening. Already
migrated profiles are unchanged. Downgrade uses the pre-correction safety point
and matching package files, never a marker reset on the upgraded database.
Desktop initialization, Core initialization and legacy catalog adoption share
this ordered entrypoint. Regression coverage lives in
`packages/core/tests/skill-payload-upgrade.test.ts` and includes native Windows
separators, mixed separators, binary bytes, normal startup/reopens, rejection,
transaction rollback and publication retry.

# Data Recovery Spec

## Purpose

本规范定义 PromptHub 数据恢复、预升级备份、目录迁移与恢复安全边界的稳定真相源。

## Stable Requirements

### 1. Recovery Safety

#### Startup failure diagnostics (2026-10-19)

The renderer startup-failure page exposes Copy error log, selectable error
details, and the existing Reload action. The captured startup error remains the
authority for its message, stack and Error/string cause chain; diagnostics add
the packaged version, capture time and runtime user agent. No settings, database
content, source files or full historical log are read. Common credential fields,
authorization/cookie headers, URL credentials and home usernames are redacted
before both display and clipboard export; users should review details before
sharing. This is a diagnostic of the caught failure, not a complete main-process log.

Copy uses the existing clipboard utility, works independently of database/settings
readiness, reports success/failure inline, and permits manual selection and retry
after clipboard denial. The page does not claim every startup failure is a migration
failure or that all source data is intact. It neither bypasses failed initialization
nor changes recovery, migrations or persistence. Work and memory are O(error text
size); no network request, polling, new IPC or dependency is added.

Verification: startup-error-page, renderer-error-boundary, settings-startup-readiness
and i18n-init passed 23 tests. Clipboard transport is substituted; the real page,
formatter and clipboard utility cover copied text, redaction, failure/retry and
reload delegation. Desktop test-inclusive typecheck, focused ESLint, file-size
gate and main/preload/renderer production build passed. Subsequent authorized
isolated Electron acceptance passed the real startup page, redacted OS clipboard
copy and reload after an injected storage IPC failure. Clipboard formats were
restored and the temporary profile removed; no installed bundle or user data
was changed. This UI check does not replace disk migration/reopen coverage.

#### Prompt workspace upgrade recovery (2026-10-19)

- Confirmed requirement: historical Prompt workspaces must converge once into SQLite;
  a recoverable same-identity conflict must open a recovery-only Desktop surface,
  not terminate startup or enable normal business writes against partial state.
  Existing portable ZIP compatibility and backup retention remain unchanged.
- Implementation: retain the released `prompt-workspace-v1` converter and
  introduce ordered `prompt-workspace-v2`. Current Desktop/Core startup uses the
  successor; the old Web format keeps its existing explicit converter. Existing
  completion/restore markers must prevent resurrection of deleted records.
- Compare only fields actually represented by a historical source, after its
  existing date/default/body normalization. Missing old fields do not erase SQL-only
  metadata. Distinct records and history merge; divergent fields or version slots
  require explicit source selection, never timestamp precedence. Reappearing legacy
  records absent from SQL require explicit recovery rather than automatic import;
  equivalent mirrors can be archived and retired without resurrecting records.
- Recovery contract: Core owns analysis, a SHA-256 review fingerprint, source choices,
  graph validation and journaled publication. Shared owns the typed report/request.
  Desktop exposes review/resolve/restart and the data directory only while blocked;
  its dedicated renderer entry does not mount the normal App or settings migration.
  Choices are not preselected. Resolution rechecks the exact reviewed data, preserves
  original SQLite in its managed safety registry and old files in the migration
  recovery directory, then atomically publishes rows, retirement and completion.
  Each publication uses a distinct recovery directory and never replaces an older
  archive, including when identical source files reappear.
  Failed publication rolls back; cancel/close leaves sources unchanged. No new table,
  parallel runtime store, automatic retry policy or timestamp winner is introduced.
- The UI shows record identity, actual source and field differences, supports keyboard
  selection/confirmation, and offers refresh, opening the data directory and exit.
  Failure stays recoverable; success requires a normal restart before business access.
  Invalid/unsafe source files are not silently discarded to make recovery succeed.
- Work is O(records + source bytes) plus deterministic O(n log n) ordering; records are
  indexed by identity/version slot and file hashing is streamed. Recovery-only scans
  are on demand; normal completed startup must not scan retained backup contents.
- Acceptance: historical-format field omissions, full old-writer fixtures, same-ID
  content/metadata and version-slot conflicts, stale review, deleted-record replay,
  source-byte preservation, SQL/file failure rollback, restart/retry and frontend
  confirmation through real preload/IPC/storage. Existing package test entrypoints
  and the release harness select these tests. Native Windows/UI acceptance is separate.
  Rollback requires the matching pre-migration SQLite safety point plus archived
  source files in an isolated root, not copying legacy files into a live current root.
- The recovery renderer keeps its continuous page layout together; its JSX render,
  state hook, conflict-group merge, history completion and migration/IPC orchestrators
  may exceed 50 lines to keep a single selection or transaction boundary visible.
  Focused component and real SQLite/preload tests cover those boundaries. No new
  file exceeds 1,000 lines.
- Local verification on 2026-10-19: 15 successor migration cases and the 15 unchanged
  v1 cases passed; 58 catalog/SQL publication/historical-runtime cases passed,
  including v0.5.9, beta.1 and beta.2 upgrade/edit/reopen and failed-upgrade retry.
  Desktop recovery preload/IPC has 2 passing real SQLite cases; recovery component
  and seven-locale checks have 11 cases, the isolated renderer entry 1, existing
  canonical startup 18, and current/historical portable imports 21. These are
  targeted checks, not the full release harness.
- Desktop source/test and Core source typechecks, scoped root-based ESLint, file
  size checks and Desktop production build passed. The 500-record synthetic
  migration took 473 ms locally; repeated startup rounded to 0 ms and did not read
  the retained archive. These timings are observations, not platform guarantees.
- The historical writer fixture extracts only pure serialization functions from
  `v0.5.8` commit `28935b56186cdf213b3af500853b586bee9199d3`; it does not claim an
  installed old Desktop binary or the reporter's private data. Native GUI/Windows
  upgrade acceptance and the complete release gate remain unexecuted. A malformed
  source or divergent duplicate IDs within one source still requires source repair;
  the recovery choices distinguish database/workspace/data, not individual copies
  inside an ambiguous source.

#### Historical portable imports and backup volume (2026-10-19)

- 历史版本正常导出的备份必须可通过显式导入迁移读取；不能要求用户安装旧版本
  中转。已知格式包括旧 JSON、`.phub.gz` 和无 portable manifest 的旧 ZIP。
  未知较新格式、损坏及危险路径仍明确拒绝，不能跳过现行完整性校验。
- 旧 ZIP 仅在解包后的历史格式识别边界转换：保留原归档，校验历史 envelope，
  将所选旧目录映射到当前 portable 路径，再进入现有原子恢复流程。
  有 manifest 的包始终按该 manifest 校验；校验失败不得改走旧格式。
  原有 Prompt/Folder/历史 ID、Skill 完整包、媒体和所选配置必须保全。
  历史 `skills` 范围附带的 MCP/Plugin 数据在导入边界展开为当前独立范围，
  显式未选择的现代范围不得被覆盖。凭据继续遵循现有 portable 导入脱敏策略。
- 普通完整导出是只读操作，只产生用户选择保存的 portable ZIP，不额外创建
  升级安全快照。预升级备份、恢复前安全点及失败回滚保障继续保留；不自动删除
  用户已有导出文件、历史恢复副本或来源不明的目录。
- 当前实现：Core 的单一旧 ZIP 转换器已接入预览和恢复；Shared 复用范围/配置转换，
  Desktop 负责安全解包和恢复编排，不改 DB schema 或新增长期备份格式。
  只在当前恢复缓存内创建转换结果，结束清理；目录遍历和文件复制为线性字节成本，
  清单排序 O(n log n)，复用现有文件、容量与逻辑 payload 上限。
- 回退代码不会改写原备份；已成功导入的数据保持当前格式，不能用旧程序直接覆盖。
  导入失败应保持原根可读；验收包含非空历史数据、完整包和二进制字节、真实启动及
  重开、重复导入、损坏 manifest、危险路径、较新格式及发布失败回滚。
- 2026-10-19 本地验证：历史格式合成 fixture 的 ZIP、JSON、`.phub.gz` 均经
  renderer 导入入口、preload/IPC、真实 SQLite/文件恢复与正常启动函数重开读回；
  Prompt/Folder/历史 ID、Skill 文本与 ZIP 包内二进制、图片和所选设置核对通过。
  重复导入、发布故障回滚和只导出一个 ZIP、不新增安全快照的回归通过。
  现行 portable 恢复原有九项集成用例通过；类型检查、定向 lint 通过。
  Electron/原生对话框运输边界由测试替身提供，不等于 Windows GUI、报告者原包、
  所有历史版本或覆盖安装启动失败已验收。MCP/Plugin 旧范围展开有单元回归，
  非空历史 MCP/Plugin 包尚未单独完成端到端验收。
- 集成验收继续使用现有 `release-acceptance-data-recovery-portable.test.ts` 的
  真实存储/IPC fixture，因此文件超过 1,000 行；连续导出、故障注入、恢复、
  多次启动的场景函数允许超过 50 行，以保留同一业务状态链，不复制第二套 fixture。

备份类别保持明确：用户主动导出文件用于外部保存；upgrade/recovery/database 安全点
用于失败恢复，沿用下文既有总量管理；Prompt/Skill/Rule 内容版本用于编辑历史，
不是可随备份清理的副本。迁移专用恢复文件及无法证明所有权的历史文件不在本批删除。

- 高风险的数据恢复、目录迁移和升级路径必须优先保证数据不丢失。
- SQLite 与文件联合发布由同一 SQL 事务写入业务记录和 operation ID 提交凭据。
  文件 journal v3 在恢复时按凭据确认完成或回滚，不能仅凭文件日志仍是 prepared
  就撤销已提交记录引用的文件。数据库缺失、不可读、凭据不一致或旧 v2 SQL
  迁移日志缺少可证明的提交状态时，保留新旧文件和日志并要求恢复，不建立空库。
  schema v5 增加的凭据表每个操作键只保留最近一行，目录维护必须保留它；回退前
  恢复升级前完整数据库安全点及匹配文件，不单独删除表或降低版本号。
- 用户文件状态会被改变的动作必须以可理解方式提示用户，而不是静默进行。
- Portable 恢复的暂存目录使用最终目标的 root identity 校验，但所有文件读写仍限制在暂存目录。完整 ZIP 中 Provider model mapping 的身份与 Generation bundle revision 必须保全；逻辑配置导入不承担完整包身份恢复。
- 保留设置的目录重建必须保留已执行的应用迁移及原始执行时间，避免恢复后重新执行一次性迁移而覆盖用户选择。
- CLI 工作区备份与桌面 MCP 文件快照共用 Core 的 SQLite 快照及历史文件实现。定义摘要保持脱敏，不能仅复制历史目录却漏掉版本索引，也不能把旧 `library.json` 当作当前存储真源。

### Private Folder Visibility

- 私密目录只提供应用内隐藏，进入时验证主密码；本地正文、历史、附件及备份不因私密标记而加密。不得宣称本地加密存储。
- 全部、搜索和收藏视图不展示私密目录及其子目录中的 Prompt；只有在已解锁目录内才显示。锁定和重开不得改写正文、历史或私密标记。
- 此边界不改变模型、MCP 等凭据的独立加密合同，也不改变用户显式选择的备份加密。

### 2. Pre-Change Safety Net

- Plugin 的历史 `library.json` / `versions.json` 仅由 Core 和 Desktop 启动调用共享迁移
  `plugin-metadata-v1` 转换，canonical 日常读取不再迁移或清理旧元数据。
  迁移按 ID 合并独有条目、核对重复条目的正文元数据、部署目标和包字节，
  合并历史版本；同 ID 内容冲突、版本冲突、孤儿历史、无效条目或缺失包必须
  保留原始来源并报告具体错误，不能按时间戳覆盖或过滤掉错误条目。
- Plugin 迁移不改变当前领域存储模型或 schema。完整原始元数据先以内容散列
  保存到 `recovery/plugin-metadata-v1/<hash>.json`，现有包源不删除；复用 bundle
  journal 在同一次发布中写入合并结果并退役旧元数据。发布失败回滚文件和
  配置，成功后记录 `schema_migrations`。中断重开先恢复 journal，重复启动
  不再导入已退役来源，也不复活用户随后删除的 Plugin。
- 回滚或人工恢复以该恢复副本及原包源为输入，在隔离副本中处理冲突后走正式
  导入/迁移；不要把旧元数据直接覆盖到正在写入的根。该局部修复不代表
  Foundation 的 SQLite 权威转换已完成。合并扫描为 O(条目数 + 历史数)，输出排序
  为 O(n log n)，包核对
  为 O(文件字节数)，逐文件计算散列，不把整个包复制进内存。

- 在高风险布局迁移或升级前，应具备保险快照、预备份或等价的可回滚手段。
- 恢复或迁移失败后，不应把用户留在半恢复或半迁移状态。
- 启动恢复判定必须把故障范围传递给用户明确选择的恢复操作；仅当启动已判定完整
  canonical storage 无效且用户选择当前 SQLite 时，才可在 Prompt 图仍有效的情况下
  重建完整文件权威。普通恢复调用仍必须拒绝覆盖有效文件权威。
- 正常启动只执行版本化迁移、校验和可证明确定的自动修复，不扫描恢复候选，也不弹出
  恢复来源选择。恢复候选浏览和来源选择只可由用户在设置的数据恢复入口显式触发；
  unresolved canonical 故障必须在下一次启动重新检查，不能用 dismiss marker 永久跳过。
- Rule 恢复只发布 PromptHub 托管正文、元数据、历史和 SQLite 投影，不得隐式写入、
  创建或跟随符号链接改写外部 target。导入后只派生同步状态，外部写入必须由显式保存、
  部署或冲突解决触发；失败时恢复导入前的可读托管状态。
- 完整恢复、portable restore、升级恢复和数据库恢复必须先在不可见 stage 中准备
  候选，校验容量、路径、symlink、schema、hash、SQLite quick-check 与领域数量，
  再通过 durable journal 发布。任一 DB、文件、配置或领域步骤失败时必须回滚；
  崩溃后的下一次启动必须在打开业务服务前完成或回滚 journal，不能报告 partial
  success。
- 全量 portable snapshot 只能在一个 storage maintenance intent 内生成：先阻止新
  client，关闭 writer，创建一致 SQLite image，投影 canonical tree，核对 logical
  envelope 与 canonical inventory，再流式写 ZIP。选择性导出不得附带未选择领域的
  完整 canonical checkpoint。
- 恢复候选、安全点、被覆盖根和 pre-restore 状态统一进入有界 recovery registry，
  按数量、年龄和总字节限制清理。正在使用的 operation ID 必须受保护；损坏、未完成
  或越界 artifact 不得被当作可恢复快照，并应在确认其为 registry 直接管理的普通
  目录后由 retention 清理；不得跟随符号链接或清理受保护 operation ID。
- Desktop 在启动过程新建或采用 upgrade/layout safety point 时，必须在各自 registry
  的格式和删除所有权不变的前提下，统一协调 upgrade safety point、recovery artifact
  与数据库 safety point 的总量；没有新建或采用安全点的普通启动不得扫描备份树。
  至少保留每类最新一个、pinned artifact 与未完成布局迁移引用的有效点；额外历史按新到旧进入
  `max(512 MiB, active durable bytes * 3)`、最多八个、30 天的总预算。受保护最小集合
  可以超过预算；无 manifest 或无法证明所有权的历史目录不得由该协调器自动删除。
- 同一次应用升级只应创建一个可复用的完整 safety point。应用内安装必须记录精确
  target version；首次启动仅可复用 last-run marker 之后创建、版本转换完全匹配且具备
  现代完整 manifest 的点。紧随其后的布局迁移和带有效 marker 引用的残留重试必须
  复用该完整点，不得再创建整树或稀疏重试副本。
- recovery artifact 发布必须先持久化 operation-owned `preparing` manifest，再移动
  prior tree，最后原子发布 `complete` manifest。移动 prior tree 后中断时，启动恢复
  必须按 manifest 身份继续发布，不能把已提交的新数据回滚掉，也不能遗失唯一 prior
  set；未知或冲突身份必须 fail closed。journal 与 artifact registry 的既有祖先路径
  必须逐级拒绝符号链接，不能仅检查最终文件或目录。
- 全量恢复 journal 的 stage/prior 路径必须与 `activeRoot + operationId` 派生路径精确
  一致，仅位于 active root 内不足以证明 ownership。operation/artifact ID 必须是安全的
  单一路径段并拒绝 `.`、`..`。根目录迁移 journal 必须持久化 inventory 是否包含
  secrets，并在 prepared rename 恢复时使用同一策略比较 digest。
- storage inventory 与 recovery artifact 扫描的 entry 上限同时计算目录和文件，避免
  大量空目录绕过遍历容量限制。
- 当前目录残留恢复重试时，旧根目录中的空 `prompthub.db` 占位文件不得阻断
  Skill/workspace 残留迁移。若旧根 `prompthub.db` 与统一目录
  `data/prompthub.db` 同时存在且内容冲突，必须先把旧根数据库保留为
  `prompthub.db.legacy-conflict-*.db` 备份，再移除根残留并完成布局迁移；
  符号链接形式的旧根数据库必须继续作为风险残留保留并提示失败。
- 桌面运行时数据库路径选择必须优先使用已存在的 `data/prompthub.db`。只有当
  统一目录数据库不存在时，旧根 `prompthub.db` 才能作为旧布局兼容 fallback，
  避免历史 partial marker 让根残留重新成为当前数据库。
- 预升级快照必须跳过 Electron 在 `userData` 根目录创建的运行时 singleton
  条目（`SingletonCookie`、`SingletonLock`、`SingletonSocket`）。这些条目不是
  用户数据，不得导致布局迁移快照失败；但用户数据 payload 内的其它符号链接
  仍必须拒绝。
- canonical 预升级快照必须保存当前一致 SQLite image，但不得把 `data/` 中独立的
  `prompthub.db.backup-*`、`prompthub.db.pre-*` 或 `prompthub.db.corrupt-*` 恢复源再次
  嵌套复制。原文件仍由数据库恢复候选发现，不因快照净化而删除。
- 预升级备份、legacy 预升级备份迁移、以及从预升级备份恢复必须拒绝符号链接；
  不得把 `userData` 外部引用作为快照内容保存、迁移或恢复进当前数据目录。
- 数据库恢复合并附带资产、工作区文件或浏览器存储目录时必须跳过符号链接；
  不得把所选恢复来源之外的文件内容导入当前数据目录。
- 数据库恢复候选中的 `prompthub.db`、`data/prompthub.db`、独立数据库
  备份文件、以及用户直接拖入的数据库恢复源必须是 link-safe 普通文件，并通过
  真实 SQLite 表读取确认含有 PromptHub Prompt、Folder、Version、Rule、Skill、
  Setting 或其它可恢复业务记录；不得仅依赖 `.db` 后缀判断，也不得通过符号链接
  读取或恢复外部数据库内容。损坏或无法识别的文件必须拒绝；暂时被锁定的有效
  SQLite 文件应保留为候选，并在可用时回退展示同目录的持久文件清单。
- 桌面端备份拖拽入口必须区分导出包合并导入与 SQLite 整库恢复。PromptHub 生成的
  `backup-*`、`backup-before-*`、`pre-recovery-*`、`integrity-backup-*` 和
  `legacy-conflict-*` 数据库备份，无论是否带最终 `.db` 后缀，都应进入恢复候选预览，
  并在用户明确确认后才替换当前数据库。
- 恢复候选检测不得把符号链接指向的外部 workspace、renderer storage、
  file storage 或 skill 目录计为可恢复数据。
- 用户明确添加的历史目录只要含有 link-safe 的 `data/` 或 `config/` 持久数据就必须
  进入候选，包括 MCP、Rule、Plugin、Skill、媒体与未来新增的数据子目录；不得因
  Prompt/Skill 行数为零或 SQLite 暂时锁定而丢弃。恢复界面必须展示这些数据类别，
  目录恢复必须无覆盖地合并完整 `data/` 与 `config/` 树。
- 选择性导出中的 Skill、MCP 与 Plugin 是独立范围。全量备份和导入确认必须明确
  展示 Prompt、Folder、Version、媒体、AI 配置、系统设置、Rule、Skill、MCP 与
  Plugin，不能用 Skill 代指其它 Agent 资产。
- 手动数据路径迁移复制当前 `userData` 到新根目录时必须跳过源目录树中的符号链接；
  不得把当前数据根之外的链接目标变成新数据根中的真实文件。
- 数据路径预览/检测不得把符号链接形式的 marker 目录或数据库文件计为真实
  PromptHub 数据，避免把外部链接目标误判为可切换的数据根。
- 数据路径目标根目录本身不得是符号链接；预览或应用数据路径变更时必须在切换
  或复制数据前拒绝该目标。
- 预升级快照创建失败时必须清理半成品快照目录，避免留下没有 manifest
  的恢复候选。
- 从自部署 Web 恢复远程桌面快照只能由用户显式触发。恢复前必须先成功创建
  本地安全快照；本地快照失败、远端校验失败、协议不兼容或版本不兼容时，
  不得清空、合并或替换当前数据，也不得静默回退到旧 live-sync 数据。
- 自部署 Web 返回远程恢复快照前必须校验不可变 envelope 与 payload 的
  SHA-256。最新快照损坏时必须停止并报告错误，不得静默选择更旧快照；每个
  认证用户只能列出和读取自己的快照。
- 数据库启动完整性检查只允许自动修复两类可证明可重建的派生结构：freelist
  计数不一致，以及诊断全部为 `wrong # of entries in index <name>` 的索引条目
  不一致。修复前必须在数据库旁创建带时间戳的原文件备份；索引名必须先在
  `sqlite_master` 中确认，所有 `REINDEX` 必须位于单事务内，并在提交前及新连接
  上重新通过 `PRAGMA quick_check`。其它损坏必须停止初始化，不得用空库、默认值
  或猜测性表级恢复掩盖。
- 历史 Prompt 若完全缺少 `prompt_versions` 行，数据库迁移必须在规范资源图校验前
  从当前 Prompt 行合成版本 1，并把 `current_version` 对齐到最高正版本。该修复必须
  幂等且不得改写已有有效版本；迁移完成后，规范资源 schema 仍必须拒绝非正版本。
- 桌面端首次发布 canonical authority 前必须先完成源数据库迁移；迁移失败必须停止
  发布。内置 Rule 平台在尚未发现目标文件时可以保留纯占位记录，但仅当记录同时为
  `target-missing`、版本 0、无托管内容、无目标内容且无历史版本时，projector 才能
  将其排除。任何已有内容或历史的 Rule 都必须继续通过严格的正版本校验。
- canonical 数据根允许与独立所有者的运行时文件共存，但只能按精确名称和类型放行：
  Prompt 图读取可忽略由旧工作区管理的根 `.versions` 普通目录，以及由 Agent 外观
  功能管理的根 `agent-appearance` 普通目录；MCP bundle 枚举可忽略市场源注册表
  `market-sources.json` 和已被 canonical bundle 取代的 `library.json` 普通文件；Plugin
  bundle 枚举可忽略已被取代的 `library.json`、`market-cache.json` 与 `versions.json`
  普通文件。Plugin 旧元数据按本文件的启动迁移约定合并独有条目和历史，成功后通过
  journaled writer 退役源；普通读取不得覆盖或复活已迁入后删除的记录。
  MCP 凭据必须进入设备绑定的加密存储，不能写入 bundle
  JSON。尚未配置自托管同步、renderer device ID 为 null 时，本地 MCP binding 与
  Plugin projection 使用稳定的存储根身份，不得因此阻断兼容迁移。类型替换、符号
  链接和其它未声明路径仍必须 fail closed。
- 旧 MCP `library.json` 迁移到 canonical bundle 时，空 `env`/header 值表示未配置
  占位状态，应保留在资源文件中；只有非空 literal 凭据进入设备加密 vault。设备
  vault 不可读不得让 renderer 的 My MCP 清单变为空：已验证文件定义仍须以脱敏值
  返回，但需要真实凭据的执行和写入继续 fail closed，文件结构错误不得降级忽略。
- 已存在 canonical authority marker 时，启动必须验证尚未转换的文件领域；已转换
  的结构化领域只使用 SQLite。尚未迁移的派生目录可在业务 SQLite 可读、全部
  SQL 权威表被保全时校验和修复。
  SQLite 缺失或损坏必须进入恢复；文件图不能替代其中的配置、秘密引用和操作记录。
  Agent Provider 通过 `agent-provider-sqlite-v1` 启动迁移后仅使用 SQLite；旧包原字节
  保存在 `recovery/agent-provider-sqlite-v1/`，同 ID 冲突不覆盖，删除后不从旧包复活。
  Prompt/Folder/历史/关系/输出格式由 `prompt-sqlite-v1` 合并转换；同 ID 内容冲突
  或媒体同名不同字节不得覆盖。原图与清单保存到 `recovery/prompt-sqlite-v1/`，
  引用媒体复制到 runtime path 指定目录，SQL 提交核对后退役旧图。正常 CRUD 不写
  canonical Prompt JSON；目录维护从 SQL 保留 Prompt 图。已完成后再次出现的旧图
  只有与完整 SQL 图一致才能退役，不一致必须显式恢复，禁止复活删除记录。
  回滚这些升级前先保留当前数据，再恢复迁移前完整安全点及其匹配文件；不得单独
  回填旧 JSON。仅在 Prompt 尚未转换、旧图被写入器破坏但当前 Markdown workspace
  唯一、严格可解析且媒体来源确定时，启动应
  自动 stage、验证并 journal 发布修复结果；重复 ID、解析错误、危险路径、缺失或
  digest 冲突等歧义才进入 recovery-required。canonical 模式不得再执行 DB 到旧
  Markdown workspace 的反向导出。混合目录自愈可跳过同时含普通非符号链接
  `manifest.json` 与 `prompt.json` 的顶层旧 canonical Prompt bundle；这些目录只保留
  于恢复 artifact，并在 stage 内由新图替换。旧媒体文件名已不存在时，只可从同一
  Prompt ID 的完整已验证 bundle 读取 kind/reference 到对象哈希映射，并在对象库再次
  校验声明哈希与字节数；不得借此采用旧 bundle 的 Prompt 正文或元数据。残缺伪装目录、
  损坏对象和其它未声明文件仍须拒绝。
- 旧 Markdown 工作区由 `prompt-workspace-v1` 在启动时一次转换到 SQLite；同 ID
  冲突不得按更新时间覆盖。源文件完整保留在 `recovery/prompt-workspace-v1/` 后退役，
  完成记录阻止重放。恢复标记即使面对空库也禁止旧文件复活记录；失败保留源并回滚。
  显式 Markdown 导出写入 `cache/prompt-workspace/`，不参与自动恢复或普通 CRUD。
  回退旧版本前保全当前数据，再在隔离根同时恢复迁移前数据库 safety point 和对应
  Markdown 恢复副本；不得仅回填文件到正在使用的数据库。
- 文件自愈对 Prompt 与 Folder 父子图执行线性依赖排序，并拒绝缺失父项、环、
  符号链接、特殊文件、未声明文件、超限文件和超限清单；SQLite 缺失或不可读
  时仍可展示有效文件候选。替换 SQLite 前必须持有迁移/维护意图且没有活跃或
  未知数据库客户端。
- `rules/.versions` 与 `rules/projects` 只可作为普通空兼容目录与 canonical Rule
  bundle 共存，非空、符号链接或类型替换必须 fail closed。派生 SQLite 对缺失对应
  用户行的 Skill owner 投影为 null。Agent profile 允许同名并保持独立 ID，catalog
  修复保留 SQL 的 archived 状态及 model mappings，不能按时间选择或归档用户配置。
- WebDAV、S3、自部署快照恢复和手动整包导入在改变本地数据前必须创建安全快照。
  任一数据库、文件、媒体、Rule、Skill、MCP 或 Plugin 恢复步骤失败时，必须尝试
  恢复安全快照；空数据目录必须创建仅含清单的空基线，不能因本地无数据而跳过
  回滚保护。回滚失败必须作为独立错误暴露，不能把部分恢复报告为成功。
- 迁移所需的数据库原文件备份或升级安全快照创建失败时必须停止迁移/升级写入，
  不得记录警告后继续打开并修改旧数据库。
- 文件优先 authority 的首次发布必须发生在 renderer 持久状态迁移之后。旧数据树先
  保存为一个有界 UUID safety point，再 stage canonical tree 和重建目录；只有 hash、
  graph、SQLite、fresh reopen 与运行期 context 刷新全部成功才提交。失败继续使用旧
  authority，不得留下 marker 指向半成品。
- Windows 上 canonical SQLite 临时库必须使用与目标 basename 无关的固定有界 sibling
  名称；自动启动与用户选择数据库恢复的 checkpoint target 必须共用固定有界 UUID
  形式，checkpoint stage 也不得重复 target，避免路径逐层放大后超过 SQLite VFS 路径
  预算。任务自有临时库清理必须覆盖 SQLite sidecars 和相邻 `.lock`。升级发布门禁必须
  在同一隔离 profile 上完成首次 renderer migration handoff 和第二次 canonical
  authority publication；只验证第一次 window ready 不足以证明升级后可重启。
- 资源 schema 转换必须使用 durable publication journal。转换中断后启动时先完成或
  回滚 journal；未知较新 schema 不得被旧客户端降级写回，用户 revision 不随 schema
  转换递增。

### 3. Stable Internal Sources

- 目录迁移与数据布局事实见 `spec/knowledge/structure/storage-architecture.md`。
- 历史恢复/迁移计划和事故收敛记录保存在 `spec/changes/legacy/docs-08-todo/`。

## Stable Scenarios

### Scenario: Contributor changes recovery behavior

When backup, restore, migration, or recovery behavior changes materially:

- they update this owning topic when requirements change, marking implementation gaps
- they keep a plan only when needed under the documentation routing rule

### Scenario: User encounters upgrade-risking data operations

When the app is about to perform risky data operations:

- the system should prioritize recoverability and user awareness over silent convenience

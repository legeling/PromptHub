# Database Concurrency

## Purpose

本规范定义 Desktop、CLI 与 self-hosted Web 在同一数据目录使用
`node-sqlite3-wasm` SQLite 文件时的稳定并发与恢复边界。

## Stable Requirements

### 1. Durable Source Of Truth

- 当前数据所有权遵循 [Storage architecture](../structure/storage-architecture.md)：SQLite 负责结构化业务记录、关系、版本元数据与设置，文件系统负责真实包文件、附件与历史文件内容。旧 canonical authority 标记仅服务升级识别，不表示现行 SQLite 可随意删除或重建。
- `settings` 是兼容配置表；`users`、`refresh_tokens`、`user_settings` 是
  server-authoritative 表；migration intent、client lease、Agent session index 与
  conversation metadata 是 operational 表。重建同设备目录时必须显式保留这些表，
  portable snapshot 不得把密码哈希、token 或设备状态写入 canonical 用户资源。
- `${dbPath}.clients/` 只保存进程租约，用于判断运行时锁是否可能仍有活跃所有者；
  它不是业务数据，也不能替代 SQLite 状态。

### 2. Live Lock Safety

- 初始化不得无条件删除 `node-sqlite3-wasm` 使用的 `${dbPath}.lock` 目录。
- adapter 的 `run`、`get`、`all` 每次完成后必须 finalize 底层 WASM statement；
  可复用 statement wrapper 在下一次调用时重新 prepare，不能让已完成操作长期持锁。
- 当其它已登记 PromptHub 进程仍存活时，必须保留锁并由 SQLite 等待或返回 busy。
- 当锁没有可验证的租约来源时，共享数据库调用方必须默认保守保留，避免在
  新旧版本并行时放行第二个 writer。只有已经通过外部单实例机制确认进程互斥的
  host，才可显式启用未登记 legacy lock 恢复。
- 当租约无法安全清理，或锁路径不是非符号链接的普通目录时，所有调用方都必须
  保守保留。

### 3. Orphan Recovery

- 进程初始化数据库前登记 PID 租约，正常关闭或进程正常退出时清理租约。
- 默认只有发现并成功清理已死亡或无效的既有租约，且没有活跃或未知所有者时，
  初始化才可清理对应 orphan lock。
- Desktop 在通过 Electron 单实例 gate 后，可恢复升级前版本遗留的未登记普通
  lock；self-hosted Web 在每个 `DATA_ROOT` 只有一个服务进程的部署边界内也可
  显式启用该能力；CLI 与其它共享调用方不得默认启用该能力。
- Desktop 版本升级的安全快照早于常规数据库初始化；它在打开 SQLite 生成一致性
  镜像前必须复用同一 guarded recovery。可证明无主的普通 lock 可以恢复，live、
  unknown 或 unsafe owner 必须保留现场并阻止版本标记前移。
- 初始化中途失败必须清理本进程刚创建的租约，避免制造新的假所有者。
- CLI 必须通过不打开 SQLite 的显式 `doctor database-lock` 命令报告 lock、live
  lease、stale lease 与未知项；普通业务命令不得因发现 ownerless lock 自动删除它。
- `doctor --help` / `doctor -h` 返回帮助与退出码 0；帮助优先于动作校验、路径检查和恢复，
  即使同时带 `database-lock --recover` 也不得修改锁或打开 SQLite。无参数 `doctor`
  仍按缺少动作返回 usage error / 2。
- 只有用户明确执行 `doctor database-lock --recover` 时，CLI 才能恢复没有 live/unknown
  owner 的非符号链接普通 lock 目录。活跃 PID、未知 lease 项、符号链接、非目录 lock
  或非目录 clients 路径都必须 fail closed 并保留现场。

### 4. Contention And Visibility

- 数据库连接使用有界 `busy_timeout` 吸收短暂写入重叠；超时后 CLI 返回
  `DATABASE_BUSY` 与 conflict exit code，不能把真实损坏错误误标为锁冲突。
- Desktop 在重新获得焦点或从 hidden 恢复时重新读取 Prompt、Relation、
  Output Format 与 Folder，并合并同时发生的重复 refresh。
- Desktop 不通过第二份 renderer 持久状态或持续轮询复制 SQLite 数据。

### Shared-runtime opening (#198)

Desktop 已打开当前库时，CLI 普通命令必须通过 DB 的常规初始化、schema/checksum、
quick_check、迁移意图与客户端租约检查，共享现存数据库；不得仅因保留旧 authority
标记而调用需要替换数据库文件的独占 catalog reconciliation。未知租约仍拒绝，
需要结构迁移或完整性修复时仍遵守现有独占门禁。显式 catalog repair 继续要求
所有客户端退出。没有新 schema、迁移脚本或持久化字段；回退此启动判断会恢复
CLI 与 Desktop 并行打开失败，但不改变数据布局。

2026-10-22: 真实独立 CLI 进程在 Desktop reader 保持打开时 create 退出 10，
错误为 "Canonical catalog repair requires all database clients to be closed"。
回归入口：Desktop integration 的 workspace-refresh.test.tsx；修复后 9 项工作区集成、52 项相关 CLI 与 34 项 Core 回归通过；普通共享读写成功，未知租约和显式 repair 的独占门禁仍保留。可重跑命令与替换边界见 [Desktop refresh](desktop.md#verification-and-delivery)。

### 5. Startup Integrity Gate

- 既有数据库在取得进程租约后、执行迁移或业务写入前必须运行
  `PRAGMA quick_check`；新建或空数据库可直接进入初始化。
- 只有诊断全部属于 SQLite freelist 计数不一致，或全部属于可验证的
  `wrong # of entries in index <name>` 时，初始化器才可自动修复。freelist 使用
  `VACUUM`；索引名必须在 `sqlite_master` 中存在，并在单事务内执行 `REINDEX`。
  两类修复都必须先创建带时间戳的原文件备份，并使用新连接再次得到 `ok`。
- 其它完整性错误不得被误判为锁冲突，也不得猜测性修复。初始化必须停止，并保留
  原数据库供备份恢复或人工诊断。

### 6. Migration Leadership And History

- 结构迁移前必须取得 path-scoped migration intent；已有活跃 client lease 时不得
  执行破坏性迁移。intent 有有限等待、owner PID、operation ID 和 stale-owner 恢复，
  malformed/symlink 路径必须 fail closed。
- schema、legacy adoption、索引、checksummed migration history 与
  `PRAGMA user_version` 在同一事务提交；任一结构步骤或 finalization 失败必须整体
  回滚，不能吞掉异常后正常返回。
- 当前 migration manifest 是 numeric schema、表、索引、列、legacy identity、checksum
  与 destructive classification 的单一来源。新增结构变化必须追加不可变 entry，不能
  修改已经发布的 identity 或 checksum。
- 初始化先拒绝较新的 numeric schema、未知 history 或 checksum mismatch，再创建
  安全点或执行写入。迁移提交后必须用当前连接与只读 reopen 分别校验
  `quick_check`、必需表/索引、manifest history、schema version 和领域不变量。
- Desktop 的 Skill 本机仓库发现属于 host reconciliation，不属于共享 schema
  migration。CLI 或 Web 先打开数据库不得把 Desktop 后续 reconciliation 标记为已完成。

#### Current-schema reopen idempotency (2026-10-19)

The DB-owned migration finalizer checks the current `user_version` before writing
it. Assigning an identical SQLite header value otherwise causes a redundant
durable write on every CLI/database reopen. History checksum validation, migration
transactions, intent/lease ownership, integrity checks and real upgrade writes
remain unchanged. No schema, historical migration identity/checksum, storage
layout or compatibility branch changes; rollback only restores the redundant
write. The additional version read is constant-time and uses the existing parser.

`database-startup-idempotency.test.ts` opens a populated current database twice
and checks exact database bytes, migration history, Prompt content, schema version,
integrity and foreign keys. Existing populated schema-upgrade, rollback/retry and
migration-lock tests remain required alongside CLI suite timing.

Verification on 2026-10-19: the six Core regression files passed 23 cases;
Desktop migration-lock and historical-fixture tests passed 27 cases. DB/Core/CLI
types and the three Core storage-performance cases passed. The unchanged
four-worker CLI suite passed all 177 cases in 57.7 seconds, below its original
75-second suite budget (the preceding run took 75.9 seconds by the budget timer).
Timing is local evidence, not a cross-machine performance guarantee.

An isolated DB source copy restored only the unconditional header assignment.
The new reopen regression exited 1 at the exact-byte equality assertion; the
working source passed. An initial dependency-link failure selected zero tests
and is not regression evidence. No historical migration manifest was edited,
and full release/platform acceptance remains paused and incomplete.

The final DB change also passed 48 Core credential/codec/vault cases and 47
Desktop settings/proxy cases through the existing registered-IPC workflow.
Changed-file lint, test-inclusive Desktop typecheck (including Core tests),
file-size and spec governance checks passed. The shared checkout contains
parallel Plugin work outside this repair; these results do not establish a
frozen full-repository candidate or acceptance of that separate work.

### 7. Task-Owned Databases And External Stores

- PromptHub 自有临时 SQLite 必须使用 `packages/db` 的有界 label + full UUID
  sibling 路径；不得把任意目标 basename、PID 和另一组 UUID 逐层重复到临时库路径。
- 自动启动与用户选择数据库恢复所创建的 canonical checkpoint 祖先目录必须使用同一
  固定有界 UUID 形式；恢复场景不得额外叠加操作名或 PID 消耗 SQLite 路径预算。
- 当前操作可证明拥有的临时数据库在成功转交或失败清理时，必须处理数据库本体、
  `-journal`、`-shm`、`-wal` 和 `node-sqlite3-wasm` 的相邻 `.lock` 目录；不得借此
  删除 operational `.clients` 或绕过 live/unknown owner 规则。
- 外部 Agent 会话数据库在 schema validation、成对数据库的后续 open 或能力探测
  失败时，必须关闭已经打开的 handle；只有成功返回的 handle 才转交给调用方。

## Stable Scenarios

### Scenario: CLI writes while Desktop is open

When Desktop 已持有一个写事务且 CLI 打开同一数据库：

- CLI 不得删除 Desktop 的 lock
- 短暂冲突应等待现有事务结束
- 超出等待上限时应返回可操作的 busy 冲突
- 用户返回 Desktop 后应看到 CLI 已提交的数据

### Scenario: Previous process crashed while writing

When lock 对应的已登记进程已经死亡：

- 下一次初始化清理死亡租约
- 没有其它活跃或未知所有者时恢复 orphan lock
- 数据库随后按正常初始化和迁移流程打开

### Scenario: User explicitly diagnoses a CLI lock

When CLI 因 ownerless lock 返回 `DATABASE_BUSY`：

- `prompthub doctor database-lock` 只检查租约与路径类型，不打开或迁移数据库
- 可安全恢复时返回结构化 `recoverable` 状态，但不修改 lock
- 用户加 `--recover` 后才删除可证明无主的普通 lock，并返回 `recovered`
- 任一活跃或未知 owner 存在时返回 conflict，原 lock 保持不变

### Scenario: Desktop upgrades from a pre-lease version

When Desktop 已通过 Electron 单实例 gate，且数据目录只剩一个没有租约登记的
普通 `.lock` 目录：

- Desktop 可将其识别为 legacy orphan lock 并恢复
- 如存在活跃租约、未知租约项、符号链接或非目录 lock，仍必须拒绝清理
- CLI 与其它共享调用方面对同一未登记 lock 时仍默认保留

### Scenario: Self-hosted Web restarts after a crash

When a single self-hosted Web process starts with an ownerless legacy lock in
its mounted `DATA_ROOT`:

- Web may recover the ordinary lock through the guarded initializer hook
- a live registered client, unknown lease, symlink, or non-directory lock still
  prevents recovery
- multiple Web processes must not share the same SQLite data root

### Scenario: Existing database has a stale freelist count

When startup quick-check reports only a freelist count mismatch:

- initialization preserves a timestamped byte-for-byte backup
- SQLite rewrites the database through `VACUUM`
- normal startup continues only after a fresh quick-check returns `ok`
- broader corruption still fails closed without automatic salvage

### Scenario: Existing database has index entry-count damage

When startup quick-check reports only entry-count mismatches for existing indexes:

- initialization preserves one timestamped byte-for-byte backup
- every diagnostic index is validated and rebuilt inside one transaction
- the transaction and a fresh connection must both report `ok`
- an unknown index name or any additional diagnostic stops startup without repair

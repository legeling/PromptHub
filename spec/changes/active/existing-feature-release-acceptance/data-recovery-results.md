# 数据迁移与备份恢复验收记录

Status: D5 baseline verified; joined Provider/Generation roundtrip fails; release acceptance incomplete

## 结论

最新（2026-10-09）：本轮按用户范围仅补现有功能测试。非空 Provider/Generation 与其他域同一 ZIP 的三项新增联合用例为 **1 pass / 2 fail**；两个正常恢复在两次启动后均发现 model mapping ID 改变及 Generation bundle manifest hash 改变，严格身份/字节断言保留。config 发布 EIO 回滚与两次启动通过，类型/lint 通过。已验证其他实体/历史/包/媒体、设置选择、Generation 业务 manifest 和 PNG/CAS 输出保全；不能据此宣布完整身份/包字节往返通过。第五轮 D5 四项已接受基线不重复运行；D1 沿用已通过证据，D2 的两条失败断言与 D3/D4 差距保持。具体差异、源码路径及未测边界见第六轮；第一至第五轮保留当时证据。

第一轮运行 501 项 Vitest 用例，499 pass、2 fail；另有独立真实 SQLite 脚本四组检查通过。通过数包含局部 mock 合同，不能作为完整业务覆盖率。下面是 40 项能力/证据层级的覆盖分母：{"pass":24,"fail":4,"blocked":7,"not-run":4,"unsupported":1}。

第二轮已落库三份 integration 测试，共 11 项：5 pass、6 fail（D1 五个分块切点、D2 一项加密承诺）。失败用例保留正确行为断言；新增测试定向类型检查与 lint 通过，完整 typecheck:tests 因本范围外 297 个诊断失败。详细命令、测试有效性审计和清理在末节。

## 基线、隔离与边界

- 工作目录：`/Users/lingxiaotian/Programs/personal/PromptHub`。起止 HEAD 均为 `108f375bcd2c3e94c20d93dd619d641b6386b352`。
- 执行日期：2026-10-04，Asia/Shanghai；检查 17:24:43 起，末个检查时间见执行表。Node v26.7.0、pnpm 9.15.0，复用 node_modules，无安装/构建/发布。
- 起始已有计划列出的八个脏文件，另有协调方修改的 `spec/changes/index.md` 与验收目录；未改动它们。结束时产品差异仍仅 renderer-persistence.ts，核心/main/db/shared 无任务改动。产品源码 diff SHA-256：`77a1061f58d601fba045cf84d082373f2db14646aa1914e6a1b1e002d88fc16b`。
- 唯一任务根：`/tmp/prompthub-data-acceptance-U1TiLmIn`；子进程 TMPDIR 指向该目录，不改 HOME。所有数据为合成 fixture，不读用户 DB/Agent 配置/云盘。
- 每次只有一个检查进程；Vitest min/max worker=1，禁用共享缓存，父进程 deadline 240 秒，输出重定向到独占目录；启动前检查现有进程/监听端口，未终止或复用用户服务。
- GUI、Electron 启动、Playwright、浏览器、真实账号、付费模型均未执行。`vi.mock("electron")` 只提供 handler 注册器，不是 GUI 自动化。
- 数据来源优先级核对：AGENTS、testing-standards/storage-evolution、data-recovery/database-concurrency/sync、现行 foundation 与本验收计划、实现及测试。历史记忆不作为本轮验收证据。

## 功能入口和实际覆盖

入口盘点来自 DataSettings 的 LocalData/Backup/Recovery/WebDAV/S3/SelfHosted/AutoSyncHistory/Danger 面板、SecuritySettings/FolderModal、注册 IPC、Core/DB API，不仅来自测试名称。

| 功能/平台                 | 真实入口                                                    | 操作与预期结果                                                                 | 测试路径/用例定位                                                  | 状态        | mock/未测边界                                                        |
| ------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ----------- | -------------------------------------------------------------------- |
| 初建与版本化迁移          | packages/db initDatabase                                    | 当前 schema、migration manifest、quick_check                                   | disk / database-migration-locks                                    | pass        | 真实 SQLite；不等于 Electron 首启                                    |
| 旧版升级                  | initDatabase + historical fixture                           | v0.4.7/0.4.8/0.5.1/0.5.2；Prompt 四版本与 Skill 历史、安全点、再次初始化       | disk / database-historical-fixtures + historical-canonical-rebuild | pass        | 合成旧 schema，非各版安装包产出的全域 profile                        |
| 未来版本/迁移失败         | initDatabase                                                | 较新 schema、checksum mismatch、备份失败、statement failure 保全               | disk / database-migration-locks                                    | pass        | I/O 失败部分使用注入                                                 |
| 旧目录升级                | migrateDataLayout                                           | 根 DB→data；冲突 DB 留存；残留重试；拒绝 symlink                               | disk / data-layout-migration                                       | pass        | 真实临时文件/SQLite；不接触真实 HOME                                 |
| FTS/关系约束              | PromptDB/FolderDB + SQL                                     | 更新/删除同步 FTS；运算符转义；FK、自关联、唯一性、级联                        | persistence-fixed                                                  | pass        | 真实 SQLite；业务 CRUD 全面覆盖归 Prompt 组                          |
| 持久化关闭重开            | initDatabase/closeDatabase                                  | Unicode、私密标记、关系、设置保留；删除后重开为空                              | persistence-fixed                                                  | pass        | 关闭连接重开，非 OS 重启                                             |
| 数据库锁/租约             | initDatabase + owned temporary DB                           | live/unknown lock、migration intent、lease、sidecar 清理                       | disk + core                                                        | pass        | 真实文件与进程探测替身混合；无多原生客户端 E2E                       |
| 升级安全点与保留          | createUpgradeBackup / startup / retention                   | 重复升级复用、pinned、未完成引用、预算、无新安全点不扫描                       | disk + recovery                                                    | pass        | 文件系统真实；策略故障注入                                           |
| 历史候选扫描              | detectRecoverableDatabases / recovery candidates            | 损坏 DB、锁定 DB、独立文件、仅资产目录、symlink                                | recovery                                                           | pass        | 合成旧目录；不扫描用户历史资料                                       |
| 整库及目录恢复            | journaled database recovery                                 | 数据库替换、原库安全副本、资产/config 无覆盖合并、重开                         | disk + recovery                                                    | pass        | 真实 SQLite/文件；非设置弹窗                                         |
| 数据根切换恢复            | applyStorageRootChange/recoverPendingStorageRootChange      | rename 中断、inventory digest、危险路径、旧根保留                              | core / storage-root-operation                                      | pass        | 真实文件；部分 DB payload 为字符串 fixture，不代表业务 DB 重绑完成   |
| 选择性 ZIP 导出           | createPortableSnapshotZip                                   | 选中域清单、二进制字节、manifest/hash、临时 stage 清理                         | disk / portable-snapshot-archive                                   | pass        | 真实 ZIP/文件；资源本身为合成 fixture                                |
| 全量导出维护编排          | createCheckpointedPortableSnapshotZip                       | close→checkpoint→一致性→ZIP→reopen；失败清理                                   | disk / canonical-portable-export                                   | pass        | checkpoint/DB open/ZIP 为注入替身，仅局部编排                        |
| portable 导入/恢复        | extractPortableSnapshotZip / restorePortableSnapshotArchive | hash、穿越、孤儿 canonical、过期 envelope 拒绝；恢复 DB/Rule/Plugin/Generation | disk + core portable suites                                        | pass        | 真实文件/SQLite；加密可用性替身                                      |
| 恢复中断/回滚             | journaled storage restore                                   | 发布失败回滚全部域；journal 重入；commit 后 retention 失败不反转结果           | core / journaled-storage-restore                                   | pass        | 真实文件与故障注入；非 OS 强杀                                       |
| 备份文件往返              | exportDatabase / restoreFromBackup                          | Skill 嵌套文件、二进制、100000 次重复文本、图片/视频、版本                     | filesystem integration                                             | pass        | 真实磁盘；元数据/媒体 IPC 替身，非完整 SQLite 恢复                   |
| 主密码/密码更换           | security registered handler / security helpers              | 锁定、错误密码拒绝、更换密码后旧密码失效、DB 重开                              | sync security suites + persistence-fixed                           | pass        | 真实 crypto；既有 security 单测 DB 是 Map，补充脚本 DB 为真实 SQLite |
| 加密字节保全              | encryptText/decryptText                                     | 文件 hash、重开解密、1MiB/Unicode、错误 key、IV/tag/ciphertext 篡改拒绝        | sync / security.test + persistence-fixed                           | pass        | 独立 helper；不能证明私密目录已加密                                  |
| 私密目录加密承诺          | FolderModal → registered folder/prompt/security IPC         | 私密保存→lock→close/reopen 后不应明文存储                                      | protocol-fixed / private-folder test                               | fail        | D2；IPC 注册层替身，无 Electron 进程；明文事实已实测                 |
| WebDAV 正常协议           | registerWebDAVIPC                                           | PROPFIND/PUT/GET/stat；真实文件 hash；401/404/500                              | protocol-fixed / normal test                                       | pass        | 真实本机 HTTP；仅 Electron 注册器、proxy、E2E 分支替身               |
| WebDAV Unicode 分块       | webdav:download                                             | 跨 HTTP chunk 的 UTF-8 字符保持字节语义                                        | protocol-fixed / Unicode test                                      | fail        | D1；网络和 HTTP 实现真实                                             |
| S3 正常协议               | registerS3IPC + real AWS SDK                                | HEAD/PUT/GET/stat/404；跨块 Unicode；磁盘字节一致                              | s3 / local HTTP test                                               | pass        | 本地协议 fixture 不验证真实签名、TLS、厂商权限；未使用本机已有 MinIO |
| 不可变远端备份发布        | incrementalUploadSyncBackup                                 | 先对象后 manifest、失败保留旧 snapshot、semantic hash 稳定、媒体变化           | sync / sync-backup-publication                                     | pass        | 远端 Map 与本地导出替身；不等于实际服务验收                          |
| 远端下载校验/失败恢复     | downloadSyncBackup                                          | 错误 hash/缺媒体/大小不符/解密失败在写入前拒绝；恢复失败调用补偿               | sync / sync-backup-core                                            | pass        | restore 与安全点回调 mock；真正磁盘回滚由 journal suites 另证        |
| 自托管快照客户端          | create/restore SelfHostedRemoteBackup                       | 版本不符提前停止；immutable endpoint；显式恢复                                 | sync / self-hosted-backup                                          | pass        | fetch/导出/恢复替身；服务端真实路由归跨端组                          |
| 并发同步/冲突/删除        | FR-FOUNDATION-005 vs sync.md                                | 共同基线、修订、tombstone、条件发布、冲突保留双方                              | 静态契约/实现核对                                                  | fail        | D4；当前 LWW snapshot 测试不证明 causal sync                         |
| SQLite 结构化权威         | FR-FOUNDATION-003 vs runtime context                        | 结构化唯一 SQLite；禁止普通业务 canonical JSON 镜像                            | 静态契约/实现核对                                                  | fail        | D3；foundation 明确 implementation pending                           |
| 真实 GUI 数据工作流       | DataSettings/BackupPanel/RecoveryPanel/FolderModal          | 导出/拖入/确认/恢复/重启/计数可见结果                                          | 未执行                                                             | blocked     | GUI 未授权                                                           |
| 原生系统升级              | macOS/Windows/Linux 安装版                                  | 旧安装包→升级→两次启动、路径权限、Windows VFS                                  | 未执行                                                             | blocked     | 本轮无 GUI；Windows/Linux 原生环境缺失                               |
| 真实 WebDAV/S3            | 真实服务账号                                                | TLS/认证/权限/条件写/故障恢复                                                  | 未执行                                                             | blocked     | 未授权访问云盘/账号；本地 HTTP 不替代                                |
| 真实自托管联调            | Desktop→Web backup→Desktop restore                          | 完整真实 DB 与媒体恢复                                                         | 未执行                                                             | blocked     | 本轮不启动 GUI/访问用户账号；跨端组负责路由证据                      |
| OS 安全存储               | Electron safeStorage/设备绑定 vault                         | 真实 keychain/跨设备不可解密/密码保护恢复                                      | 未执行                                                             | blocked     | 原生平台与 GUI 边界未验收                                            |
| 全域一致快照端到端        | 实际初始化→全域数据→checkpoint ZIP→全域恢复重开             | 同时核对全部 DB 字段、关系、媒体和包文件                                       | 未执行                                                             | not-run     | 已有测试分层证明，不存在本轮完整全域流程                             |
| 近期版本代表数据升级      | v0.5.9/0.6 beta profiles                                    | DB-only 字段/附件/Agent/MCP/Plugin/设置全保留                                  | 未执行                                                             | not-run     | 现有 tagged fixtures 只到 0.5.2；不可由四旧版推断                    |
| 真实进程崩溃恢复          | 写入/rename/fsync 中杀进程再启动                            | 丢电/强杀后的持久 journal 判定                                                 | 未执行                                                             | not-run     | 现有 journal 注入场景已通过；没有真实 OS crash                       |
| 大数据资源预算            | canonical-storage-scale.perf                                | 1000 Prompt 发布/读取与单条修改，清理文件/DB                                   | scale                                                              | pass        | 27.947s 发布、7.689s 增量、3872KiB maxRSS delta；非 GUI 性能         |
| 真实磁盘满/权限撤销       | 文件系统资源故障                                            | 真实 ENOSPC/EACCES 后原数据完整                                                | 未执行                                                             | not-run     | 只验证注入失败/容量 preflight；未操作实际磁盘权限                    |
| 当前桌面自托管 live sync  | sync.md Desktop And Web Relationship                        | 当前 UI/调度只允许 snapshot backup                                             | 契约盘点                                                           | unsupported | 旧 live 路由是历史兼容；当前 UI 不支持，不能当作漏测成功             |
| 清空数据确认              | DangerPanel/useClearDataFlow                                | 主密码验证、清除/失败提示、reload                                              | 未执行                                                             | blocked     | GUI 未授权；未清除真实或共享数据                                     |
| 自动同步开关/周期/历史 UI | useDataSyncController/AutoSyncHistoryPanel                  | 单 provider、保存/启动/周期、自托管仅 push、历史显示                           | 未执行                                                             | blocked     | 桌面组安排；本组不重复其组件/GUI 检查                                |

## 缺陷与契约差距

### D1 — P1：WebDAV 对每个 HTTP chunk 独立 UTF-8 解码，产生内容损坏

- 基线：上述 HEAD；位置 `apps/desktop/src/main/webdav.ts:63` 的 `responseData += chunk.toString()`。
- 最小复现：注册真实 `registerWebDAVIPC`；本地 HTTP fixture 接收 PUT 并保存 `{"title":"data 🔒 中文"}`；GET 在锁 Emoji 的第一个 UTF-8 字节后拆成两段返回；调用 `webdav:download`。
- 期望：返回字符串与上传字节对应文本完全一致。实际：success=true，但 Emoji 变成 U+FFFD 替换字符；精确 equality 断言失败。正常非分块 Unicode 往返/hash 和 401/404/500 检查通过。
- 影响：正常 TCP/HTTP 分块即可触发，中文/Emoji 等都可能受影响。带 hash 的 incremental payload 预期会被上层拒绝（本轮未把这个分块结果串进完整 restore）；无 hash 的 legacy 路径有错误文本进入解析/导入的风险，尚未实测最终落库损坏。
- 失败后数据：远端临时文件仍保存原始 UTF-8，本用例未触发本地 restore；服务器和临时文件在 finally 清理。
- 推荐回归：新增 main WebDAV 真实 localhost HTTP 用例，覆盖 UTF-8 在每个多字节边界拆块，断言下载字节语义/hash；随后接 downloadSyncBackup 验证失败不得改本地。可选择流式 decoder/response.setEncoding 或 Buffer 合并，修复由总协调分配，首轮未实施。

### D2 — P1：私密文件夹承诺加密，但实际只隐藏，正文仍明文

- 用户可见证据：`apps/desktop/src/renderer/components/folder/FolderModal.tsx:579` 使用 `folder.privateHint`；en locale:1493 明确 “this folder will be encrypted”。deletePrivateDesc 同样称 encrypted contents。SecuritySettings 另称 hidden until unlocked，产品文案内部不一致。
- 最小复现：临时 runtime root→真实 Core initDatabase→注册 security/folder/prompt IPC→设置合成主密码→创建 isPrivate=true 目录→保存合成正文→security:lock→关闭/重开数据库→读取对应 user_prompt。
- 期望：遵循界面加密承诺，持久化正文不应直接等于明文。实际：is_private=1 保留，但 user_prompt 完整等于 `fixture-private-content-中文-20261004`；该断言失败。源码普通保存路径也没有调用 encryptText。
- 影响：使用者可能把界面隐藏误认为落盘加密。当前 security helper 通过不代表私密内容使用了它。只验证临时当前默认 runtime 路径，不据此声称所有历史 canonical profile 都实测过。
- 失败后数据：记录、版本与私密标记仍可读；无数据丢失。本轮没有用真实隐私内容，也没有恢复、重置或泄露用户密码。
- 推荐回归：确认产品应为 UI 隐藏还是实际加密后，在注册 IPC→落盘→lock→reopen 边界保留回归，并核对备份/FTS/文件/密码更换恢复。该选择涉及安全和数据迁移，交总协调，不在本轮擅自引入加密架构或改文案掩盖。

### D3 — 已知 P1 发布契约缺口：SQLite 权威仍待实现

`FR-FOUNDATION-003` 明确 SQLite 拥有结构化记录/设置，文件系统仅保存实际包和媒体，且明确替代 file-first；同文件第 50–54 行仍写 implementation pending。`spec/releases/0.6.0.md:22–25`、`database-concurrency.md` 和 `data-recovery.md` 仍称 canonical 文件为权威。`packages/core/src/runtime-storage-context.ts:381` 仍以 marker 选择 canonical-files/database-catalog；Core initDatabase 仍有文件重建 SQLite 分支。本轮旧 canonical 测试通过证明当前实现，不证明新契约完成。不得修改脏 storage-inventory；协调方需确定候选是否包含已确认转换并统一现行文档。

### D4 — 已知 P1 发布契约缺口：同步冲突/删除语义

`FR-FOUNDATION-005` 要求 common base/revisions/tombstones/conditional publication，缺少条件发布能力的 provider 只能 backup-only。`spec/knowledge/behavior/sync.md` 仍明确 WebDAV/S3 全量 freshness 为 last-writer-wins，删除记录/冲突解决为 follow-up；sync-backup-core 仍测试基于时间戳方向选择。这是目标与实现差距，不是本轮复现出双端丢失。必须补真实多写者共同基线、同项冲突、单端删除和条件写失败保全验收，不能用现有 mock 成功覆盖。

## 执行记录

所有命令在同一个源码状态上只运行一次。下面两次属于自写验收脚本修正：persistence 初次预期 folderId=undefined，但 DB 映射正式值为 null；核对后修正断言。protocol 初次 config 使用绝对 package subpath 无法解析，改为标准 vitest/config 导入后才实际执行。两者不是产品失败，没有放宽 D1/D2 的失败断言。

| 批次              | 时间 UTC（+08:00 为上海）                           | PID   | 退出码 | 结果                                                                               |
| ----------------- | --------------------------------------------------- | ----- | ------ | ---------------------------------------------------------------------------------- |
| disk              | 2026-10-04T09:24:43.207Z → 2026-10-04T09:25:27.228Z | 72376 | 0      | 117 pass / 0 fail                                                                  |
| core              | 2026-10-04T09:25:46.628Z → 2026-10-04T09:25:55.416Z | 73816 | 0      | 144 pass / 0 fail                                                                  |
| sync              | 2026-10-04T09:26:08.420Z → 2026-10-04T09:26:17.368Z | 74143 | 0      | 128 pass / 0 fail                                                                  |
| persistence       | 2026-10-04T09:26:55.964Z → 2026-10-04T09:26:58.170Z | 75466 | 1      | 见说明                                                                             |
| persistence-fixed | 2026-10-04T09:27:27.150Z → 2026-10-04T09:27:29.016Z | 76023 | 0      | 4 组真实 SQLite/文件断言 pass                                                      |
| scale             | 2026-10-04T09:28:18.043Z → 2026-10-04T09:28:57.178Z | 76588 | 0      | 1 pass；27.9473s publish / 7.6893s incremental / 3872KiB RSS delta / 2861387 bytes |
| protocol          | 2026-10-04T09:29:09.177Z → 2026-10-04T09:29:10.160Z | 77072 | 1      | 见说明                                                                             |
| protocol-fixed    | 2026-10-04T09:29:24.803Z → 2026-10-04T09:29:28.348Z | 77269 | 1      | 1 pass / 2 fail                                                                    |
| recovery          | 2026-10-04T09:29:47.958Z → 2026-10-04T09:31:08.133Z | 77615 | 0      | 106 pass / 0 fail                                                                  |
| s3                | 2026-10-04T09:31:17.288Z → 2026-10-04T09:31:18.364Z | 78186 | 0      | 1 pass / 0 fail                                                                    |
| filesystem        | 2026-10-04T09:31:28.256Z → 2026-10-04T09:31:29.637Z | 78250 | 0      | 1 pass / 0 fail                                                                    |

### 精确命令

父 runner 的完整定义在附录，240 秒限时、单进程、TMPDIR 隔离及 PID/退出码均由它记录。以下保留实际调用，重现时将旧任务临时根替换为新唯一目录。

```sh
node /tmp/prompthub-data-acceptance-U1TiLmIn/run.mjs disk /Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop exec vitest run --project unit --minWorkers 1 --maxWorkers 1 --cache false tests/unit/main/database-historical-fixtures.test.ts tests/unit/main/database-historical-canonical-rebuild.test.ts tests/unit/main/database-safety-point.test.ts tests/unit/main/database-migration-locks.test.ts tests/unit/main/data-layout-migration.test.ts tests/unit/main/journaled-database-recovery.test.ts tests/unit/main/upgrade-backup.test.ts tests/unit/main/upgrade-backup-restore.test.ts tests/unit/main/portable-snapshot-import.test.ts tests/unit/main/portable-snapshot-restore.test.ts tests/unit/main/portable-snapshot-archive.test.ts tests/unit/main/canonical-portable-export.test.ts --reporter=json --outputFile=/tmp/prompthub-data-acceptance-U1TiLmIn/disk.json
node /tmp/prompthub-data-acceptance-U1TiLmIn/run.mjs core /Users/lingxiaotian/Programs/personal/PromptHub/packages/core exec vitest run --minWorkers 1 --maxWorkers 1 --cache false tests/journaled-storage-restore.test.ts tests/recovery-artifact-publication.test.ts tests/recovery-artifact-registry.test.ts tests/storage-root-operation.test.ts tests/storage-maintenance-intent.test.ts tests/owned-temporary-database.test.ts tests/portable-snapshot.test.ts tests/portable-logical-snapshot.test.ts tests/portable-canonical-consistency.test.ts --reporter=json --outputFile=/tmp/prompthub-data-acceptance-U1TiLmIn/core.json
node /tmp/prompthub-data-acceptance-U1TiLmIn/run.mjs sync /Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop exec vitest run --project unit --minWorkers 1 --maxWorkers 1 --cache false tests/unit/services/sync-backup-core.test.ts tests/unit/services/sync-backup-publication.test.ts tests/unit/services/webdav.test.ts tests/unit/services/s3-sync.test.ts tests/unit/services/self-hosted-backup.test.ts tests/unit/main/security.test.ts tests/unit/main/security-ipc.test.ts tests/unit/services/database-backup-format.test.ts tests/unit/services/database-backup.test.ts --reporter=json --outputFile=/tmp/prompthub-data-acceptance-U1TiLmIn/sync.json
node /tmp/prompthub-data-acceptance-U1TiLmIn/run.mjs persistence /Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop exec tsx --tsconfig tsconfig.json /tmp/prompthub-data-acceptance-U1TiLmIn/persistence.ts
node /tmp/prompthub-data-acceptance-U1TiLmIn/run.mjs persistence-fixed /Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop exec tsx --tsconfig tsconfig.json /tmp/prompthub-data-acceptance-U1TiLmIn/persistence.ts
node /tmp/prompthub-data-acceptance-U1TiLmIn/run.mjs scale /Users/lingxiaotian/Programs/personal/PromptHub/packages/core exec vitest run --config vitest.performance.config.ts --minWorkers 1 --maxWorkers 1 --cache false performance/canonical-storage-scale.perf.ts --reporter=verbose
node /tmp/prompthub-data-acceptance-U1TiLmIn/run.mjs protocol /Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop exec vitest run --root /tmp/prompthub-data-acceptance-U1TiLmIn --config /tmp/prompthub-data-acceptance-U1TiLmIn/vitest.config.mts --minWorkers 1 --maxWorkers 1 --cache false --reporter=json --outputFile=/tmp/prompthub-data-acceptance-U1TiLmIn/protocol.json
node /tmp/prompthub-data-acceptance-U1TiLmIn/run.mjs protocol-fixed /Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop exec vitest run --root /tmp/prompthub-data-acceptance-U1TiLmIn --config /tmp/prompthub-data-acceptance-U1TiLmIn/vitest.config.mts --minWorkers 1 --maxWorkers 1 --cache false --reporter=json --outputFile=/tmp/prompthub-data-acceptance-U1TiLmIn/protocol-fixed.json
node /tmp/prompthub-data-acceptance-U1TiLmIn/run.mjs recovery /Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop exec vitest run --project unit --minWorkers 1 --maxWorkers 1 --cache false tests/unit/main/data-recovery.test.ts tests/unit/main/recovery-candidates.test.ts tests/unit/main/recovery-paths.test.ts tests/unit/main/upgrade-backup-startup.test.ts tests/unit/main/managed-backup-retention.test.ts tests/unit/main/canonical-storage-startup.test.ts --reporter=json --outputFile=/tmp/prompthub-data-acceptance-U1TiLmIn/recovery.json
node /tmp/prompthub-data-acceptance-U1TiLmIn/run.mjs s3 /Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop exec vitest run --root /tmp/prompthub-data-acceptance-U1TiLmIn --config /tmp/prompthub-data-acceptance-U1TiLmIn/s3.config.mts --minWorkers 1 --maxWorkers 1 --cache false --reporter=json --outputFile=/tmp/prompthub-data-acceptance-U1TiLmIn/s3.json
node /tmp/prompthub-data-acceptance-U1TiLmIn/run.mjs filesystem /Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop exec vitest run --project integration --minWorkers 1 --maxWorkers 1 --cache false tests/integration/services/database-backup-filesystem.integration.test.ts --reporter=json --outputFile=/tmp/prompthub-data-acceptance-U1TiLmIn/filesystem.json
```

### 已运行文件与代表性用例

下列路径与用例名来自 Vitest 实际选择结果；每文件 count 包含全部选中用例，而不是只执行展示的代表例。

| 文件                                                                                   | 数量 | 状态 | 代表性用例                                                                                                                                           |
| -------------------------------------------------------------------------------------- | ---- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| apps/desktop/tests/unit/main/canonical-portable-export.test.ts                         | 2    | pass | canonical portable export coordinator keeps the database closed and maintenance barrier active through archive publication                           |
| apps/desktop/tests/unit/main/data-layout-migration.test.ts                             | 15   | pass | data-layout-migration migrates legacy root entries into data/config and writes a marker after snapshotting                                           |
| apps/desktop/tests/unit/main/database-historical-canonical-rebuild.test.ts             | 4    | pass | historical database canonical rebuild rebuilds v0.4.7 through canonical resources without losing durable history                                     |
| apps/desktop/tests/unit/main/database-historical-fixtures.test.ts                      | 5    | pass | historical database compatibility fixtures adopts v0.4.7 without losing prompt or skill history                                                      |
| apps/desktop/tests/unit/main/database-migration-locks.test.ts                          | 22   | pass | database migration locking regression derives immutable legacy identities and final invariants from one manifest                                     |
| apps/desktop/tests/unit/main/database-safety-point.test.ts                             | 8    | pass | database safety points creates one SQLite-consistent image while the source connection remains open                                                  |
| apps/desktop/tests/unit/main/journaled-database-recovery.test.ts                       | 3    | pass | journaled database recovery publishes a recovered directory as one verified state                                                                    |
| apps/desktop/tests/unit/main/portable-snapshot-archive.test.ts                         | 4    | pass | portable snapshot archive streams only selected scopes and cleans task-owned staging                                                                 |
| apps/desktop/tests/unit/main/portable-snapshot-import.test.ts                          | 3    | pass | portable snapshot import streams and verifies a declared portable snapshot                                                                           |
| apps/desktop/tests/unit/main/portable-snapshot-restore.test.ts                         | 11   | pass | portable snapshot restore publishes the verified database and files as one recoverable set                                                           |
| apps/desktop/tests/unit/main/upgrade-backup-restore.test.ts                            | 7    | pass | upgrade-backup-restore replaces current userData content while preserving the backups root                                                           |
| apps/desktop/tests/unit/main/upgrade-backup.test.ts                                    | 33   | pass | upgrade-backup getUpgradeBackupRoot resolves to the managed upgrade safety-point directory                                                           |
| packages/core/tests/journaled-storage-restore.test.ts                                  | 28   | pass | journaled storage restore publishes all prepared domains and preserves the prior set as one artifact                                                 |
| packages/core/tests/owned-temporary-database.test.ts                                   | 10   | pass | owned temporary database paths creates a bounded sibling path without creating the file                                                              |
| packages/core/tests/portable-canonical-consistency.test.ts                             | 5    | pass | portable canonical consistency accepts matching complete empty durable inventories                                                                   |
| packages/core/tests/portable-logical-snapshot.test.ts                                  | 10   | pass | portable logical snapshot parses the versioned scope and normalized logical payload                                                                  |
| packages/core/tests/portable-snapshot.test.ts                                          | 21   | pass | portable snapshot reads only selected scopes and publishes a versioned verified envelope                                                             |
| packages/core/tests/recovery-artifact-publication.test.ts                              | 16   | pass | recovery artifact publication publishes prior data atomically and treats the complete artifact as idempotent                                         |
| packages/core/tests/recovery-artifact-registry.test.ts                                 | 17   | pass | recovery artifact registry lists only complete bounded artifacts with measured sizes                                                                 |
| packages/core/tests/storage-maintenance-intent.test.ts                                 | 8    | pass | storage maintenance intent blocks concurrent structural work and database reopening until release                                                    |
| packages/core/tests/storage-root-operation.test.ts                                     | 29   | pass | storage root operation rejects journal-owned paths that do not belong to the target operation                                                        |
| apps/desktop/tests/unit/services/database-backup-format.test.ts                        | 14   | pass | database-backup-format preserves current safety provenance and normalizes only legacy methods                                                        |
| apps/desktop/tests/unit/services/database-backup.test.ts                               | 21   | pass | database-backup restore delays backup URL revocation so downloads are not truncated                                                                  |
| apps/desktop/tests/unit/services/s3-sync.test.ts                                       | 3    | pass | s3-sync delegates connection checks to the preload s3 bridge                                                                                         |
| apps/desktop/tests/unit/services/self-hosted-backup.test.ts                            | 4    | pass | self-hosted backup-only client stops before login and export when desktop and Web versions differ                                                    |
| apps/desktop/tests/unit/services/sync-backup-core.test.ts                              | 20   | pass | sync-backup-core getRemoteSyncBackupTimestamp prefers incremental manifest timestamps before legacy backup timestamps                                |
| apps/desktop/tests/unit/services/sync-backup-publication.test.ts                       | 8    | pass | sync backup immutable publication publishes content addressed objects before the manifest and preserves the previous snapshot when publication fails |
| apps/desktop/tests/unit/services/webdav.test.ts                                        | 10   | pass | WebDAV Service testConnection should prefer window.electron.webdav if available                                                                      |
| apps/desktop/tests/unit/main/security-ipc.test.ts                                      | 11   | pass | security IPC rejects setting a short master password                                                                                                 |
| apps/desktop/tests/unit/main/security.test.ts                                          | 37   | pass | security module setMasterPassword stores hashed password and unlocks                                                                                 |
| apps/desktop/tests/unit/main/canonical-storage-startup.test.ts                         | 16   | pass | prompt workspace trash relocation from the canonical root relocates an old prompt-workspace leftover without deleting its content                    |
| apps/desktop/tests/unit/main/data-recovery.test.ts                                     | 44   | pass | Data Recovery isDatabaseEmpty returns true for a database with no prompts                                                                            |
| apps/desktop/tests/unit/main/managed-backup-retention.test.ts                          | 18   | pass | managed backup retention keeps the newest valid point in every family even above the byte budget                                                     |
| apps/desktop/tests/unit/main/recovery-candidates.test.ts                               | 14   | pass | recovery-candidates does not surface residual candidates when only non-content leftovers remain                                                      |
| apps/desktop/tests/unit/main/recovery-paths.test.ts                                    | 3    | pass | recovery-paths includes both PromptHub and prompthub roaming/local variants on Windows                                                               |
| apps/desktop/tests/unit/main/upgrade-backup-startup.test.ts                            | 11   | pass | upgrade-backup-startup treats the first launch as marker-only and does not create a snapshot                                                         |
| apps/desktop/tests/integration/services/database-backup-filesystem.integration.test.ts | 1    | pass | database-backup filesystem integration round-trips media files and skill files through the backup service with real filesystem IO                    |
| fixture/protocol.test.ts                                                               | 3    | fail | WebDAV preserves Unicode split across HTTP chunks                                                                                                    |
| fixture/s3.test.ts                                                                     | 1    | pass | S3 registered handlers use real SDK and local HTTP to preserve Unicode and distinguish missing objects                                               |
| packages/core/performance/canonical-storage-scale.perf.ts                              | 1    | pass | publishes and reloads a four-digit Prompt inventory within bounded resources                                                                         |

## 补验建议与发布边界

1. 先由总协调确认 D1 修复所有权及 D2 产品安全语义；修复后运行精确回归，并在最终候选补完整备份/恢复。
2. 补 v0.5.9/当前 beta 的全域代表 profile，核对 DB-only 字段、文件清单/hash、关系/版本与设置，覆盖迁移重复执行及失败后 reopen；不能仅用 Prompt/Skill 历史代表全部数据。
3. 补真实全域一致导出→新根恢复→再启动。canonical-portable-export.test 只证明编排顺序，filesystem integration 只证明文件，不得把两者相加称作完整全域实测。
4. GUI 获授权后才运行隔离 Electron：主密码/私密目录切换、导出选择、拖入 JSON/ZIP/SQLite、确认预览、恢复后计数、数据路径切换、清空确认；与桌面组协同。
5. 真实服务/原生系统与发布全量门禁由总协调安排。local HTTP S3 不校验签名；自托管本轮只有客户端 mock，跨端组的路由证据需合并。
6. 千条基准虽在既有预算内，单条更新约 7.7 秒，需在固定候选/可控负载下结合 UI 体验判断，不能称低延迟。

## 资源清理

所有检查子进程已退出；检查没有启动 Electron/浏览器。S3 fixture 监听 127.0.0.1:55082，worker PID 78211，已关闭且 lsof 无监听。WebDAV fixture 使用 server.listen(0) 的两个动态本机端口，afterEach 执行 closeAllConnections/close；对应 worker 随已退出的 protocol-fixed 批次释放。临时 DB、锁、lease、测试缓存及 fixture 均在本任务临时根；最终清理状态见末尾核对。

## 可重建黑盒用例附录

以下保留第一轮原样临时脚本（只含合成数据），属于历史执行证据。D1/D2 已在第二轮改写为类型化持久测试并接入默认 integration 选择规则；其余临时脚本不构成永久回归门禁。

重建方法：将各 fixture 标记后的代码块保存为相应文件，创建新的唯一临时根并替换脚本中的旧临时路径；在该根创建 node_modules 软链接到本 checkout 的 apps/desktop/node_modules。运行上面的命令；完成后只删除新建临时根，不能清理用户目录。fixture 里的 any 仅用于临时注册器，不是建议合入的类型合同。

<!-- fixture: run.mjs -->

### run.mjs

```js
import fs from "node:fs";
import { spawn } from "node:child_process";
const root = "/tmp/prompthub-data-acceptance-U1TiLmIn";
const [name, cwd, ...args] = process.argv.slice(2);
const log = fs.openSync(`${root}/${name}.log`, "w");
const started = new Date().toISOString();
const p = spawn("pnpm", args, {
  cwd,
  env: { ...process.env, TMPDIR: root },
  stdio: ["ignore", log, log],
  detached: true,
});
console.log(JSON.stringify({ name, pid: p.pid, started, args }));
const timer = setTimeout(() => {
  process.kill(-p.pid, "SIGTERM");
}, 240000);
p.on("exit", (code, signal) => {
  clearTimeout(timer);
  fs.closeSync(log);
  fs.writeFileSync(
    `${root}/${name}.meta.json`,
    JSON.stringify(
      {
        name,
        pid: p.pid,
        started,
        ended: new Date().toISOString(),
        code,
        signal,
        args,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ name, code, signal }));
  process.exitCode = code ?? 1;
});
```

<!-- fixture: persistence.ts -->

### persistence.ts

```ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  initDatabase,
  closeDatabase,
  PromptDB,
  FolderDB,
} from "/Users/lingxiaotian/Programs/personal/PromptHub/packages/db/src/index.ts";
import * as security from "/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/src/main/security.ts";
const root = fs.mkdtempSync(path.join(process.env.TMPDIR!, "persistence-"));
const databasePath = path.join(root, "prompthub.db");
const results: string[] = [];
try {
  let db = initDatabase(databasePath);
  let prompts = new PromptDB(db);
  let folders = new FolderDB(db);
  const parent = folders.create({ name: "Private parent", isPrivate: true });
  const child = folders.create({ name: "Child", parentId: parent.id });
  const p = prompts.create({
    title: "Alpha needle",
    userPrompt: "数据 🔒\nquote ' and SQL --",
    folderId: child.id,
    tags: ["beta"],
  });
  const q = prompts.create({ title: "Other", userPrompt: "Persistent peer" });
  assert.equal(prompts.search({ keyword: "alpha beta" })[0].id, p.id);
  prompts.update(p.id, { title: "Gamma needle" });
  assert.equal(prompts.search({ keyword: "alpha" }).length, 0);
  assert.equal(prompts.search({ keyword: "gamma beta" })[0].id, p.id);
  for (const keyword of ["AND", "OR", "NEAR", '"', "*", "title:", "^"])
    prompts.search({ keyword });
  const now = Date.now();
  const insert =
    "INSERT INTO prompt_relations (id,source_prompt_id,target_prompt_id,kind,created_at,updated_at) VALUES (?,?,?,?,?,?)";
  db.run(insert, "r1", p.id, q.id, "related_to", now, now);
  assert.throws(() =>
    db.run(insert, "bad1", p.id, "missing", "related_to", now, now),
  );
  assert.throws(() =>
    db.run(insert, "bad2", p.id, p.id, "related_to", now, now),
  );
  assert.throws(() =>
    db.run(insert, "bad3", p.id, q.id, "related_to", now, now),
  );
  db.run(
    "INSERT INTO prompt_output_format_items (id,source_prompt_id,target_prompt_id,created_at,updated_at) VALUES (?,?,?,?,?)",
    "o1",
    p.id,
    q.id,
    now,
    now,
  );
  results.push(
    "FTS insert/update/operator queries and FK/self-link/unique constraints: pass",
  );
  security.setMasterPassword(db, "fixture-original");
  security.lock();
  assert.equal(security.unlock(db, "fixture-wrong"), false);
  assert.equal(security.unlock(db, "fixture-original"), true);
  assert.equal(
    security.changeMasterPassword(db, "fixture-original", "fixture-revised"),
    true,
  );
  security.lock();
  closeDatabase();
  db = initDatabase(databasePath);
  prompts = new PromptDB(db);
  folders = new FolderDB(db);
  assert.equal(
    prompts.getById(p.id)?.userPrompt,
    "数据 🔒\nquote ' and SQL --",
  );
  assert.equal(folders.getById(parent.id)?.isPrivate, true);
  assert.deepEqual(security.securityStatus(db), {
    configured: true,
    unlocked: false,
  });
  assert.equal(security.unlock(db, "fixture-original"), false);
  assert.equal(security.unlock(db, "fixture-revised"), true);
  assert.equal(
    db.get("SELECT COUNT(*) AS count FROM prompt_relations")?.count,
    1,
  );
  results.push(
    "Private flag, Unicode text, graph records, master-password change and locked fresh connection: pass",
  );
  const key = security.getKey()!;
  const text = "Fixture encrypted payload 🔒";
  const ciphertext = security.encryptText(text, key);
  assert.equal(security.decryptText(ciphertext, key), text);
  fs.writeFileSync(path.join(root, "encrypted.txt"), ciphertext);
  const digest = createHash("sha256").update(ciphertext).digest("hex");
  security.lock();
  closeDatabase();
  db = initDatabase(databasePath);
  assert.equal(security.unlock(db, "fixture-revised"), true);
  assert.equal(
    security.decryptText(
      fs.readFileSync(path.join(root, "encrypted.txt"), "utf8"),
      security.getKey()!,
    ),
    text,
  );
  assert.equal(
    createHash("sha256")
      .update(fs.readFileSync(path.join(root, "encrypted.txt")))
      .digest("hex"),
    digest,
  );
  results.push(
    "Security helper ciphertext file hash and decryption after DB reopen: pass (helper, not private-folder at-rest encryption)",
  );
  prompts = new PromptDB(db);
  folders = new FolderDB(db);
  folders.delete(parent.id);
  assert.equal(folders.getById(child.id), null);
  assert.equal(prompts.getById(p.id)?.folderId, null);
  prompts.delete(q.id);
  assert.equal(
    db.get("SELECT COUNT(*) AS count FROM prompt_relations")?.count,
    0,
  );
  assert.equal(
    db.get("SELECT COUNT(*) AS count FROM prompt_output_format_items")?.count,
    0,
  );
  prompts.delete(p.id);
  assert.equal(prompts.search({ keyword: "gamma" }).length, 0);
  assert.equal(
    db.get("SELECT COUNT(*) AS count FROM prompt_versions")?.count,
    0,
  );
  assert.deepEqual(db.pragma("foreign_key_check"), []);
  assert.deepEqual(db.pragma("quick_check"), [{ quick_check: "ok" }]);
  security.lock();
  closeDatabase();
  db = initDatabase(databasePath);
  assert.equal(new PromptDB(db).getAll().length, 0);
  closeDatabase();
  assert.equal(fs.existsSync(databasePath + ".lock"), false);
  const leases = databasePath + ".clients";
  assert.equal(fs.existsSync(leases) ? fs.readdirSync(leases).length : 0, 0);
  results.push(
    "Folder cascade/SET NULL, graph/version cascade, FTS deletion, empty reopen, released DB lock and client lease: pass",
  );
  console.log(JSON.stringify({ results }, null, 2));
} finally {
  security.lock();
  closeDatabase();
  fs.rmSync(root, { recursive: true, force: true });
}
```

<!-- fixture: vitest.config.mts -->

### vitest.config.mts

```ts
import { defineConfig } from "vitest/config";
const repo = "/Users/lingxiaotian/Programs/personal/PromptHub";
export default defineConfig({
  root: "/tmp/prompthub-data-acceptance-U1TiLmIn",
  test: {
    environment: "node",
    include: ["protocol.test.ts"],
    testTimeout: 15000,
    hookTimeout: 15000,
    minWorkers: 1,
    maxWorkers: 1,
    cache: false,
  },
  resolve: {
    alias: {
      "@prompthub/core": `${repo}/packages/core/src`,
      "@prompthub/db": `${repo}/packages/db/src`,
      "@prompthub/shared": `${repo}/packages/shared`,
    },
  },
});
```

<!-- fixture: protocol.test.ts -->

### protocol.test.ts

```ts
import { afterEach, expect, it, vi } from "vitest";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { once } from "node:events";
const handlers = vi.hoisted(
  () => new Map<string, (...args: unknown[]) => Promise<any>>(),
);
vi.mock("electron", () => ({
  ipcMain: {
    handle: (name: string, handler: any) => handlers.set(name, handler),
  },
  app: {},
  session: {},
}));
vi.mock(
  "/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/src/main/testing/e2e.ts",
  () => ({
    isE2EEnabled: () => false,
    getE2EWebDAVMode: () => "off",
    handleE2EWebDAVRequest: () => {
      throw Error("E2E shim must not run");
    },
  }),
);
vi.mock(
  "/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/src/main/services/network-proxy.ts",
  () => ({ getHttpRequestAgent: () => undefined }),
);
import { registerWebDAVIPC } from "/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/src/main/webdav.ts";
let server: http.Server | undefined;
let root: string | undefined;
afterEach(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((r) => server!.close(() => r()));
    server = undefined;
  }
  if (root) fs.rmSync(root, { recursive: true, force: true });
});
async function fixture() {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "protocol-"));
  server = http.createServer(async (req, res) => {
    const name = req.url!.slice(1);
    const file = path.join(root!, name);
    if (name === "unauthorized") {
      res.writeHead(401).end();
      return;
    }
    if (name === "failure") {
      res.writeHead(500).end();
      return;
    }
    if (req.method === "PUT") {
      const chunks: Buffer[] = [];
      for await (const part of req) chunks.push(part);
      fs.writeFileSync(file, Buffer.concat(chunks));
      res.writeHead(201).end();
      return;
    }
    if (req.method === "MKCOL") {
      res.writeHead(201).end();
      return;
    }
    if (req.method === "PROPFIND") {
      res
        .writeHead(207)
        .end(
          '<d:multistatus xmlns:d="DAV:"><d:getlastmodified>Sun, 04 Oct 2026 00:00:00 GMT</d:getlastmodified></d:multistatus>',
        );
      return;
    }
    if (!fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    const body = fs.readFileSync(file);
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    if (name === "split.json") {
      const split = body.indexOf(Buffer.from("🔒")) + 1;
      res.write(body.subarray(0, split));
      // Deliberately force a UTF-8 sequence across two HTTP body chunks.
      setTimeout(() => res.end(body.subarray(split)), 20);
    } else res.end(body);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw Error("No TCP address");
  const url = `http://127.0.0.1:${address.port}/`;
  console.info(`fixture-port=${address.port}`);
  registerWebDAVIPC();
  const config = { url, username: "fixture", password: "fixture" };
  const call = (name: string, ...args: unknown[]) =>
    handlers.get(`webdav:${name}`)!({}, ...args);
  return { url, config, call };
}
it("WebDAV registered handlers preserve real disk bytes through local HTTP and report 401/404/500", async () => {
  const { url, config, call } = await fixture();
  expect((await call("testConnection", config)).success).toBe(true);
  expect(
    (await call("testConnection", { ...config, url: url + "unauthorized" }))
      .success,
  ).toBe(false);
  const payload = JSON.stringify({ title: "数据 🔒", versions: [1, 2] });
  expect(await call("upload", url + "normal.json", config, payload)).toEqual({
    success: true,
  });
  expect(fs.readFileSync(path.join(root!, "normal.json"), "utf8")).toBe(
    payload,
  );
  const result = await call("download", url + "normal.json", config);
  expect(result).toEqual({ success: true, data: payload });
  expect(createHash("sha256").update(result.data).digest("hex")).toBe(
    createHash("sha256").update(payload).digest("hex"),
  );
  expect((await call("stat", url + "normal.json", config)).lastModified).toBe(
    "Sun, 04 Oct 2026 00:00:00 GMT",
  );
  expect(await call("download", url + "missing.json", config)).toEqual({
    success: false,
    notFound: true,
  });
  expect((await call("download", url + "failure", config)).success).toBe(false);
});
it("WebDAV preserves Unicode split across HTTP chunks", async () => {
  const { url, config, call } = await fixture();
  const payload = JSON.stringify({ title: "data 🔒 中文" });
  await call("upload", url + "split.json", config, payload);
  const result = await call("download", url + "split.json", config);
  expect(result.success).toBe(true);
  expect(result.data).toBe(payload);
});
import {
  configureRuntimePaths,
  resetRuntimePaths,
  writeRuntimeLayoutState,
  initDatabase,
  closeDatabase,
  PromptDB,
  FolderDB,
} from "/Users/lingxiaotian/Programs/personal/PromptHub/packages/core/src/index.ts";
import { registerPromptIPC } from "/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/src/main/ipc/prompt.ipc.ts";
import { registerFolderIPC } from "/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/src/main/ipc/folder.ipc.ts";
import { registerSecurityIPC } from "/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/src/main/ipc/security.ipc.ts";
import { lock } from "/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/src/main/security.ts";
it("private-folder UI encryption promise matches persisted bytes", async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "private-folder-"));
  configureRuntimePaths({ userDataPath: root });
  writeRuntimeLayoutState(root);
  try {
    const db = initDatabase();
    registerSecurityIPC(db);
    registerFolderIPC(new FolderDB(db), new PromptDB(db));
    registerPromptIPC(new PromptDB(db), new FolderDB(db), db);
    const call = (name: string, ...args: unknown[]) =>
      handlers.get(name)!({}, ...args);
    await call("security:setMasterPassword", "fixture-password");
    const folder = await call("folder:create", {
      name: "Private",
      isPrivate: true,
    });
    const text = "fixture-private-content-中文-20261004";
    const prompt = await call("prompt:create", {
      title: "Private fixture",
      userPrompt: text,
      folderId: folder.id,
    });
    await call("security:lock");
    closeDatabase();
    const reopened = initDatabase();
    expect(
      reopened.get("SELECT is_private FROM folders WHERE id=?", folder.id),
    ).toEqual({ is_private: 1 });
    const row = reopened.get(
      "SELECT user_prompt FROM prompts WHERE id=?",
      prompt.id,
    );
    const plaintextFiles = fs
      .readdirSync(root, { recursive: true })
      .filter((file) => {
        const target = path.join(root!, String(file));
        return (
          fs.statSync(target).isFile() &&
          fs.readFileSync(target).includes(Buffer.from(text))
        );
      })
      .map(String);
    console.info(
      JSON.stringify({ privateFlag: true, locked: true, plaintextFiles }),
    );
    expect(
      row?.user_prompt,
      "FolderModal promises encrypted storage; actual SQLite value is plaintext",
    ).not.toBe(text);
  } finally {
    lock();
    closeDatabase();
    resetRuntimePaths();
  }
});
```

<!-- fixture: s3.config.mts -->

### s3.config.mts

```ts
import { defineConfig } from "vitest/config";
const repo = "/Users/lingxiaotian/Programs/personal/PromptHub";
export default defineConfig({
  root: "/tmp/prompthub-data-acceptance-U1TiLmIn",
  test: {
    environment: "node",
    include: ["s3.test.ts"],
    testTimeout: 15000,
    hookTimeout: 15000,
    minWorkers: 1,
    maxWorkers: 1,
    cache: false,
  },
  resolve: {
    alias: {
      "@prompthub/core": `${repo}/packages/core/src`,
      "@prompthub/db": `${repo}/packages/db/src`,
      "@prompthub/shared": `${repo}/packages/shared`,
    },
  },
});
```

<!-- fixture: s3.test.ts -->

### s3.test.ts

```ts
import { expect, it, vi } from "vitest";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
const handlers = vi.hoisted(
  () => new Map<string, (...args: unknown[]) => Promise<any>>(),
);
vi.mock("electron", () => ({
  ipcMain: {
    handle: (name: string, handler: any) => handlers.set(name, handler),
  },
}));
vi.mock(
  "/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/src/main/services/network-proxy.ts",
  () => ({ getHttpRequestAgent: () => undefined }),
);
import { registerS3IPC } from "/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/src/main/s3.ts";
it("S3 registered handlers use real SDK and local HTTP to preserve Unicode and distinguish missing objects", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "s3-fixture-"));
  const file = path.join(root, "object.json");
  const server = http.createServer(async (req, res) => {
    if (req.method === "HEAD" && req.url === "/fixture/") {
      res.writeHead(200).end();
      return;
    }
    if (req.url?.includes("missing")) {
      res
        .writeHead(404, { "Content-Type": "application/xml" })
        .end(
          "<Error><Code>NoSuchKey</Code><Message>Missing fixture</Message></Error>",
        );
      return;
    }
    if (req.method === "PUT") {
      const parts: Buffer[] = [];
      for await (const part of req) parts.push(part);
      fs.writeFileSync(file, Buffer.concat(parts));
      res.writeHead(200, { ETag: '"fixture"' }).end();
      return;
    }
    if (req.method === "HEAD") {
      res
        .writeHead(200, { "Last-Modified": "Sun, 04 Oct 2026 00:00:00 GMT" })
        .end();
      return;
    }
    const bytes = fs.readFileSync(file);
    const split = bytes.indexOf(Buffer.from("🔒")) + 1;
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Content-Length": bytes.length,
    });
    res.write(bytes.subarray(0, split));
    setTimeout(() => res.end(bytes.subarray(split)), 20);
  });
  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw Error("No address");
    fs.writeFileSync(
      path.join(os.tmpdir(), "s3-port.json"),
      JSON.stringify({ pid: process.pid, port: address.port }),
    );
    registerS3IPC();
    const config = {
      endpoint: `http://127.0.0.1:${address.port}`,
      region: "us-east-1",
      bucket: "fixture",
      accessKeyId: "fixture",
      secretAccessKey: "fixture",
    };
    const call = (name: string, ...args: unknown[]) =>
      handlers.get(`s3:${name}`)!({}, ...args);
    expect((await call("testConnection", config)).success).toBe(true);
    const payload = JSON.stringify({ title: "data 🔒 中文" });
    expect(await call("upload", "/object.json", config, payload)).toEqual({
      success: true,
    });
    expect(fs.readFileSync(file, "utf8")).toBe(payload);
    expect(await call("download", "/object.json", config)).toEqual({
      success: true,
      data: payload,
    });
    expect((await call("stat", "/object.json", config)).lastModified).toBe(
      "2026-10-04T00:00:00.000Z",
    );
    expect(await call("download", "missing.json", config)).toEqual({
      success: false,
      notFound: true,
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
```

## 最终核对

2026-10-04 首轮结束：11 个检查批次 PID 及所属进程组均无存活子进程，未保留服务器。临时根内仅剩本任务日志、结果、代码及缓存，已在报告保留命令、用例与结果后删除整个任务根（软链接只删除链接本身，不跟随删除依赖）。没有修改产品源码、既有测试、共享配置、其他报告或 issue 状态。最终产品源码 diff hash 与执行时相同；首轮当时仅生成本报告；第二轮新增测试见下节。

## 持久化功能测试补验（第二轮）

本节更新第一轮临时脚本的交付状态。新增范围仅为现有 integration 目录内三个 `release-acceptance-data-recovery-*.test.ts` 文件和本报告；产品源码、既有测试、配置和共享 helper 保持冻结。

| 既有证据                                       | 有效边界                                | 缺口和新增覆盖                                                                                                                |
| ---------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| database-historical-fixtures / migration-locks | 真实旧版 SQLite、历史行、升级与失败保全 | 保留其有效结果，不因本轮新增测试重复运行                                                                                      |
| security.test / security-ipc                   | crypto helper 与 Map/DB 替身合同        | privacy 文件经过真实 preload/注册 IPC/启动转换/SQLite/文件；断言错误密码后字节不变、重开读回、密码轮换                        |
| renderer WebDAV 单测                           | fetch/bridge 路由与错误形状             | webdav 文件使用本地 HTTP 和磁盘，覆盖 Unicode 分块、失败上传后的已提交文件及恢复                                              |
| journaled-database-recovery                    | marker 表与文件恢复                     | restore 文件使用实际 folder/parent prompt/history/settings 和嵌套文件；在 data 已替换后注入 config rename EIO，核对回滚及重试 |
| canonical-portable-export                      | 注入 close/checkpoint/ZIP 的编排顺序    | 仍不能称全域真实导出验收，本轮不补造这一结论                                                                                  |

新增用例以实际返回值、重开后的完整业务行/关系/版本、文件清单及 SHA-256 为主要断言。Electron 仅替换进程传输，不替换 preload/业务 handler；恢复故障只替换一次文件重命名，其余文件与 SQLite 操作均真实。fixture 数据规模固定，清单/hash 为 O(文件总字节数)，不增加产品并发或限流策略。

D1 的 CJK 两个切点和 emoji 三个切点，以及 D2 加密承诺均使用正确行为断言；不得转为 skip/todo 或期望缺陷行为。最终结果如下；六项缺陷断言均实际运行并失败，没有 skip/todo/expected-failure 标记。

### 最新测试结果与检验有效性

| 持久文件（均位于 apps/desktop/tests/integration） | 测试数 | 最新结果        | 实际可观测断言                                                                                                                                                                                        |
| ------------------------------------------------- | ------ | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| release-acceptance-data-recovery-webdav.test.ts   | 7      | 2 pass / 5 fail | Unicode 正常往返、PROPFIND、401/404；PUT 503 前后原文件及清单相同，恢复后可替换；CJK/emoji 跨块正确文本断言失败，源文件未损坏且随后完整 GET 仍可读                                                    |
| release-acceptance-data-recovery-privacy.test.ts  | 2      | 1 pass / 1 fail | 错误解锁和错误换密前后 data 字节及凭据行不变；两次关闭重开后读回同 ID/内容/版本/私密目录；锁定重开后 DB 明文及四个包含原文的 data 文件使加密承诺断言失败                                              |
| release-acceptance-data-recovery-restore.test.ts  | 2      | 2 pass          | 两 Prompt、一个目录、三个历史版本、父子/FK/设置、SQLite integrity 与全部 payload 文件 hash；旧状态备份可打开；data 已换入后 config rename EIO 导致回滚，原 data/config 全清单 hash 不变，再次恢复成功 |

恢复文件首次执行 2 fail，原因是测试错误地把恢复必须重绑的 `.layout-state.json` 也要求与源 hash 一致。按现行 `writeRuntimeLayoutState(...identityRoot: activeRoot)` 合同修正为目标 rootIdentity、complete、operation 断言；其余 payload 逐字节校验不减弱。失败回滚仍额外比较包含标记的原 data/config 全量清单。只重跑受影响恢复文件，2/2 通过；WebDAV/隐私文件未改变，未重复执行。

恢复失败用例较长是因为必须顺序呈现“真实数据已部分发布→错误返回→旧库及文件恢复→同源重试成功”，不拆成彼此无法证明恢复链的单测。嵌套 Skill 文件为文件保全 fixture，不冒充 Skill 安装流程验收。D1 与 D2 的最终断言在源数据保全/合法读回断言之后，避免数据丢失被误认为加密成功或读取成功。

### 标准入口与静态门禁

- `apps/desktop/package.json` 的 `test:integration` 调用 `vitest run --project integration --minWorkers=1 --maxWorkers=1`；本轮通过该脚本发现并运行三份文件。
- `vitest.workspace.ts` 的 `tests/integration/**/*.{test,spec}.{ts,tsx}` 自动覆盖三份文件，无临时 include 特例。root `scripts/verification/checks.mts` 的 `desktop-integration` 调用同一脚本，适用于 desktop/database 范围；本轮没有运行全 harness。
- `tsconfig.test.json` 的 `tests/**/*` 包含新增文件。标准 `typecheck:tests` 实际执行，退出 2，297 个 TS 诊断分布在 106 个范围外文件，新增三文件零诊断。示例：`tests/helpers/window.ts:536` 的 MockRecord 缺少 API 成员、`tests/unit/components/agent-sessions-panel.test.tsx:1299` 的 tuple 越界。没有修复或改写这些文件。
- 最终三文件另用继承原 `tsconfig.test.json` 的临时配置，仅收窄 include 为这三个绝对路径，其余 compilerOptions 原样继承，类型检查退出 0。该检查不是全项目通过。
- 三文件 ESLint `--max-warnings=0` 通过；恢复文件修改后的定向 lint 再验证通过。未改 ESLint 配置或添加 suppressions。

### 第二轮执行命令与资源

命令仍由附录的 240 秒限时 runner 约束，TMPDIR 为独占 `/tmp/prompthub-data-persistent-BZwCDqJq`，无安装、构建或 GUI。以下命令从仓库根执行；临时结果/配置路径仅是当次证据，不要求保留目录。

```sh
pnpm --filter @prompthub/desktop test:integration tests/integration/release-acceptance-data-recovery-webdav.test.ts tests/integration/release-acceptance-data-recovery-privacy.test.ts tests/integration/release-acceptance-data-recovery-restore.test.ts --cache=false --reporter=json --outputFile=/tmp/prompthub-data-persistent-BZwCDqJq/integration.json
pnpm --dir apps/desktop exec eslint tests/integration/release-acceptance-data-recovery-webdav.test.ts tests/integration/release-acceptance-data-recovery-privacy.test.ts tests/integration/release-acceptance-data-recovery-restore.test.ts --max-warnings=0
pnpm --filter @prompthub/desktop typecheck:tests
pnpm --filter @prompthub/desktop test:integration tests/integration/release-acceptance-data-recovery-restore.test.ts --cache=false --reporter=default --reporter=json --outputFile=/tmp/prompthub-data-persistent-BZwCDqJq/restore-fixed.json
pnpm --dir apps/desktop exec tsc --noEmit -p /tmp/prompthub-data-persistent-BZwCDqJq/tsconfig.json
pnpm --dir apps/desktop exec eslint tests/integration/release-acceptance-data-recovery-restore.test.ts --max-warnings=0
```

临时类型配置为 `extends` 指向 desktop/tsconfig.test.json、`include` 指向新增三文件绝对路径、`exclude: []`。临时根的 node_modules 为已有 desktop/node_modules 的符号链接，无新依赖。

| 批次              | PID   | UTC 开始/结束               | 退出                                                  |
| ----------------- | ----- | --------------------------- | ----------------------------------------------------- |
| integration       | 87323 | 09:43:37.974 / 09:43:43.636 | 1，初次 3 pass / 8 fail；其中恢复两项为标记断言需修正 |
| lint              | 87631 | 09:43:54.879 / 09:43:55.824 | 0                                                     |
| typecheck:tests   | 87845 | 09:44:04.672 / 09:44:34.121 | 2，范围外 297 诊断                                    |
| restore-fixed     | 88338 | 09:45:00.109 / 09:45:02.902 | 0，2 pass                                             |
| focused-typecheck | 88772 | 09:45:24.686 / 09:45:26.279 | 0                                                     |

各 test 的 afterEach 关闭数据库/HTTP/计时器并删除 profile；测试 worker 自身根由既有 setup-runtime 清理。无后台服务保留。最终任务工作区产物仅三测试文件和本报告。

交付核对：五个第二轮 runner 进程组均无存活成员，任务根已删除（包含日志、缓存、配置及依赖软链接，未跟随链接删除依赖）。产品源码 diff SHA-256 仍为 `77a1061f58d601fba045cf84d082373f2db14646aa1914e6a1b1e002d88fc16b`；四个交付文件 Prettier 检查通过，git diff --check 无错误。没有提交、推送或改动其他小组产物。

## 产品修复批次（第三轮）

2026-10-04 最新授权允许按总计划独占范围修改产品源码。D1 修复仅在 main WebDAV HTTP response 设置 Node UTF-8 流式解码，并拼接已解码字符串；不改 HTTP/IPC 形状，不新增依赖、重试、超时或限制。解码为 O(响应字节数)，仅增加流解码器维护的不完整字符状态；响应文本的内存边界沿用原合同。稳定 sync 主题同步声明跨块字节保全要求。D1 原有五项失败断言原样保留。D2–D4 仍需要主协调作跨模块安全/数据决策，不降低私密加密承诺。

D1 验证：`pnpm --filter @prompthub/desktop test:integration tests/integration/release-acceptance-data-recovery-webdav.test.ts --cache=false --reporter=default --reporter=json --outputFile=/tmp/prompthub-data-fix-navmVgsU/webdav-fixed.json`，PID 90672，UTC 09:49:32.173–09:49:34.103，退出 0，7/7 pass，原五项跨块红测全部转绿。`pnpm --dir apps/desktop exec eslint src/main/webdav.ts tests/integration/release-acceptance-data-recovery-webdav.test.ts --max-warnings=0`，PID 91054，退出 0。正常往返、401/404、503 上传失败后的源文件保全和恢复均覆盖；真实远端/GUI/TLS 仍未验证。

后续恢复补验新增：真实临时目录 chmod 导致 EACCES 后保全/恢复；独占子进程在 data 已发布、config 待发布时 SIGKILL，重新执行持久 journal 恢复并核对 prior 副本及第二次恢复无事可做。仅使用任务 profile，子进程有 20 秒 deadline 与 256 KiB 输出上限。该进程失败用例保留完整顺序断言；长函数仅因观察崩溃前后同一恢复链。另新增 D2 密钥保管红测：合成 helper 密文在 lock/reopen 后不能被 settings 中的密码校验值解开。此测试不宣称产品已正式使用 ENC:: 存储正文。

### D2 安全合同核实与待审最小方案

以下为主协调待审方案，不是已实现的新安全合同。未改安全源码、Prompt/Rule 所有者文件或用户数据。

**现有证据与权限边界**：FolderModal 使用 `folder.privateHint`（en.json:1493）承诺保存后加密，`deletePrivateDesc` 同样称 encrypted contents；SecuritySettings 的 `securityDesc` 只说明隐藏。这是产品合同冲突，不能选择较弱的隐藏语义来消红。AGENTS 要求成熟 AES-256-GCM、scrypt、密码不明文、秘密不泄漏；foundation FR-003 要求秘密在权威迁移中保持保护，但没有定义私密内容字段范围/附件/搜索/导出解锁策略。这些缺项由主协调明确。

- 当前 `apps/desktop/src/main/security.ts` 是主密码验证及内存 unlocked/key 的唯一现有 owner。`setMasterPassword` 将 scrypt 派生 32 字节值同时写为 SQLite `settings.master_password.hash` 和 `inMemoryKey`。因此“调用 encryptText 即完成加密”的方案无效：取得同一 DB 就取得该 helper 的解密 key。新增合成回归实际证明 lock/reopen 后 persisted verifier 仍能解开 helper 密文。
- 全部当前 `apps/*/src`、`packages/*` 搜索：`encryptText/decryptText/getUnlockedKey/getKey` 没有业务消费者，只有 main/security.ts 定义；调用主要在 security 单测。`ENC::` 也没有正式业务写入路径。本地 tag `v0.5.9`、`v0.6.0-beta.2` 及最早引入 commit `2fd7a113` 的源码 grep 结果一致，仅定义/测试。这是源码证据，不能证明用户手工导入或所有历史分支从未出现该前缀；没有读取用户库。
- 不能仅按正文 `ENC::` 前缀认定历史密文，它也可能是用户普通文本。正式版本化迁移应按确认的源版本/字段类型处理；缺来源的可疑数据保留原字节为恢复源并报告，不能自动解码、双读猜测或静默清空。
- `packages/core/src/renderer-persistence-migration.ts` 的 `secrets/vault.enc`、Core `agent-management/agent-secret-store.ts`、main Agent/MCP secret-store 通过 Electron safeStorage adapter 保护设备凭据。它们是模型/provider/MCP 凭据 owner，设备解锁与主密码授权不同，不能把私密正文密钥塞入同一 vault 来绕过主密码锁定。
- sync-backup-core 的 WebCrypto 备份加密采用用户提供的 transport 密码；是远端快照加密边界，也不能自动当作本地私密正文的 key owner。

| 最小待审合同             | 推荐边界及必要验证                                                                                                                                                                                                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| verifier 与内容 key 分离 | 保留单个主密码 owner，在 shared Core 可供 Desktop/CLI 统一使用的正式安全边界集中实现；密码验证材料绝不能直接成为内容 key。可复用 Node crypto 的 scrypt/AES-GCM 和现有异常/状态接口，不能复用当前 hash-as-key 关系。优先评估独立随机内容 key、密码派生 wrapping key 与独立 verifier 的标准 envelope；格式/参数/版本由主协调确定，未实施自定义算法 |
| 换密不丢数据             | 换密只重包同一内容 key，old-password 验证失败保持所有记录/文件/凭据原样；新 envelope 原子提交后才切换内存状态；断电后旧或新 envelope 至少一个有效，不能先覆盖唯一可解密 key。读取、再加密和导出需要已授权 owner，renderer 不接收裸 key                                                                                                           |
| 私密字段与锁定行为       | 至少涵盖正文/systemPrompt、description/notes/AI response、变量和值、历史版本及被承诺为内容的附件；标题/标签/目录名是否敏感需要主协调确定，不能由实现遗漏决定。锁定时 main/Core 的读取、版本、搜索、导出都不能返回私密明文；仅隐藏 renderer 列表不足                                                                                              |
| FTS 与临时明文           | schema.ts 的 prompts_fts 外部内容索引与 INSERT/UPDATE triggers 当前保存正文等索引词；密文化正文但保留旧 FTS 页仍泄露。私密词不得进入持久 FTS；解锁后的搜索可用同 owner 的临时索引/内存读取，锁定时销毁；UI 结果缓存同时失效。该策略需与 Prompt owner 协调，不能本组直接改触发器                                                                  |
| 当前持久副本             | D2 fixture 明文落在 prompthub.db、data/prompts/<id>/prompt.json、其 versions/000001.json、data/.versions/<id>/0001.md；此外 checkpoint/逻辑导出/备份会复制。不能只改 prompts.user_prompt。D3 收敛后结构化数据以 SQLite 为唯一权威，实际附件以受控文件为权威；旧 canonical 与历史副本只在迁移/恢复中存在                                          |
| 导出/备份/恢复           | 锁定状态不得输出含私密明文的 JSON/ZIP 或同步 payload。加密恢复包应保留 envelope 与内容 key 关系并校验完整性；解密导出必须明确获得解锁授权。旧明文备份无法靠当前锁定变成密文：保留可恢复性、列明历史安全点处理范围，不能未经确认静默删备份                                                                                                        |
| 数据迁移与失败恢复       | 解锁成功后在已有安全点+stage/journal 边界转换，不在普通读取时推断格式。逐项核对 ID、folder/parent/relation、所有版本、明文解密等价性与附件 hash 后切换；失败保留源+恢复副本，不登记完成。保护 SQLite 空闲页/FTS/WAL 中历史明文需要在独占 checkpoint 边界验证清理或受控重写；不得宣称能擦除 SSD/系统备份中的历史字节                              |

代表性合成旧数据至少包括：无主密码的公开记录；已设置 master_password 的私密/公开混合；嵌套目录、跨目录移动、正文/历史/附件；看似 `ENC::` 的普通文本；canonical 与 DB 同 ID 同内容和冲突内容；现有安全点与导入包。验证密码轮换前后重开、错误密码和损坏 envelope、部分转换失败/强杀、两次迁移、FTS/历史/导出无明文、同 ID/版本/关系/文件数量保全。迁移执行需要输入密码，不能从现存 hash 恢复安全的旧密码派生 wrapping key。

### D3/D4 与已有 foundation 阶段对照

| 缺口              | 现行已确认目标                                              | 尚存实现与确切待完成批次                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D3 数据权威       | FR/DES/T-FOUNDATION-003，design 分批第 3/4 批               | runtime-storage-context.ts:381 仍生成 canonical-files/database-catalog 两模式；Core database.ts:37–52 在普通初始化走 reconcileCanonicalStorageCatalog 和 Skill/Rule reconcile；canonical-prompt-graph-db.ts、canonical-skill-db.ts、canonical-rule-db.ts 仍按 localAuthority 分支运行；main canonical-storage-startup.ts / canonical-storage-self-heal.ts 仍把 canonical 重建当启动路径。第 3 批应按现有 inventory 转换独有数据、删除正常路径分支与镜像/重建；第 4 批统一 Desktop/CLI/import/restore 正常入口并验证两次启动，不再另设计全域迁移 |
| D3 配置与近期历史 | FR-003/008，tasks 的 Migration-only implementation 未完成项 | renderer-persistence-migration.ts 的 config 文件/vault 与 SQL 设置仍需按权威方案迁移；portable-snapshot-restore.ts 与 canonical-storage-checkpoint.ts 仍处理 canonical shadow。主协调需冻结 v0.5.9、两个 beta 的真实 schema/格式/同版本差异代表源；不能用新 schema 贴旧 tag 或把独占 Prompt/Rule 修复扩成整体权威变更                                                                                                                                                                                                                           |
| D4 同步           | FR/DES/T-FOUNDATION-005                                     | sync-backup-publication.ts 与 sync-backup-core 已有内容寻址对象及先对象后 manifest；这只完成不可变发布的一部分。autoSyncBackup 的 :1478/:1482 仍按 remoteTime/localLatestTime 决定下载/上传。main WebDAV/S3 preload 合同没有 expected revision/ETag 条件发布参数与冲突返回；仍缺共同 base、revision/tombstone、资源级三方比较、删除/修改冲突保全、条件 HEAD、未明结果回查、pin/GC 与 provider 真实条件写验证                                                                                                                                    |

D4 接续已有设计：先完成可验证不可变 generation/conditional HEAD，再接三方 revision/delete 合同；不能新增另一套“兼容同步模式”或把当前 LWW 称为目标已实现。没有真实条件发布证据的 provider 按 FR-005 只能声明 backup-only 能力，此产品能力调整由主协调与跨端所有者落实。D3/D4 没有被本轮 D1 解码修复或恢复测试完成所解决。

### 恢复补验结果与平台边界

- `recovery-extended`（PID 92234，UTC 09:52:00.353–09:52:08.406）执行 restore + privacy 两文件：7 项中 4 pass / 3 fail。两个失败为 D2 正确行为红测；第三个为新 crash fixture 的 ESM/CJS 入口不匹配，未触发产品恢复代码，不算产品缺陷。
- crash fixture 改为与当前 TSX/源码模块匹配的 `.cts` 后，只执行 `pnpm --filter @prompthub/desktop test:integration tests/integration/release-acceptance-data-recovery-restore.test.ts -t SIGKILLed --cache=false --reporter=default --reporter=json --outputFile=/tmp/prompthub-data-fix-navmVgsU/crash-fixed.json`（PID 92660，UTC 09:52:31.231–09:52:34.076）：目标 1 pass，另 3 项未被名称过滤选中，沿用此前通过证据；没有在源码中 skip 已知产品缺陷。
- 真正 SIGKILL 的子进程属于测试 runner 进程组，有自身 deadline/输出上限；返回 signal=SIGKILL。终止时 real journal 为 swapping/currentEntry=config/swappedEntries=[data]，新 DB 可读，重入提交后新数据与源匹配、prior 旧数据可读、再次恢复 status=none。
- 真实 EACCES 用例 1 pass：只对任务 active profile chmod，finally 恢复原写权限；失败后原内容和源 hash 一致，重试可用。并未填满本机磁盘，ENOSPC 实测仍 not-run。
- 主协调确认平台编排后，真实 chmod 用例使用 `it.runIf(POSIX && non-root)`，SIGKILL 用例使用 `it.runIf(POSIX)`。Windows 对这两种 POSIX 实测为 unsupported；root 权限拒绝场景未执行，不计 pass。所有平台仍执行既有可控 EIO 注入/回滚/重试测试。当前 macOS 命中两条件，实跑证据保留；未虚报 Windows 通过。
- 新增恢复/隐私文件定向 tsc（继承原 tsconfig，仅限定本组文件）和 lint 通过；平台条件加入后再次进行受影响静态检查。完整 typecheck/build/harness 不重复运行。

最新持久测试总数为 14：WebDAV 7 pass；privacy 1 pass / 2 fail；restore 4 pass（macOS 非 root）。D1 已修复，D2 两个红测仍保留。第一轮 40 项能力覆盖表是历史快照，不能把新增用例数量当作全领域通过率；其中“真实进程崩溃恢复”现在通过上述单一边界，“真实磁盘满/权限撤销”仅权限分支实测通过，ENOSPC 分支仍 not-run。

### FR-008 近期源状态与 fixture 准备依据

仅使用本地 Git 对象只读核对，未 checkout/安装旧依赖/启动旧版本/读取真实 profile。以下 commit 为 annotated tag 的 peeled commit（`git rev-parse '<tag>^{}'`），不是 tag 对象 ID；本轮未联网核对发布包，不能将源码 tag 等同已获取的安装产物。

| 来源          | peeled commit                            | packages/db/src/schema.ts Git blob       | 已核对结构/迁移差异                                                                                                                                                                                                                                                     |
| ------------- | ---------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v0.5.9        | 1e933ae29726361982c5ce7b49bc4f4c6da326ba | 6b14da2c3c55f48d1815280a3f9344a994505e44 | schema_migrations 名称登记；init 未设置 PRAGMA user_version，且无 database-migration-state.ts。包含 Prompt parent/order/relations/output items、Skill 指纹/来源状态、Rule；尚无 beta 引入的 canonical/Agent/session/generation 表和资源 schema 文件                     |
| v0.6.0-beta.1 | 494d57d7da654b8380e4b81f8f51fc5c72e6b7f7 | 4b622dd672b138b105223eeee97d70fb0efd1eb5 | user_version=3；manifest 1 shared-schema-baseline-v1、2 skills-logical-identity-v2、3 canonical-resource-catalog-v3。active Agent profile 名称存在 platform+LOWER(name) 唯一索引；canonical staging 会选择同名 winner 并归档其他条目                                    |
| v0.6.0-beta.2 | b7854508c3c69eb99cc2d1b6207db02ce5a25ddc | 5aade3db38410a361ad674cac13bf0fd7cb340f6 | user_version仍3，manifest 1–3 checksum 不变；legacy-013 allow_duplicate_agent_provider_profile_names_v1 删除 active_name 唯一索引；canonical staging 改为保留原 archived 值，不再自动归档同名条目。当前 HEAD schema blob 与本 tag 相同，不代表运行迁移/文件格式整体相同 |

beta.1 与 beta.2 的 `skill-resource-schema.ts`、`canonical-storage-authority.ts`、`renderer-persistence-migration.ts` 源码分别相同：Skill metadata/history schemaVersion=1、authority=1、renderer persistence=1。当前工作树 Skill reader/writer 支持 schemaVersion 1/2（encoded history snapshot），不能反过来给两个已发布 beta fixture 使用 schemaVersion 2。beta 的 source/schema版本、数据库 PRAGMA版本、领域格式版本与应用版本必须分别记录。

复用的现有 `tests/fixtures/historical-databases.ts` 是手写精简 0.4.7/0.4.8/0.5.1/0.5.2 schema+种子，不含上述三个近期源；其真实 SQLite 断言有效，但不是历史安装包生成的 profile。没有发现可直接复用的 v0.5.9/beta 全域完整源产物。本轮没有用当前建表结果贴旧版本标签，也没有新增伪历史 fixture。

下一 foundation 批次可据此分配三组固定来源：

1. v0.5.9 原 tag DDL/init 与文件布局，分别准备全新安装、从旧版连续升级两种源；记录 actual schema/index/trigger/FK 指纹及 legacy migration rows。必须含 Prompt DB-only notes/last_ai_response/graph/output、Skill 包与历史、Rule 文件与历史、设置。
2. beta.1 source 含同版本3但 active_name index 尚在的 DB、合法单一 active profile、canonical schema1 与 renderer migration未完成状态；另保留外部 canonical 同名冲突候选，不能用新写入规则构造旧DB不允许的行。
3. beta.2 source 含同平台重复 active profile/映射、其准确 legacy-013、完整 canonical schema1、设备秘密引用、部分转换/DB缺失与文件残留源。升级与两次重开断言必须保留两条 profile 及所有业务数据；不能先用 beta.1 staging 把一条归档。

缺失证据：对应发行安装包或由 exact old runtime 实际生成的完整 synthetic profile、连续升级链产物、各源 file inventory/hash、旧设备加密配置的安全迁移策略。已确认的源码对象足够准备独立 fixture 批次，但不是已完成历史升级验收。D3 当前转换方案尚未交付，最终验收需在其明确实现上运行，不能先证明被替代的 catalog 重建后宣称 FR-003 完成。

### 现有全域导出/恢复 fixture 的实际分母

本轮复核源码与第一轮结果，不重复运行同状态套件。

| 现有 fixture                           | 非空数量/字节证据                                                                                                                                                                            | 仍缺的联合证据                                                                             |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| database-backup-filesystem.integration | 1 Prompt、1 Folder、1 Prompt version、1 Skill及1 Skill version；Skill 四文件（SKILL.md、notes/example.md、4字节binary、100000次重复文本），1图片/1视频的base64与恢复字节；settings是mock输入 | 元数据/IPC为内存替身，Rule/Plugin/Agent为空，settings restore mock；无真实全域SQL导出/重开 |
| portable-snapshot-restore 正常archive  | 新Prompt替换旧Prompt，真实SQLite+文件；其他域为空                                                                                                                                            | 非全域数量/字段/包与媒体联合比较                                                           |
| portable-snapshot-restore Rule用例     | 1 Rule正文与2个按时间重编号的历史记录，真实RuleDB与文件                                                                                                                                      | 与Prompt/Skill/Plugin/媒体/设置同一快照联合重开缺失                                        |
| portable-snapshot-restore Plugin用例   | 1 Plugin、1个15字节 .codex-plugin/plugin.json；本机路径重绑                                                                                                                                  | 没有非空Plugin历史、其他包文件、Agent/settings联合比较                                     |
| canonical-portable-export              | 注入close/checkpoint/ZIP对象，证明编排顺序                                                                                                                                                   | 没有真实全域生成的ZIP→恢复→reopen；不能以mock返回文件视为完成                              |
| portable-canonical-consistency         | empty全部域一致，以及域级不匹配拒绝                                                                                                                                                          | 全scope=true且空数组不等于非空全域覆盖                                                     |
| 本轮新增restore                        | 2 Prompt、1 Folder、3 Prompt versions、父子/目录约束、1 settings行、二进制媒体与嵌套Skill目录字节；关闭重开及失败恢复                                                                        | 没有真实Skill metadata/version、Rule/Plugin/Agent联合快照；已准确标注文件fixture边界       |

下一全域 fixture 应在一份源中同时给每个受支持域非空样本（Prompt图/输出、Skill完整包与版本、Rule正文与版本、Plugin包与版本、Agent/MCP/Generation、图片/视频、非秘密设置与独立凭据），经实际初始化、checkpoint ZIP、恢复到另一独占根、两次重开，以逐域ID/版本/关系/字段/文件hash与旧根保全验收。现有资产可以复用字段结构与断言；不能将这些互不相连的局部通过相加称为全域往返通过。该联合fixture仍not-run，交由主协调结合D3分配精确数据所有权和实现批次。

最终静态复查边界：`platform-static`（PID 96121，UTC 09:56:10.029–09:56:15.419）退出 2，唯一诊断为并行 Agent/Rule 所有者修改中的 `packages/core/src/canonical-rule-db.ts:130`：TS2322 unknown 不能赋给 string；本组三测试没有诊断。此前 09:53 的定向 tsc 通过仅适用于当时源码状态，不能称最新共享工作树类型检查通过。该范围外错误交主协调处理，本组不修改 Rule 文件、不重复全项目门禁。其余组此时已开始产品修复，因此历史全仓 diff hash 不再代表当前候选；最终组合回归由主协调固定候选后执行。

第三轮交付清理：所有记录的 runner 进程组（含 SIGKILL fixture 子进程）均已退出；临时 profile/数据库/journal/HTTP 端口均释放。独占根 `/tmp/prompthub-data-fix-navmVgsU` 的日志、结果、缓存、临时配置与依赖软链接在保留本报告证据后删除，不跟随链接删除已有依赖。最终 ESLint 和五文件 Prettier 检查通过，相关 tracked diff --check 通过；未提交、推送或发布。

## 第四轮：非空联合 portable 基线

新增 `apps/desktop/tests/integration/release-acceptance-data-recovery-portable.test.ts`，所有权限于该文件及本报告，产品和共享 helper/config 不改。真实入口为 renderer `downloadSelectiveExport` → 完整 preload → 注册 portable IPC → checkpoint/真实 ZIP → 独立根 restore → 正常 canonical startup/init/公开 consumer 读取两次。只替换 Electron 传输、系统保存对话框、重启回调、OS 凭据能力及 HOME 隔离；不替换导出、恢复、业务服务或数据库。

样本包括 2 个公开 Prompt、1 Folder、3 Prompt 历史、1 关系、1 完整 Skill 包及版本、1 Rule 及 2 历史、1 Plugin 包及版本、图片、视频载荷和非秘密设置。MCP/Agent scope 纳入完整 checkpoint 但内容为空；本用例不代表非空 Agent/MCP/Generation 或秘密跨设备迁移。媒体仅核对载荷，不代表视频解码/播放。逐域元数据、ID、关系、版本与包/媒体完整清单和 SHA-256 必须一致，源根和原始包也须保全。唯一归一化为活动 profile 路径前缀；`.canonical-bundle-hash` 是衍生标记，仅从 Skill 包源文件对照中排除。

测试采用一个完整生命周期用例以保留源快照、导出、恢复与两次启动的因果关联；此回调超过 50 行有此明确原因，seed/runtime/inventory 分离为语义函数。数据量为小型非空领域 fixture，扫描/hash 为 O(文件总字节)，无网络调用、无依赖安装、无 GUI、无真实用户 profile。验证时记录 main/preload/renderer-services/core/db/shared 源文件哈希，单进程、单 worker、240 秒 deadline 与 8 MiB 输出上限。实际执行结果待补充；这不是 D3 SQLite 目标架构或历史升级通过证据。

### 第四轮结果：D5 / P1，恢复成功返回后无法正常启动

最终正确行为用例 **1 fail**，保留失败，未 skip/todo。非空 fixture 的数量、字段、版本、关系、原始 Skill/Plugin 包清单、设置先验均通过；真实 renderer 导出及 checkpoint ZIP 成功，源 profile 重新正常启动后完整 consumer 快照一致。独立 fresh profile 的公开 restore IPC 返回 `success:true, needsRestart:true`，源 profile 的 data 完整 SHA-256 清单及 ZIP 原始字节不变。然而第一次正常启动返回：

```text
status: recovery-required
reason: invalid-canonical-prompt-graph
error: canonical graph file inventory count mismatch: legacy-versions/<prompt-id>/0001.md;
automatic file repair failed: canonical rules metadata directory is invalid: .versions
```

因此恢复后的 consumer 对比、第二次启动、恢复根 FK/quick_check 与媒体消费尚未执行，不能称联合恢复通过。当前归属为 portable restore / canonical Prompt graph 与 Rule 路径约定的交叉缺陷，根因修复待协调分配；未修改产品源码。源数据保全已在启动失败之前单独断言，避免将早退出误称数据保全证据。

验证命令（标准 package integration 自动纳入，root harness 无须新增配置）：

```sh
pnpm --filter @prompthub/desktop test:integration tests/integration/release-acceptance-data-recovery-portable.test.ts --cache=false --reporter=default --reporter=json --outputFile=<owned-temp>/portable-startup.json
pnpm --dir apps/desktop exec tsc --noEmit -p <owned-temp>/tsconfig.json
pnpm --dir apps/desktop exec eslint tests/integration/release-acceptance-data-recovery-portable.test.ts --max-warnings=0
```

- 初始 runner PID 786、1168 在 Node 全局 localStorage 环境差异处失败，尚未触及产品流程；fixture 改为真实 JSDOM Storage 并在 finally 生命周期关闭。PID 1473 检出样本先引用媒体后落盘的准备顺序错误，已改为先写文件再创建 Prompt；PID 1719 检出持久化 settings 真源使用 `themeMode` 而非旧 `theme`，按现行合同修正。这些不是产品缺陷。
- PID 2209（UTC 10:07:14.086–10:07:22.456）首次到达真实 D5；补充完整 startup 诊断与失败前源保全断言后，PID 2616（UTC 10:07:43.406–10:07:51.357）再次暴露上述同一 D5，退出 1。
- 最终定向 tsc PID 2987（UTC 10:08:05.544–10:08:07.365）退出 0；ESLint 退出 0。类型配置仅继承原 desktop `tsconfig.test.json`、include 本文件、exclude 空数组，未修改共享配置；不是全项目 typecheck 通过。
- 每次 runner 都记录 542 个 main/preload/renderer-services/core/db/shared 源文件哈希；所有执行前后均无变化，清单 JSON 的 SHA-256 为 `d3cebd4a9626931eb9d953da71dc6acf5c903eb00314c8baa3625f3dc1ffc6d9`。fixture 变化与产品源码漂移已区分。
- MCP/Agent 非空业务与 Generation 非空记录仍不在本基线范围。历史升级和 D3 目标架构仍未验收。

第四轮清理：8 个记录的 pnpm 进程组全部退出；测试内 DB、JSDOM、独占 profile 释放；runner 独占临时根（含初始环境失败留下的 profile、日志、JSON、tsconfig 与 node_modules 软链接）已删除。无端口/服务器/真实用户配置改动。D5 证据已交主协调；不提交/推送/发布。

## 第五轮：D5 候选修复与当前合同回归

修复针对当前 canonical runtime：在脱离活动根的候选中合并选中数据域、数据库和配置，再复用已有 checkpoint/projector 生成可正常启动的文件图和 catalog。候选与发布后的活动根均经现有完整 authority 验证；全部文件与数据库仍由同一个 journal 原子发布和失败回滚。没有事后修补、放宽 graph reader 或切换全局 runtime 路径。此修复不代表 D3 的 SQLite 目标架构完成。

- 候选 helper 明确注入 staged Skill 包、Rule 正文/历史、Plugin 包/历史、Generation/CAS、MCP 完整 bundle；显式空集合不回退读取用户目录。候选引用映射到最终活动根，附件、未引用媒体、会话、operation/migration 记录保留。
- 选中设置使用正式 agent-settings-v1 入口合并四个键；未选设置及设备配置保留。本机 secrets 先按原始字节恢复至候选，并通过真实 renderer persistence reader 核对引用后才发布；不导入 portable 中的秘密。OS safeStorage 为确定性 fixture codec，只证明引用和字节保全。
- 选中 MCP 仅保留恢复后存在的 server ID 绑定；未选 MCP 绑定逐字节保留。完整 MCP bundle 的历史、secret references 原样转移，不解密或用 redaction marker 覆盖凭据。独立 marketplace metadata 在 scope 合并后保留，不因 projector 替换目录而丢失。测试外的 native Agent 文件不修改。
- Rule 从 logical 元数据恢复规范文件名和版本内容；无部署目标保留 detached 状态，不能从旧源路径推导新部署位置。Rule 输入转换修复及后续 detached binding reader 修复归协调/Rule 所有者，完整 ZIP 集成验证由本组执行。
- Prompt 选中、历史未选时创建唯一当前快照，版本号不递增，保留双语正文、变量、AI response 与更新时间；选中历史缺 current version 仍按数据完整性合同拒绝。现有单测实测 currentVersion=3，唯一快照仍为版本 3。

### Plugin 路径升级

D5 consumer 暴露 projector 的编码目录与 Plugin reader/writer 的 raw ID 目录冲突。reader/writer 统一复用 encodeCanonicalResourceDirectory。已发布 beta 存在 raw 写入，所以新增 plugin-resource-paths-v1，启动维护边界先校验全部 bundle、ID/目录、碰撞和安全路径，再通过已有 canonical publication journal 同时完成原字节备份、编码路径发布、旧目录删除与版本 marker。不添加长期双读。

备份位于 recovery/plugin-resource-paths-v1/<encoded-id>/<contentHash>；重复启动不再迁移。碰撞、身份错配、软链接、graph 显式声明旧路径均在发布前拒绝；EIO 发布失败原目录和 marker 保全，恢复后重试通过。升级与回滚边界见稳定 plugins.md。现有 canonical graph 明确声明的旧目录不在自动迁移支持范围，不静默改 graph counts。

### 实际执行与未覆盖范围

| 检查                       | 实际结果                       | 证据边界                                                                                              |
| -------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Core shadow                | 26 pass                        | 包括新增 4 项 MCP 完整历史/secret reference 字节、损坏/重复/混合输入拒绝；沿用已接受结果              |
| Core Plugin consumer       | 14 pass                        | 原 reader/writer 路径回归，沿用已接受结果                                                             |
| Plugin path migration      | 7 pass                         | raw/encoded/Unicode/percent、多次初始化、真实 CRUD/历史、备份字节、碰撞/EIO/路径安全；沿用已接受结果  |
| Core reconciliation        | 31 pass + 受影响 1 项后续 pass | fixture 先完成正式初始化，再记录 rows/inode/handle 基线；不合称一次 32/32                             |
| 四份 main 投影/恢复测试    | 34 pass                        | 仅补规范 fixture 类型；沿用已接受结果                                                                 |
| 现有 portable restore      | 8 pass + 受影响 3 项后续 pass  | 11 个不同用例，无删除、skip/todo；完整一次 11/11 尚未声明                                             |
| 新增 portable 联合生命周期 | 4 pass                         | 真实 ZIP、独立目标、两次正常启动与 consumer；选中/未选配置及 EIO 回滚；历史失败保留为已修复记录       |
| 本批定向 types/lint/format | pass                           | scoped tsc；17 文件 Prettier；Desktop lint 0 error，Core 单独采用已有配置 lint 通过；不代表全项目门禁 |

2026-10-09 新独占根 /tmp/prompthub-data-d5-\_ai28jei，使用缓存 pnpm 9.15.0 CLI、Node 与 uv 已有解释器，不安装依赖；每次一个检查进程，Vitest 单 worker、180 秒 deadline。2026-10-05 中断前旧系统 TMPDIR 已不存在，进程检查无遗留；原轮关键错误与通过计数保留在协调记录，不虚构已丢失的临时文件或结果 JSON。

当日现有 restore 诊断 PID 39089，6 fail/5 pass，准确暴露未选历史的 current version 缺失及 raw Generation fixture。集中修复源码与 fixture 后 PID 40804 为 8 pass/3 fixture fail：两处使用错误的 graph 返回字段、一个 Variable fixture 缺 type/required。这些夹具错误已明确修正；PID 41102 仅重跑受影响三项，3 pass/8 name-filtered。定向 tsc PID 41094 退出 0；最终 fixture lint PID 41122 退出 0。Generation fixture 使用真实 materializeGenerationResourceBundle 与 CAS 对象，恢复后读取 bundle、payload hash 和原始字节；Rule current 与 latest history 一致；Plugin 使用完整规范 metadata，按当前 encoded 路径读取全部包文件，不再断言旧缓存路径。

17 文件 Prettier PID 41360 通过；首次跨目录 Desktop ESLint PID 41367 只有 Core 文件 outside-base-path 的 8 个忽略 warning，因此退出 1，不能记为 Core 已检查。随后在 Core 工作目录显式复用原 Desktop ESLint 配置，PID 41591 对八个 Core 文件实际检查通过；不增加共享配置或关闭规则。

候选 helper 的 collectRules 与完整生命周期用例超过 50 行：前者把同一 Rule 的结构化记录、正文和历史完整映射到现有 checkpoint 输入，后者保留导出、恢复和两次重开的因果链；分离 seed/runtime/inventory 函数，避免把一个事务/生命期切为任意步骤。Generation fixture 以一个函数声明完整公共 manifest，便于核对计数、slot 与输出 hash。新源文件均低于 1,000 行；现有 restore source/test 约 1,050 行，未达到 2,000 行上限。扫描/hash 为 O(文件总字节)，一次 Skill inventory 建索引，无 N+1 全树扫描；这是小型正确性 fixture，不代表大数据预算验收。

仍缺：GUI/原生安装包与 OS keychain、近期旧版本全域 Desktop 升级、非空 Agent/Generation 与其他域同一 ZIP 的联合往返、跨设备秘密迁移、完整 root release harness 与生产环境验收。D2/D3/D4 保留独立未完成状态；不能以 D5 局部恢复和单元测试通过宣布版本可发布。

### D5 最终结果与清理

2026-10-09 完整 integration **4/4 pass**（PID 42704，UTC 03:53:46.131–03:54:08.145，退出 0）。正常 ZIP 用例同时核对 2 Prompt、1 Folder、3 Prompt histories、1 关系、Skill 全包及版本、Rule 正文及 2 历史、Plugin 全包及版本、图片/视频字节与非秘密设置；源 data 的完整 hash 清单及 ZIP 字节不变。独立目标的两次正常 startup/init 与公开 consumer 对比均通过，FK 与 SQLite quick_check 通过。其余三项在非空目标上证明未选域和设备配置保留、选中设置合并、MCP bundle 历史/秘密引用保留及 config rename EIO 后同一 journal 回滚；每项回滚/恢复后均完成两次正常启动，vault 和其他秘密文件原始字节、合成凭据读回以及 native Agent 文件保全均通过。

Rule 所有者的 detached reader 只允许空 targetPath 与 null projectRootPath 的明确配对；维持项目 metadata 的身份，非法配对仍拒绝。该所属回归由 Rule 报告负责，本组不相加测试计数。D5 联合测试使用 canonical-rule-db.ts SHA-256 `781c1a0e1611118e719d0a8af33584cddf2a0209c007f2a634b337343279c10d` 与 rule-resource-schema.ts `640088c044e60b48b7633dd7a4bcce59756ad9fea0b7dbd54083b216810b75c9`。最终定向 tsc PID 42655，UTC 03:53:43.985–03:53:46.129，退出 0。

541 个 main/preload/renderer services/core/db/shared 源文件在本轮最终验证前后 hash 完全一致，清单聚合 SHA-256 `652218d3241f9a444f57e7139e79157f4ed4e4ef113ed4c2eac13262a80bccd2`。restore source SHA-256 `c50c9fe326a5e6c0b8b4a28531077a818a6fbd709a4efd3084728a7747f4072d`，candidate helper `97213f0c7dd3debaca6aeb573031f2d6f81bcee7175d0f9c5afac174c0f5509f`。没有运行期间源码漂移；文档追加不影响上述源码状态。

可复现命令（本次实际使用已缓存 pnpm 9.15.0 CLI，避免系统管理器重新下载版本）：

```sh
node /Users/lingxiaotian/Library/pnpm/.tools/pnpm/9.15.0/node_modules/pnpm/bin/pnpm.cjs --filter @prompthub/desktop test:integration tests/integration/release-acceptance-data-recovery-portable.test.ts --cache false --reporter=default
node /Users/lingxiaotian/Library/pnpm/.tools/pnpm/9.15.0/node_modules/pnpm/bin/pnpm.cjs --dir apps/desktop exec vitest run --project unit --minWorkers=1 --maxWorkers=1 tests/unit/main/portable-snapshot-restore.test.ts --cache false
```

第二条给出完整 11 项的复现入口，本批实际最终采用 8+受影响3 项分批验证，未虚构完整一次 11/11。定向 types 使用临时 tsconfig 继承 desktop tsconfig.test，include 两个 restore source、portable integration 与 restore unit，exclude 空；没有更改共享配置。

当前缺陷状态：D1 local_done；D5 local_done；D2 私密目录加密承诺、D3 SQLite authority conversion、D4 causal sync 仍未完成。GUI、原生跨平台、历史 Desktop 全域升级和 root harness 尚未完成，发布验收保持 incomplete。

清理结果：12 个 runner 检查进程已退出；测试 DB、JSDOM、profile 和文件句柄释放，没有启动端口、后台服务或 GUI。独占临时根、日志、JSON、配置、缓存及 node_modules 软链接在提取本报告证据后删除；只删除本组资源，不跟随链接删除既有依赖。不提交、推送或发布。

## 第六轮：非空 Provider / Generation 联合 ZIP 验收

范围仅为新增测试与本报告。既有 D5 四项不重复运行，产品源码冻结；D2 的两条正确失败断言及 D3/D4 状态保持。测试在原 public renderer export → ZIP → 独立目标 restore → 两次正常 startup → public consumer 链中加入非空 Provider、model mapping、Generation batch、Prompt/version/reference image 引用、收藏输出与真实 PNG/CAS 字节。参数覆盖选中设置、未选设置及 config 发布 EIO 回滚；源根、原 ZIP 和失败前目标 data/config/secrets 保全。

只修改本组新增 release-acceptance-data-recovery-portable.test.ts；不更改旧测试/helper、跨组 fixture、历史源码、全局配置或产品行为。小型样本的 inventory/hash 成本为 O(文件总字节)，不代表大规模容量验收。完整生命周期函数保留同一因果链；新增用例与既有初始化/seed helpers 共置以复用相同真实入口，不增加备用业务实现。实际结果如下。

### 实际结果与差异

| 新增场景                           | 结果 | 实际边界                                                                          |
| ---------------------------------- | ---- | --------------------------------------------------------------------------------- |
| 非空 Provider/Generation，选中设置 | fail | restore 成功、两次启动均完成；mapping ID 与包 manifest hash 不同                  |
| 非空 Provider/Generation，未选设置 | fail | 目标设置保留、两次启动均完成；同上差异                                            |
| 同一非空源/目标，config 发布 EIO   | pass | journal 回滚，target data/config/secrets 原字节保全，两次启动及公开 consumer 一致 |

成功返回的两项逐次核对 2 Prompt、Folder、Prompt histories/关系、Skill 完整包/历史、Rule 正文/历史、Plugin 完整包/历史、图片/视频及非秘密设置；两次 startup 的 FK 和 quick_check 均通过。Generation batch ID、output ID、sourcePromptId/sourcePromptVersion、referenceImages、变量、模型、参数、状态/计数/时间、收藏、revisedPrompt、batch.json hash、公共输出 base64 与实际 CAS PNG 均一致。Provider profile ID、profile fields/time、mapping providerProfileId/routeKey/modelId/parameters 一致。源 data hash 清单与原 ZIP 字节在恢复和两次启动后均未改变。

两个差异不能混称为业务正文或输出丢失：

- **model mapping 身份改变。** 最新正常样本源 mapping ID `f995a451-d950-4833-9d86-92d53681497d` 恢复后为 `73279d62-6296-42fc-bc69-a5480cef3b23`，两次启动保持后者。当前 AgentManagementBackup 的 modelMappings 使用 CreateAgentProviderModelMappingInput；agent-management-backup-service.ts exportBackup 只导出 routeKey/modelId/parameters，packages/db/src/agent-provider-profile.ts insertPortableProfile 使用 uuidv4 生成新 ID。完整 ZIP 同时包含原 Agent bundle，但恢复的 logical import 与候选重建覆盖了这项身份。本轮稳定 ID 验收断言不删除；是否允许该 portable 合同重建子实体身份需由主协调核实，不能把可能有意的旧合同直接称为已确认数据丢失。
- **Generation bundle manifest hash 改变。** 最新源 `manifest.json` SHA-256 `1e0592f4296e0b13b664f7fda74deb36771b790362598cb68771fdead91b8133`，恢复后为 `33278e765d776305ad1d7d407af4f6ea3f0ccfa11ad3effe99ba930d9981ef94`，两次启动一致。batch.json hash 和输出 payload hash/原字节均一致。源码 collectGenerations 只传业务 manifest/outputSources，canonical-storage-shadow 新建 wrapper 时未传原 bundle writePolicy/revision；因此存在 wrapper 重建差异，尚未单独断言新旧 wrapper 每个字段。主协调需核实 wrapper 字节/修订的保全边界；不提前宣布 Generation 业务内容丢失或发布修复。

使用 expect.soft 保持两个完整对照为失败，同时继续执行第二次启动、真实 CAS 字节、SQLite 和源保全检查；没有 skip/todo、去掉失败字段、伪造 ID 或修改产品来绿测。包 manifest 的现行重新投影行为与本轮字节保全验收之间的差异已明确记录。

### 验证记录

- 初次 PID 61990（UTC 05:22:49.953–05:23:11.242）3 fail：目标 fixture 复用了同一 project 目录，EEXIST，尚未触发 restore。仅在本组新增文件的 seedRuleAndPlugin 增加默认 sourceBase 参数，目标显式用 target-inputs；此前四项仍用原默认目录。
- PID 62418（05:25:51.810–05:26:23.567）3 fail：恢复前 inventory 在 DB 开启时纳入了 prompthub.db.clients 的进程登记，正常 close 后消失。改为与第五轮相同的 closeDatabase 后采集基线，保留全部持久文件对照；不从清单静默删项。
- PID 62863（05:28:10.115–05:28:40.859）**2 fail / 1 pass / 4 name-filtered**：首次暴露上述实际身份/包差异，失败回滚项完整通过。随后只将完整对照改为 soft 以继续观察并补恢复后二次源保全。
- PID 63210（05:30:47.460–05:31:09.785）仅重跑两个受影响正常用例：**2 fail / 5 name-filtered**，第一和第二次启动均命中同样失败断言，其余真实字节、设置、SQLite 和源保全检查完成。没有重新执行已通过的失败回滚项或旧四项；三项最终不同用例证据为 1 pass / 2 fail，不能虚构一次最终全绿。
- 最终 scoped tsc PID 63458（05:31:09.786–05:31:11.577）退出 0；Desktop 定向 ESLint PID 63467（05:31:11.578–05:31:12.616）退出 0。临时 tsconfig 只 include 本组 portable integration，继承现有 tsconfig.test，通过 imports 检查相关源码；没有修改共享配置。

每次只运行一个检查进程，Vitest 一个 worker、cache false、180 秒 deadline、8 MiB 输出上限，日志/JSON 独占。544 个 main/preload/renderer-services/core/db/shared 源文件在四次验证轮前后均未改变；当前清单聚合 SHA-256 `39e01ac295751fdc14a19ca08938c7dd52460d2a3b43b1a1a2533d63b063395e`。复用既有依赖和 pnpm 9.15.0，无安装/build/Git/GUI/网络服务/真实用户 profile 或账号。新增测试文件 978 行，低于默认 1,000 行；完整生命周期超过 50 行的原因仍为在一条测试中关联导出、恢复、两次启动和保全结果。

复现当前三项（退出非零为保留的身份/包字节失败）：

```sh
node /Users/lingxiaotian/Library/pnpm/.tools/pnpm/9.15.0/node_modules/pnpm/bin/pnpm.cjs --filter @prompthub/desktop test:integration tests/integration/release-acceptance-data-recovery-portable.test.ts -t "joins nonempty Provider" --cache false --reporter=default
```

### 近期历史源升级边界

仅只读检查 Cross 所有的历史 fixture README、generator 和 source-runner。三个现存归档均由 exact old CLI/Core runtime 生成并同版本重开，不能相加为当前升级通过；它们不是 Desktop canonical profile。归档保留旧绝对路径，其原生成根已清理，直接换根解压后 init 不能代表原 Skill/Rule/Plugin 引用完整保全。generate.mjs 写入固定跨组归档目录，直接运行会覆盖他人 fixture；本轮未执行、未改源码/归档路径/marker。当前 source-runner 可以作为另批同根重建的来源，但仍需独占的生成/升级 harness 和现行消费者字段对照，不能把当前两项 ZIP 失败与未准备的升级样本合称通过。三个当前版本升级与连续升级仍 **not-run**；不新增迁移、不扩大历史结构组，也不声明 D3 已实施。

本轮同一 ZIP 的 MCP/Agent sessions 仍为空；跨设备秘密/OS keychain、媒体播放、GUI/发行包、真实同步、完整 root harness 和生产验收未运行。D2 两条正确红测保留；D3/D4 产品改造不在本轮范围。

第六轮清理：12 个记录的检查进程全部退出，fixture afterEach 已关闭 DB/JSDOM 并删除所有独占 profile。确认无残留 profile 后，仅删除 /tmp/prompthub-data-joined-mrzt3lto 及其本轮日志、JSON、runner、scoped config 和 node_modules 软链接；未跟随链接删除已有依赖。没有启动服务端口、背景服务或 GUI。两份本组测试/报告保留，未修改 Cross fixture、其他报告或产品源码。最终测试 SHA-256 `204ab243ebdd809555c3ee79edc6762b3c955ceacf13f9baeac35672d205400c`；两文件 Prettier check 通过。

# Foundation architecture

状态：2026-09-24 按已确认需求修订；实现分批进行，未完成项见 [任务](tasks.md)。
需求真源为 [foundation spec](specs/foundation/spec.md)。旧的全量 canonical 文件数据库、
可重建业务库及两种 authority 运行模式不再是目标；历史实现证据保留在 Git 和
[盘点](storage-inventory.md)，不能用于继续添加兼容路径。

## `DES-FOUNDATION-001`: 模块与运行时所有权

Desktop IPC 和本地 CLI 调用 Core 的同一个当前业务合同；packages/db 管理 SQL、
事务及数据库迁移，Core 管理业务编排、文件包和统一启动升级，shared 管理公共类型。
Renderer 只保留内存视图，经当前 bridge 访问业务数据；Web bridge 实现相同合同。
接口缺失、数据升级失败必须报告错误，不能改用 IndexedDB、旧端点或另一份数据。
沿用既有数据库连接和维护锁；本次不以新增 broker、通用 repository 框架或进程协议
作为迁移前置条件。数据库与文件读写入口必须在升级成功后才开放。

## `DES-FOUNDATION-002`: 唯一提交点与恢复协议

纯结构化操作只提交 SQLite 事务。Prompt 当前正文、版本、关联、FTS 在同一事务
完成，不再额外发布逐记录 JSON，再把 SQL 当作可丢投影。失败回滚事务并报告错误。

实际包/媒体文件变更才使用既有文件 staging/publication：验证新文件，保留恢复源，
发布文件及数据库引用，并在重启时完成或回滚未完成操作。只有文件和引用一致时才能
向调用方报告成功。保留现有必要恢复设施，不为普通记录变更新增日志/receipt 框架。
备份和删除必须按相同所有权工作，不能把业务库删除后从不完整文件重新生成。

## `DES-FOUNDATION-003`: 数据与数据库设计

### 整体数据模型简化评估

| 数据 | 唯一持久位置 | 迁移处理 |
| --- | --- | --- |
| Prompt、Folder、关系、输出格式、备注、收藏、正文及版本 | 现有 SQLite 领域表 | 将历史 canonical 图中的独有数据转换进 SQL；保留稳定 ID 与关系 |
| Skill、Plugin 的元数据、来源、安装记录、版本索引 | SQLite 领域表 | 历史目录/JSON 只在升级或导入解析；完整包及历史文件保留 |
| Skill、Plugin 实际包与媒体附件 | 文件系统，SQLite 保存引用 | 沿用安全路径与完整目录操作；不产生第二份长期可写包 |
| Rule、MCP、Agent Provider 配置与历史 | SQLite 当前结构 | 转换历史配置、版本和秘密引用；部署到外部工具的文件是明确输出 |
| 应用设置、模型设置、设备设置、来源和会话批注 | SQLite 设置/领域表 | 移入历史配置文件及 renderer 持久化内容；秘密继续使用现有加密 |
| Generation 任务、结果引用、状态 | SQLite 现有表 | 历史 manifest 转换为记录；二进制成品保留在文件系统 |
| 搜索与扫描缓存 | 可重建派生索引 | 不把用户批注、设置、版本混入可丢缓存 |

已有实体、ID、表及字段优先保留；只为真实缺口添加迁移。MCP/Plugin 若缺业务表，
由 db 包定义当前记录及版本约束，不能借 canonical_resources 延续文件权威。
同 ID 不同内容不能按非空、时间较新或来源优先静默覆盖：报告冲突并保留两份源，
未解决前不登记该迁移成功。未知字段保留在迁移恢复源，未经映射核对不得删除。

包内 SKILL.md 是对外文件格式。导入时解析成当前记录；编辑时由同一个命令更新必要
包内容与记录。普通列表和读取不重新导入旧文件；外部编辑通过明确的扫描/导入操作。

## `DES-FOUNDATION-004`: 启动与 UI 状态

启动顺序：绑定根 → 恢复未完成写入 → 识别源版本 → 按序迁移 → 验证 → 标记完成
→ 开放当前业务读写。Renderer 历史 IDB/LocalStorage 读取是升级阶段的一部分，
主进程确认导入事务和内容核对后才完成；不能只比较条目 ID 或相信旧浏览器标记。

迁移异常向上传播，启动显示错误/重试入口；禁止定时自动进入主界面、返回空集合、
改用旧后端或在失败后自动同步。没有历史数据的新安装也走同一当前初始化流程。
业务查询不迁移、不删旧源、不按历史版本选实现。已有 UI 缓存的一致性修复继续保留。

## `DES-FOUNDATION-005`: 备份、同步和外部分发

**备份协议。** 用现有对象库/快照格式扩展出不可变 generation；按内容 hash 上传缺失
对象，验证后写不可变 manifest，最后条件更新远端 HEAD。语义 hash 排除 exportedAt、
传输统计和密文随机 nonce。时间仅用于显示和 retention；加密模式将明文语义索引放在
加密元数据中，对外校验独立密文 digest，不泄露不必要的内容相等关系。

一次快照绑定本地 commitSequence：在 owner 临界区固定清单和对象引用/创建一致镜像，
pin 所需内容后释放锁，网络上传在锁外进行；GC 不得回收被快照、恢复、版本或同步 pin
引用的对象。成功发布新 HEAD 后才按有界策略清理旧 generation，至少保留最后一份
已验证快照和正在使用的基线；不得无限累积未提交上传。

Amazon S3 支持基于 ETag 的 If-Match 条件写入；初始化用 If-None-Match。ETag 仅作
并发令牌，不当作 SHA-256。S3 兼容服务与 WebDAV 必须验证真实服务端条件写行为，
不能凭产品名或 OPTIONS 响应宣称安全。[S3 条件写入](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html)
[WebDAV ETag 与条件请求](https://www.rfc-editor.org/rfc/rfc4918.html#section-8.6)

HEAD 超时后先查询 command/generation 是否已经发布；不能创建新身份盲重试。
冲突重读再计算；网络请求有超时和有限退避。建议控制面 15 秒、最多 2 次重试，
大对象使用有界流式/分片和单独总时限；业务非幂等动作不自动重放。

**多设备同步协议。** 初始实现采用资源级三方比较：base、local、remote。
不同资源的独立变化可合并；同一资源双方都变化、删除与修改并发、关系闭包不合法时
进入 Conflict。Skill 以完整包为单元，不自动拼接两台设备脚本文件。冲突保留双方内容，
一次同步写集在冲突解决前不半提交；本地继续编辑，远端基线保持可追溯。
解决后形成新的显式 revision，再经 HEAD 条件提交。无需先引入通用 CRDT。

删除生成 tombstone，包含稳定资源身份、删除 revision/commit 与设备信息。
tombstone 不能按固定天数直接丢弃：只在全部活跃设备确认相应基线后压缩；离线设备
退出保留窗口后撤销旧增量游标，回归要求 full-resync，并先保护其离线改动。
不能让过期设备把旧资源重新上传为创建。未通过条件写能力验证的目标仅提供不可变
单设备命名空间备份和显式恢复，不提供可能覆盖其他设备的自动双向同步。

**外部 Agent 分发。** 保存资产和部署资产是两个命令。部署前比较 targetObservedHash；
外部用户修改时返回 conflict，保持目标原样。库内保存成功、外部部署失败时明确显示
“已保存，部署失败/待重试”，不回滚用户内容。

## `DES-FOUNDATION-006`: 服务端与多端契约

self-hosted Web、Worker 的在线工作区使用关系表：workspace/tenant、资源、版本、
关系、媒体引用、tombstone、operation receipt、同步 cursor。记录更新在事务里校验
expected revision；同一请求身份返回既有结果。作用域必须出现在复合唯一约束、FK
和查询条件中，不能只由路由过滤。两次不同资源的成功 create 必须均保留。

推荐继续使用 self-hosted SQLite / Worker D1 的已有部署适配，不把换 PostgreSQL
作为这轮正确性修复的前提。D1 所需的原子批次/条件写及冲突处理必须在其真实适配器
上验证，不能把本地任意 transaction callback 生搬过去。未来容量要求才决定后端替换。

旧 snapshot 接口改成显式 import/export/backup 边界；导入前完整 schema 校验，
空集合是否合法由操作类型决定。snapshot 的备份命名空间、retention 与 online CRUD
分离。不能通过 normalize 将缺字段、错误类型或未来版本转为空集合继续覆盖。

Desktop、CLI、Web、Worker 共用纯领域规则和契约 fixture，分别调用本地数据库与文件服务
和服务端事务入口。物理数据根不共用；portable envelope 是跨端交换边界。
Mobile 保留 Expo SQLite 和已声明能力，不声称桌面数据库可直接复制过去；启用同步前
实现同一 revision/tombstone/capability 契约。

## `DES-FOUNDATION-007`: 后台任务与状态机

生图、导入、恢复、分发、同步各有明确任务类型，不塞进一个任意状态字符串。
Core 定义纯 transition 函数和允许的命令，storage host 执行可持久状态变更。

任务状态：Queued → Running → Succeeded / Failed / Cancelled / Interrupted。
取消请求可先进入 Cancelling，但完成条件需明确。Retry 创建新 attemptId；
结果提交必须同时匹配 jobId、attemptId、expected state。旧请求即使无法物理终止，
返回结果也被 fence，不允许写入新 attempt。UI 卸载不决定后台 job 生命周期。
重启时运行中的本地 attempt 转 Interrupted；Provider 支持稳定请求 ID 时再查询结果，
否则提示显式重试并告知可能重复计费，不能保证远端恰好执行一次。

状态转换写入和结果资产提交需要关联同一个 operationId；若资产已提交但 job 投影
未更新，按 receipt 完成投影，不能再次生成或丢弃已有成品。调度队列和并发有界，
提供 stop/drain，退出时只停止本 host 创建的任务与连接。

## `DES-FOUNDATION-008`: 性能、迁移和验收

设 N 为库存、K 为本次受影响资源、B 为本次变动文件字节。普通命令目标为
O(K + B + affected relations)，索引查找 O(log N)；受外键/图依赖影响的批次按真实
闭包计费，不承诺所有操作严格 O(1)。完整重建 O(N + total bytes)，流式/分页、有界内存。
全局清单不每次复制全库资源：按领域/资源维护局部 hash 与 checkpoint，完整验图留给
迁移、重建和显式校验。先用简单索引和受影响集合，数据证明需要后再采用树状索引。

建议验收基线：本地 SSD、1000/10000 条各 1 KiB 正文、无媒体 metadata mutation，
P95 <= 150 ms；1 MiB 以内正文提交 P95 <= 300 ms；main/UI 无持续超过 50 ms 的
同步 I/O 段。以上是候选产品预算，必须在记录的机器/版本上采样验证，不是当前成绩。
500 条 usage 更新不能再读取约 6000 个文件。大型包以进度、取消和吞吐验收，不套用
小文本时延。批量修改一次计算写集并提交，避免 K 次整库扫描。

### Client 0.6.0 migration inventory

2026-09-15 源码盘点；目标与验收以
[0.6.0 基线需求](specs/foundation/spec.md#client-migration-baseline-060) 为准。
本轮只整理规范，没有执行用户数据迁移，以下源码差异不等于升级通过。

**发布边界。** `gh release list --limit 100 --json tagName,isPrerelease,isDraft,publishedAt`
核对到最新正式版为 `v0.5.9`，已发布预览为 `v0.6.0-beta.1`
（`494d57d7da65`）和 `v0.6.0-beta.2`（`b7854508c3c6`），无正式 `v0.6.0`
release。工作区包版本仍为 `0.6.0-beta.2`，包含未提交改动；它不是已经冻结的
0.6.0 数据快照。最终发布 commit、迁移制品 checksum 和完整格式清单待冻结。

**历史结构入口。** 遍历本地 `v0.*` tags，对每个 tag 的 schema 源文件逐字节
分组，得到 19 种源码内容。下表用于选择调查样本，不代表 19 个不同数据库结构，
也不代表同组升级路径等价；注释、导出方式、初始化逻辑、数据修复和外部文件可能不同。
早期路径为 `src/main/database/schema.ts`，从 `v0.5.2` 起为
`packages/db/src/schema.ts`。标签仅是源码证据；rebuild/beta 是否实际分发需与 release
记录分别对应，不能因当前 release 列表缺失就认定没有老用户。

| 本地 tag 源码组（v 前缀省略） | 相邻样本的主要变化/检查重点 |
| --- | --- |
| 0.1.4–0.2.0（实际存在的 tags） | Prompt、Folder、Prompt 版本、settings 基础结构 |
| 0.2.1–0.2.8 | Prompt images；Folder is_private、updated_at |
| 0.2.9–0.3.4 | Prompt is_pinned |
| 0.3.5 | Prompt source |
| 0.3.6–0.3.9 | Prompt notes |
| 0.4.0 | skills 表 |
| 0.4.1 | 建表与索引拆开执行；源码变化不等于列变化 |
| 0.4.2 | skill_versions、Prompt prompt_type、Skill current_version |
| 0.4.3–0.4.9 | Skill version_tracking_enabled |
| 0.5.0–0.5.1 | Skill 名称唯一索引；历史去重行为需单独复核 |
| 0.5.2、其 rebuild.1–3、0.5.3、其 rebuild.1–6 | shared DB；users/refresh_tokens/user_settings；归属、英文正文、视频、AI 响应字段 |
| 0.5.4 | Prompt current_version 默认值从 1 改为 0 |
| 0.5.5、其 beta.1–3 | Skill 安装版本、内容 hash、安装/更新时刻 |
| 0.5.6、其 beta.1–2、0.5.7-beta.1–2 | rules/rule_versions |
| 0.5.7、0.5.8、其 beta.1–3 | Skill 来源、目录、包指纹、安全报告等字段 |
| 0.5.9-beta.1–2 | Prompt parent_id、sort_order、prompt_relations |
| 0.5.9 | prompt_output_format_items；Skill 指纹算法、来源绑定状态 |
| 0.6.0-beta.1 | canonical_resources、Agent 会话/供应商、生成记录；Skill logical_name/variant_key；数据库版本 3 |
| 0.6.0-beta.2 | 移除供应商 active_name 唯一索引；数据库版本仍为 3 |

复查入口：`git show <tag>:<schema-path>`；升级执行逻辑须同时检查对应 tag 的
数据库初始化文件，不能用当前 schema 去构造所有“历史”数据。表中列的是新增/改变的
主要边界，并非完整 DDL 或支持版本承诺。

**已确认的接入差距。** 两个 0.6.0 beta 的 `user_version` 都为 3，顶层 1–3
manifest 的 checksum 相同，但 beta.2 删除了
`idx_agent_provider_profiles_active_name`，并增加
`allow_duplicate_agent_provider_profile_names_v1` 旧式迁移记录。
现有 `packages/db/src/init.ts` 执行集中迁移后，由
`recordCurrentDatabaseMigration` 一次补齐 manifest 记录；checksum 常量没有与各个
可执行迁移体绑定。因此“版本为 3 且 history 匹配”不足以证明符合 0.6.0 基线。
接入需检查实际列、默认值、索引/唯一约束、外键、FTS/trigger 和必要数据不变量；
已发布 1–3 的含义和记录保留，基线接入追加记录，不能事后改写 checksum。

| 数据面 | 当前入口与接入关注点 |
| --- | --- |
| SQLite | `packages/db/src/init.ts`、`database-migration-state.ts`；复用 intent、client lease、安全点、事务和完整性检查，分离历史接入与后续逐版本执行 |
| 根目录 | `apps/desktop/src/main/services/data-layout-migration.ts`、Core runtime paths；同时识别根目录/统一目录、残留和部分完成标记，不能只检查 marker 存在 |
| Canonical 用户资产 | Core `canonical-metadata-migration.ts`、`canonical-storage-authority.ts` 及各 `*-resource-schema.ts`；核对完整包、版本、关系、媒体和可重建 catalog；authority marker 当前为 1，不能当作所有领域的 schema 版本 |
| 配置与秘密 | Core `renderer-persistence-migration.ts`；独立 v1 marker，配置文件、设备身份和加密秘密；Desktop 可能处于 waiting-renderer-migration，不可提前登记整个 profile 完成 |
| IndexedDB/renderer | `apps/desktop/src/renderer/services/database.ts` 与 renderer persistence；历史快照及完成标记独立，不可用空 renderer 状态覆盖原数据 |
| 共用访问者 | Desktop 启动与 `packages/core/src/database.ts` 的 CLI/Core 入口；基线接入需沿用同一 root owner 和 readiness 边界 |

文件迁移采用既有 stage/journal/publication，SQLite 迁移采用事务；统一流程只协调顺序和
完成状态，不再新增另一套备份、锁或数据所有者。切换前失败保留旧数据；持久提交后按
journal 完成恢复，不能直接回退数据库制造文件/数据库混合状态。升级后有新写入时，
回滚必须保全新提交并在独立根恢复验证，禁止单独换旧客户端覆盖新数据。
盘点与转换目标复杂度 O(entries + bytes)，按资源处理文件；相同代码状态不重复全量扫描。

**测试资产与缺口。** 现有
`apps/desktop/tests/fixtures/historical-databases.ts` 标注 0.4.7、0.4.8、0.5.1、0.5.2
及 commit，但执行的是手写精简 schema 和种子数据，不能证明完整旧版本升级。
`database-historical-fixtures.test.ts` 已断言正文、历史、二次启动及安全点；
`database-migration-locks.test.ts` 覆盖锁、未来版本、checksum 和事务失败；
`data-layout-migration.test.ts`、Core `renderer-persistence-migration.test.ts` 和 Desktop
`canonical-storage-startup.test.ts` 提供独立边界用例。这些资产可复用，本轮未重跑。

待补：按上述源码组锁定真实生成来源与结构指纹，分别生成历史全新安装/连续升级样本；
优先覆盖 0.5.9、两个 0.6.0 beta，再覆盖早期结构差异及部分迁移状态。使用临时 profile
执行真实入口，先验证升级后正常读写、包文件完整、关闭重开，再测异常及中断。
需覆盖双 beta 同版本不同索引、Skill 现有 schemaVersion 1/2 内容差异、配置/IDB 未完成、
canonical 已存在而 DB 缺失等状态，不能用统一最新 schema + 旧版本标签替代历史输入。
最终基线清单及支持源的证据闭合前，不宣称全历史升级可用。

### 分批实施和回滚

1. **文档。** 原位统一数据归属、唯一业务合同、版本升级和失败处理；不宣称代码已完成。
2. **Renderer 与启动。** 删除正常 CRUD/备份恢复的 IndexedDB 后端，历史读取独立到
   migration 模块；补齐 Web 当前 bridge；失败阻断业务和自动同步。实际 SQL 功能测试
   覆盖新建、编辑、版本、关系、重开，再覆盖缺接口、旧数据、冲突及事务失败。
3. **Core 与数据。** 按领域完成历史文件/配置/路径到当前 SQL+文件的转换，并在同批
   删除 localAuthority 分支、查询时迁移、文件元数据镜像及 catalog 自动重建。
   MCP/Plugin 先处理独有条目与完整版本保全，不以保留旧业务模式作为过渡。
4. **集成。** 统一 Desktop/CLI 启动及导入/恢复入口；按历史来源、跳版本、重复启动、
   中断、恢复及真实功能路径验收。检查本次范围所有旧字段/路径/后端分支均仅在迁移中。

每批包含源码、回归测试、必要文档并统一验证；迁移和对应旧实现删除不得拆成两次
发布。提交仅包含已核对的当前批次；前置未交付批次意味着整个 0.6.0 基线仍未完成。
保留已发布历史迁移 ID/checksum，新增迁移按顺序执行并在成功事务中登记；版本没有
数据变化时无需空脚本。修复已发布转换错误追加迁移，不改历史文件。

升级前复用现有安全点；失败保留源与错误，禁止开放旧业务模式。回滚须同时恢复 SQLite
和引用文件到匹配的安全点；有升级后新写入时先保全新数据，不得仅替换旧二进制/DB。
不支持的新版本数据拒绝修改。普通操作成本取决于受影响记录和文件，迁移 O(entries +
bytes)，不在每次读取重新扫描全库；大文件按资源处理，不引入额外调度平台。

**追溯**



### Catalog startup integration batch (2026-09-08, superseded design)

以下仅记录旧方案验证证据，不能作为现行目标。SQL 业务库的自动重建需随迁移退役。

`FR-FOUNDATION-003/004 -> DES-FOUNDATION-003/004 ->
TEST-FOUNDATION-003/004 -> T-FOUNDATION-003/004`:

- Move Desktop's existing catalog reconciliation into Core and retain a Desktop
  compatibility wrapper. Core/CLI invokes it before opening its first writable
  handle when canonical authority is active; repeated initialization of an open
  handle keeps the existing validation/invalidation behavior.
- Validate the bound `data/prompthub.db` path, maintenance/client exclusion and
  supported database schema before staging. Recover journals before reading the
  canonical graph. Reuse the existing shadow builder and journaled replacement,
  including its preserved-table registry; no new data format or authority.
- Missing catalogs rebuild from validated files. Existing unreadable catalogs
  fail closed in headless startup, because their operational/config/server rows
  cannot be proven preserved. Desktop retains its existing explicit automatic
  recovery policy. Unsupported schemas and preservation failures reject in both.
- Tests cover real SQLite/temporary files, Prompt history/favorites/relationships,
  preserved settings/session annotations/server rows, missing/stale/current
  catalogs, invalid bundles, symlinks, incompatible schemas, busy clients,
  publication failure/rollback, reinitialization and cleanup. No live profile.
- This reuses full-catalog staging: O(N log N + bytes) hashing/sorting, O(N + bytes)
  staging space and existing in-memory snapshots. It is a startup integration,
  not acceptance of the incremental-query or 1k/10k interaction budgets.
  `performance/canonical-catalog-startup.perf.ts` measures current/rebuilt startup
  on 1,000 one-KiB Prompts under the existing storage-scale resource ceilings;
  the 10k dataset and interaction P95 remain release work.
- Analyze: the accepted file authority and existing Desktop recovery boundary
  are retained. Root ownership/IPC, durable receipts and native-platform gates
  remain separate unfinished work; PID maintenance is not an OS owner lock.

| Requirement       | Design             | Verification        | Task             |
| ----------------- | ------------------ | ------------------- | ---------------- |
| FR-FOUNDATION-001 | DES-FOUNDATION-001 | TEST-FOUNDATION-001 | T-FOUNDATION-001 |
| FR-FOUNDATION-002 | DES-FOUNDATION-002 | TEST-FOUNDATION-002 | T-FOUNDATION-002 |
| FR-FOUNDATION-003 | DES-FOUNDATION-003 | TEST-FOUNDATION-003 | T-FOUNDATION-003 |
| FR-FOUNDATION-004 | DES-FOUNDATION-004 | TEST-FOUNDATION-004 | T-FOUNDATION-004 |
| FR-FOUNDATION-005 | DES-FOUNDATION-005 | TEST-FOUNDATION-005 | T-FOUNDATION-005 |
| FR-FOUNDATION-006 | DES-FOUNDATION-006 | TEST-FOUNDATION-006 | T-FOUNDATION-006 |
| FR-FOUNDATION-007 | DES-FOUNDATION-007 | TEST-FOUNDATION-007 | T-FOUNDATION-007 |
| FR-FOUNDATION-008 | DES-FOUNDATION-008 | TEST-FOUNDATION-008 | T-FOUNDATION-008 |

# PromptHub 基础架构、数据一致性与状态机审查

审查日期：2026-09-05。记录：`ISS-20260905-001`。状态：open / 审查完成，整改未实施。

**结论：基础层存在可复现的一致性缺陷。** 最主要的问题是业务操作的成功、失败、回滚、发布和清理没有使用一致的事务边界；多端实现和同步协议又放大了这些差异。当前证据支持安排一次围绕数据完整性的整改，但不足以把历史上所有数据丢失都归因于同一个根因，也不支持直接更换 SQLite 或全面重写。

本次以 HEAD `18c08482690ece022c3dd39567fde60b0d0813ed` 加当前未提交文件为基线。工作区同时有版本一致性、Skill 导入、标签筛选、同步可观测性及 spec-init 调整。审查没有修改这些文件，没有访问真实用户数据库、云端账户、GUI 或生产服务，也没有提交代码。测试源文件指纹见 `source-manifest.json`。

**审查覆盖与实际所有权**

| 范围                                       | 当前实际边界                                                                | 本次检查深度                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Desktop / CLI                              | Core 的 canonical 文件协调器，SQLite 目录；Desktop 另有启动、自愈、恢复编排 | 沿入口、协调器、数据库、文件发布检查，真实 SQLite/文件故障注入 |
| packages/db                                | WASM adapter、共享 schema、迁移 history/intent、安全点、DB 类               | 结构与事务检查，22 条既有迁移/锁回归，新增初始版本失败探针     |
| Prompt / Folder / Relation / Output format | 共用 Prompt graph coordinator；目录整体发布                                 | 事务组合、资源图重读、单次 mutation I/O 测量                   |
| Skill                                      | DB mutation → bundle publication → 可写 workspace hydration                 | 发布后失败探针，既有 canonical Skill 回归                      |
| Rule / MCP / Plugin / Agent                | 各有服务/协调器，多处共用 entry publication                                 | 静态检查共同基础设施与恢复调用；未逐个实测全部外部安装目标     |
| WebDAV / S3                                | Renderer 编排整包 last-writer-wins 同步，固定 data/manifest/media 路径      | 生产编排代码配有状态远端适配器，验证上传中断、删除、增量判断   |
| self-hosted Web                            | 数据库主导的服务与文件投影；另有不可变桌面备份 API                          | 入口和服务链路静态检查，确认使用共享基础 DB 类                 |
| Cloudflare Worker                          | 每用户一条 JSON snapshot；Web CRUD 读改写该 snapshot                        | 真实 handler + 确定性 D1 行存储 fixture，并发交错、非法输入    |
| Mobile                                     | 独立 Expo SQLite schema；同步尚未实现                                       | 静态检查初始化、版本拒绝与稳定边界，未运行移动设备             |
| Renderer 状态                              | Zustand summaries、详情缓存和异步 actions                                   | 外部更新后的列表/详情一致性探针                                |
| 生图状态                                   | Renderer runner + main 的逐 batch mutation queue/slot guard                 | 静态检查 pending/running/终态/重试；未调用真实 Provider        |
| 测试及交付                                 | 根 harness 按 surface/profile 分层；许多故障组合不在既有断言内              | 检查配置与 CI 入口，执行 58 条既有测试及 11 个专项探针         |

这是跨产品边界的重点审查，不是全仓每行代码、完整安全渗透、所有平台和所有历史版本的验收。

**已证实的问题，按修复优先级排列**

P1 表示应优先处理的数据完整性问题；P2 表示状态、性能或测试门禁问题。没有将仅在特定故障条件触发的问题标为“必然发生”，也没有把它们标成无条件 P0。

| 发现                                          | 级别 | 触发与实际结果                                                                                    | 证据                    |
| --------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------- | ----------------------- |
| F01 发布清理失败破坏整体原子性                | P1   | 两个文件均已发布，删除第二个 prior 时出错；catch 回滚只恢复还有 prior 的文件，结果为 `[new, old]` | A01，真实文件系统       |
| F02 Skill 发布后失败只回滚 DB                 | P1   | 新 bundle 已发布，workspace rename 失败；调用报错后 DB 内容是 `old`，canonical 内容仍是 `new`     | A11，真实 SQLite 与文件 |
| F03 远端备份覆盖旧 payload 后才发布 manifest  | P1   | data 上传成功、manifest 上传失败；此前可读的备份变成 `Incremental data hash mismatch`             | A04，生产上传/下载逻辑  |
| F04 Cloudflare 并发更新丢失                   | P1   | 同一用户两次 create 都读取旧 snapshot，均返回 201；最后只剩 `second` 一条                         | A08，确定性交错 fixture |
| F05 Cloudflare 畸形 payload 可变成清空操作    | P1   | `prompts` 不是数组时被默认成 `[]`，未来 version 字符串也不拒绝；PUT 路径将其覆盖保存              | A09 + PUT/save 调用链   |
| F06 初始 Prompt 与版本不是一个基础事务        | P1   | 初始版本 INSERT 被 SQLite trigger 拒绝后，Prompt 行仍存在、`currentVersion=0`                     | A10，真实 SQLite        |
| F07 删除没有可比较的 mutation revision        | P1   | 本地删除后为空，剩余记录的最大时间为 epoch 0；旧远端包被判断为更新并交给 restore                  | A07，方向选择复现       |
| F08 canonical mutation 不服从外层事务回滚     | P1   | 外层 transaction 中 create 成功，后续步骤抛错；DB 是 0 条，文件图仍有 1 条                        | A02，事务组合复现       |
| F09 列表刷新不使详情缓存失效                  | P2   | 外部更新后 summary 已是 `new`，再次读取 detail 仍返回 `old content`                               | A06，Zustand 探针       |
| F10 增量 data hash 包含导出时间               | P2   | 业务内容完全相同，只推进一分钟，data payload 和 hash 就变化，再次上传                             | A05，受控时钟           |
| F11 单条 mutation 处理整个 Prompt 图          | P2   | 500 条 Prompt 中只加一次 usageCount，仍有 6002 次 readFileSync，耗时约 1.04 秒                    | A03，实际 I/O 测量      |
| F12 声明的覆盖率门禁没有在默认 harness 中计算 | P2   | 规则要求变更分支/条件 100%，检查注册表调用普通 vitest run，未配置对应 coverage 收集/阈值          | 配置静态检查            |

**F01：发布状态缺少“已经提交、只待清理”的区分。**

`CanonicalEntryPublicationJournal` 只有 `prepared` 一种持久状态。发布完成后依次删除 prior，任一清理异常仍进入 rollback；但已删除 prior 的条目无法恢复。该 helper 被 Prompt、Skill、Rule、MCP、Plugin 和 Agent 的多个 canonical 路径复用，修复收益远大于继续逐领域补偿。A01 没有模拟整机断电；它复现的是真实文件操作异常。断电发生在同一清理窗口时的恢复策略仍需另做子进程/重启验证。

[发布与清理分支](/Users/lingxiaotian/Programs/personal/PromptHub/packages/core/src/canonical-entry-publication.ts:342)

**F02：缓存物化失败被当成领域事务失败，但领域文件已经提交。**

`CanonicalSkillDB.publish()` 先发布 bundle，再 hydrate workspace。`mutate()` 捕获 hydration 失败后，`restore()` 恢复 DB 行，却从新 canonical 再次 hydrate。这形成“失败返回 + 旧目录行 + 新权威内容”。重建目录可能使新内容重新出现；反过来用旧 DB 再发布也可能覆盖新内容。当前未提交的 `.prompthub` 过滤修复不解释这个跨阶段问题。

[Skill 发布和回滚](/Users/lingxiaotian/Programs/personal/PromptHub/packages/core/src/canonical-skill-db.ts:43)

**F03、F07、F10：备份文件集的发布与数据同步的因果关系均不完整。**

hash 校验能检测损坏，却不能保留被覆盖的旧 payload。固定 `data.json` 原地写入后，即使保留旧 manifest，旧备份也已不可读取。对多个设备同时上传，同样缺少条件提交机制；本次没有连接真实 WebDAV/S3 验证服务端 ETag/版本特性。

本地 freshness 使用剩余记录的最大更新时间，远端使用导出/manifest 时间，两者含义不同。删除不留下新的可比较值。A07 只证明旧包被送往恢复入口，未执行真实用户数据恢复；启用 save-sync 可能在定时同步前抢先上传删除结果，因此触发还取决于顺序、网络和设置，不能声称每次删除都会复活。

整包 last-writer-wins 已是稳定文档声明的限制，本次不把它误报为与既有设计相悖的新 bug；但它与缺少删除 revision、时钟不一致组合后，不足以可靠支持当前“在线同步”体验。是否继续支持自动双向整包覆盖，属于需要明确接受的数据决策。

[增量上传的 data 发布](/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/src/renderer/services/sync-backup-core.ts:857)

[manifest 最终写入](/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/src/renderer/services/sync-backup-core.ts:948)

[时间戳方向选择](/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/src/renderer/services/sync-backup-core.ts:1202)

**F04、F05：Worker 把整包备份表示复用为在线数据库。**

`loadSnapshot → 修改数组 → saveSnapshot` 没有读写事务、revision 条件或冲突检测。最后一次 UPSERT 可以丢掉另一次已经向客户端确认的修改。单条 SQL 的原子性不等于整个读改写操作的原子性。

`normalizeSnapshot` 适合作为谨慎的旧数据兼容读取辅助，不应在破坏性 PUT 入口将错误输入改写为空集合。这里既没有严格 envelope schema/version gate，也没有拒绝危险空替换的完整业务验证。A09 直接执行 normalizer；PUT 的覆盖后果来自已确认的调用链，并未实际写入生产 D1。

[Worker 创建入口](/Users/lingxiaotian/Programs/personal/PromptHub/apps/web-cloudflare/src/web-data.ts:218)

[整包 UPSERT](/Users/lingxiaotian/Programs/personal/PromptHub/apps/web-cloudflare/src/sync.ts:93)

[输入默认化](/Users/lingxiaotian/Programs/personal/PromptHub/apps/web-cloudflare/src/sync.ts:31)

**F06、F08：基础 DB API 和 canonical API 的事务语义不一致。**

基础 `PromptDB.create()` 先插 Prompt 再调用 `createVersion()`。只有后者自己的事务无法撤销前一条已提交 INSERT。Desktop 的 canonical 外层事务保护了普通 create 路径；self-hosted Web 实际直接实例化基础 PromptDB，所以不能把 Desktop 测试通过等同于共享创建契约已安全。

schema 有外键和 `(prompt_id, version)` 唯一约束，但不保证每条 Prompt 一定有当前版本。`current_version=0` 允许作为中间状态；问题在于这个中间状态可以持久化为失败后的最终状态。应首先关闭不完整写入窗口，再评估正版本约束及迁移，而不是只反复在启动时补版本。

A02 证明 canonical coordinator 不能安全组合在调用者事务内：内部发布在外层提交前结束、journal 已被清除。该探针是 API 可组合性缺陷，不是普通 Desktop create 必然失败的证据；还需在整改时清点所有事务调用者，禁止未约定的嵌套写法或纳入统一提交协调。

[基础创建操作](/Users/lingxiaotian/Programs/personal/PromptHub/packages/db/src/prompt.ts:64)

[Web 使用基础 DB 类](/Users/lingxiaotian/Programs/personal/PromptHub/apps/web/src/services/prompt.service.ts:104)

[canonical 协调器事务](/Users/lingxiaotian/Programs/personal/PromptHub/packages/core/src/canonical-prompt-graph-db.ts:322)

**F09：可见状态缺少同一 revision 下的一致读取。**

`fetchPrompts()` 更新 summary、relations、output format，但保留 detail cache；`getPromptDetail()` 命中缓存立即返回。外部 CLI 更新、恢复或重新聚焦后的列表刷新可以只更新一半界面。相同方法还没有请求序号或 generation 检查，过期异步响应也值得补测；该竞态未在本次当作已复现事实。

[列表刷新与详情读取](/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/src/renderer/stores/prompt.store.ts:150)

**F11：文件真相源不要求每次操作都重建整棵资源图。**

本次使用每条约 1 KiB 正文、一个版本、无媒体的 fixture；先整体建图，再仅增加第一条 Prompt 的 usageCount。统计只包括 `readFileSync` / `writeFileSync` 调用，不包括 copy、stat、rename、fsync，因此不是完整 I/O 总数。

| Prompt 数量 | 单次 mutation | readFileSync | writeFileSync |
| ----------- | ------------: | -----------: | ------------: |
| 10          |         72 ms |          122 |             5 |
| 100         |        246 ms |         1202 |             5 |
| 500         |       1037 ms |         6002 |             5 |

时延是当前共享机器的一次审计测量，不是跨平台基准。调用数及代码结构说明单条改动与全库资源规模相关：读取 DB 全图、重复验证文件、为多个根目录 stage 并发布。批量逐条调用会趋向 O(K×N)，库存随 K 增长时可形成平方级累计工作；大量历史和媒体会进一步增加字节成本。同步文件 I/O 又占用 Electron main 线程并延长 DB 事务。

既有性能测试允许 1000 条资源的一次更新耗时 10 秒，它可以通过，同时仍不符合交互动作的延迟预期。优化应先明确交互预算，再处理受影响的 bundle/关系和批次，保留完整校验作为启动/恢复/显式检查。

[整图发布入口](/Users/lingxiaotian/Programs/personal/PromptHub/packages/core/src/canonical-prompt-graph-db.ts:228)

[既有性能门槛](/Users/lingxiaotian/Programs/personal/PromptHub/packages/core/performance/canonical-storage-scale.perf.ts:22)

**F12：测试绿灯没有覆盖关键组合。**

本次既有 6 个测试文件的 58 条测试全部通过；专项探针同时确认上述缺陷。现有 canonical entry 测试覆盖 prepare/verify 失败，却不覆盖“部分 prior 已清理后失败”；Skill 测试未覆盖“bundle 成功、hydration 失败”；同步测试未证明失败上传之后旧备份仍可读取。这是用例语义缺口，不能靠增加 happy-path 个数解决。

默认 harness 的普通 vitest 命令没有收集与执行规则要求的变更分支/条件覆盖门禁。存在手动 coverage 命令并不代表 CI 已执行；本次也没有审查 GitHub branch protection，所以不推断远端设置。V8 branch coverage 本身也不能等同于全部业务条件组合证明。

[检查命令注册表](/Users/lingxiaotian/Programs/personal/PromptHub/scripts/verification/checks.mts:95)

[Desktop Vitest 配置](/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/vitest.config.ts:5)

**需要继续验证的风险，不计入已复现缺陷**

- Entry publication 的活跃保护是进程内 Set，恢复日志没有 writer PID/lease。其他进程读取同域时是否可能回滚仍在运行的 publication，需要真实双进程暂停/恢复试验；SQLite 的锁不能自动证明独立文件读取器安全。
- Desktop 的 `recovery-required` 主要驱动恢复检测和跳过 Prompt bootstrap；没有看到统一传播到所有 mutation 入口的 read-only capability。无效文件图下应检查哪些领域仍可写，而不能仅从 UI 能打开推断存储健康。
- Web `BackupService.import()` 在 DB 事务中做部分文件写入，提交后再更新 Prompt/Skill workspace 和 Agent 资产；应补每个阶段失败后的 DB/文件整体断言。此处是静态发现的事务覆盖缺口，本次没有执行完整 Web restore drill。
- 生图 main 已有逐 batch 串行 mutation、pending/running guard 和取消终态保护；不能仅因 runner 在 renderer 就判定架构错误。但长任务缺少持久执行 attempt 标识、恢复后的迟到结果和 renderer 退出的组合需要验证，本次不声称发生串单。
- Mobile 独立 schema 与尚未实现同步是已声明边界，不应强行与 Desktop 物理数据库统一。初始化失败后的已打开 Expo handle 回收仍值得补测。

**已有基础值得保留**

项目已有包依赖方向、资源 schema、对象 hash、显式外键、迁移 intent、历史 checksum、安全点和目录重建能力。迁移/锁的 22 条相关回归本次通过，包括历史 schema、损坏索引、tampered history 等场景。对 apps/packages 的 src/tests 中已跟踪 .ts/.tsx/.js/.mjs 文件进行规模检查，未发现超过 2000 行的文件；该统计不含 scripts 或生成资源。

因此问题不是完全没有架构，而是保护措施未形成端到端一致的提交协议。部分旧描述也仍在制造误导：AGENTS 的 Skill metadata DB authority 约定与较新的本地 canonical ownership 规则冲突；Web workspace 注释声称与桌面布局一致，但当前 Desktop 已是另一种 canonical 布局。整改需同步这些边界记录，不能让下一轮实现自行猜测。

**建议的整改顺序与验收条件**

1. **统一领域提交和恢复协议。** 先修 F01/F02/F06/F08。明确定义唯一 durable commit point；提交前失败恢复旧 authority，提交后清理/投影失败记录为待修复状态，禁止再次破坏已提交 authority。区分 prepared、published/committed、cleanup-pending，并制定跨进程所有权规则。禁止任意直接 DB 写或外层事务绕过协调器。验收必须包含每个提交边界的失败、真实子进程中断、重启，以及 DB 重建前后等价。
2. **保证远端快照可恢复，再调整在线同步。** 使用不可变 generation/object 路径，最后条件更新 manifest 指针；上传失败保留前一个可读 generation。增加持久 mutation revision 和删除表达，使用已知基线识别冲突。保留整包 LWW 或改成显式冲突，需要产品/数据决策；不要在未迁移协议的情况下自动启用新行为。
3. **关闭 Worker 的丢写与非法覆盖入口。** 立即增加严格输入校验和条件写入/冲突返回。长期在线数据采用记录级持久化，备份 snapshot 维持独立命名空间与生命周期。D1 是否承载两者不是核心，关键是事务和 authority 分离。
4. **收敛 Renderer 读模型。** summary/detail/selection/action 共享资源 revision；刷新时按 revision 失效，过期请求不得覆盖新状态。领域写入返回 revision/结果，UI 不负责补齐持久不变量。
5. **把测试门禁对齐真实风险。** 将本次失败探针转入各自正式回归层；增加跨 Desktop/CLI/Web 共享命令契约测试、故障注入矩阵、双进程与两次启动升级 fixture、旧/当前/未来 schema 测试及恢复演练。对变更分支收集覆盖率，对条件组合单独维护行为矩阵；按日常交互预算衡量性能。

这是一组整改建议，并未改变源数据的 authority、备份兼容协议或迁移策略。涉及设计冲突的方案应在独立 active change 中先确认；不建议直接大范围重构后再补测试。首先把最小反例固化为验收条件，再修共用基础设施。

**验证记录与边界**

- 专项 11 个探针均已执行：10 个完整性/效率预期未满足，1 个性能采样探针通过并记录了规模问题。失败是审查证据，不是产品测试全绿。
- 第一次 renderer 探针受 Node localStorage 环境影响而未执行到目标逻辑；补充与现有 Desktop 测试同类的内存存储 setup 后，仅重跑 renderer 四项，全部到达目标断言并复现问题。没有将环境失败计为产品缺陷，也没有重复运行性能采样。
- Core 既有 canonical-entry-publication、canonical-prompt-graph-db、canonical-skill-db：12/12 通过。
- Desktop 既有 sync-backup-core、prompt-save-sync、database-migration-locks：46/46 通过。
- 未执行全仓测试、完整 typecheck/lint/生产构建、GUI/Electron 两次升级启动、Win7/Windows、真实 NAS/WebDAV/S3/D1、磁盘断电、生产恢复和真实 Provider 测试。本次没有生产源码修改，亦不构成发布准入。
- 所有本次启动的测试会话已退出；临时 SQLite/文件 fixture 由 teardown 关闭并删除。保留此目录中的小型报告、指纹和复现源码供后续整改；未保留服务器、端口或后台任务。

复现命令及探针映射见同目录 README。历史数据丢失仍需结合对应安装版本、操作顺序、startup/sync 日志和只读数据副本做事件级归因。

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

文件与 SQL 联合提交的中断修正（2026-10-15）：现有日志先调用 SQL commit、再写
文件 committed 标记，二者之间退出会使重启错误回滚已提交记录引用的文件。
此边界复用现有 publication journal，增加 SQLite schema v5 的
`storage_publication_receipts(operation_key, operation_id, committed_at)`：每个操作键
只保留最近一次提交凭据，与业务修改在同一 SQL 事务内写入；不记录业务副本。
文件日志 v3 记录同根内数据库路径。恢复先读取相同 operation ID 的 SQL 凭据，
已提交则验证新文件并完成清理，未提交则回滚文件；数据库缺失、损坏或结果无法证明时
保留全部材料并失败。联合提交不得嵌套在尚未提交的外层 SQL 事务中。
普通纯 SQL 操作不使用此表。文件发布前的校验和准备仍线性遍历文件，提交凭据查询为
主键查询，每个操作键占一行，不随保存次数增长。恢复查询只读取已有库，不创建空库。
新旧数据库通过正常 init 顺序迁移，保留所有业务行；回退到旧 schema 的应用前必须
恢复升级前完整数据库与文件 safety point，不能只降 user_version 或删除凭据表。
验收覆盖真实 SQLite/文件、SQL 失败、提交后日志故障、子进程退出和重启恢复；
Rule 权威转换在此基础上继续，不能将该修正视为全部 Foundation 完成。
既有 journal 发布/恢复编排及真实子进程退出测试保留连续步骤（超过 50 行），以便
审查每个提交窗口；提交前后退出、日志失败、旧日志拒绝和文件/SQL 读回覆盖该边界。

## `DES-FOUNDATION-003`: 数据与数据库设计

### 整体数据模型简化评估

| 数据 | 唯一持久位置 | 迁移处理 |
| --- | --- | --- |
| Prompt、Folder、关系、输出格式、备注、收藏、正文及版本 | 现有 SQLite 领域表 | 将历史 canonical 图中的独有数据转换进 SQL；保留稳定 ID 与关系 |
| Skill、Plugin 的元数据、来源、安装记录、版本索引 | SQLite 领域表 | 历史目录/JSON 只在升级或导入解析；完整包及历史文件保留 |
| Skill、Plugin 实际包与媒体附件 | 文件系统，SQLite 保存引用 | 沿用安全路径与完整目录操作；不产生第二份长期可写包 |
| Rule 元数据与版本索引、MCP、Agent Provider 配置与历史 | SQLite 当前结构 | Rule 正文及历史正文保留为实际文件，SQL 保存引用；部署到外部工具的文件是明确输出 |
| 应用设置、模型设置、设备设置、来源和会话批注 | SQLite 设置/领域表 | 移入历史配置文件及 renderer 持久化内容；秘密继续使用现有加密 |
| Generation 任务、结果引用、状态 | SQLite 现有表 | 历史 manifest 转换为记录；二进制成品保留在文件系统 |

### Generation SQLite ownership

Generation 当前任务与输出元数据由 `packages/db` 的 `GenerationDB` 独占。
schema v7 保留批次、槽位和图片索引，去除 `manifest_path`，补充请求快照 JSON、
槽位错误和 revised prompt；请求快照只存未被关系列表达的字段，不保存整份重复
manifest。历史行的空请求快照只允许存在于升级过程中，业务读取必须明确拒绝。
实际图片保留在 `data/generations/assets/<batch-id>/<file-name>`，普通读写不再
生成 batch.json、资源包或缓存副本。列表使用两次集合查询，以 O(batch + slot)
重建返回结构，不扫描图片。重启恢复只处理启动时已有的 running 槽位，列表不改状态。

一次性 `generation-sqlite-v1` 转换先核对历史 SQL 索引、batch.json/资源包及图片
hash，冲突保留源并报错；完整源备份、安全点、图片归位、旧 manifest 退役和 SQL
完成记录使用既有 receipt publication。完成后出现旧源不能复活已删除记录。
新增图片同样与 SQL 用一次 receipt publication 提交，失败撤销新图片。
回滚同时恢复迁移安全点与 recovery 中的历史目录，不能仅降级二进制。

备份继续按既有公开格式从 SQL 和实际图片生成临时资源包，导入在候选目录按包重建完整 SQL 并校验后发布；为既有恢复发布协议保留的
包在重启迁移阶段退役，普通业务读取始终只用 SQL。资源包只作为传输产物。历史共享对象不盲删，避免影响其他领域引用。
验收覆盖旧数据/失败回滚/重开、完整请求/收藏/错误、活动任务列表、图片提交失败、
备份往返及 10,000 个槽位（其中 5,000 个成功输出）的列表资源测量已通过。
详细命令、修正后的分组结果与验收边界见 implementation.md。

恢复设置时，历史 Agent 路径字段由已有 `importAgentSettingsV1` 在候选数据库转换；
后续通用设置导入去掉已消费的历史键，不能再写入第二个所有者。生成记录解码、
历史索引核对与批次构造中的字段映射保留在所属函数内，避免拆散完整记录合同；
正常保存/重开、旧结构升级和恢复回归覆盖这些映射。

会话来源、扫描索引上的批注和独立会话元数据已经由 SQLite 持有，不再迁往
canonical JSON。维护重建将前三张表视为持久 sessions 集合，交接及 Provider
恢复记录继续作为需保全的操作记录。完整扫描用 missing 标记消失日志，不删除
批注；来源作用域身份与 Agent 会话身份分别保留，不能仅凭文本 ID 合并。
`session-sqlite-authority.test.ts` 的连续场景保留较长函数，以直接核对两种身份、
扫描、维护复制和重开的同一批记录；其他异常输入由现有 DB/服务测试负责。

Skill 收敛先移除正常元数据 JSON publication 和可写缓存副本。已有 `skills` 与
`skill_versions` 持有元数据、来源与版本身份；受管完整包固定在
`data/skills/<encoded-id>/files/`。明确绑定的外部目录保留其路径，普通读取不得
从 SQL 正文补造丢失包。内部包编辑先在操作目录准备，再用 SQLite receipt journal
同时发布文件与 SQL；仅修改收藏、标签或扫描结果时不复制包。旧 bundle、设备
绑定和缓存独有字节保存在迁移 recovery，冲突中止，不按时间戳选择胜者。
历史正文/快照退出 SQL blob，以及 Web Skill 镜像退出属于同一目标的后续转换；
在这些步骤完成前不宣布 Skill 的完整 FR-FOUNDATION-003 验收完成。

Web Skill 镜像退役批次：`skills`/`skill_versions` 保持现有结构，正常写入不再
生成 `skill.json` 或版本 JSON。服务器实际包位于 `data/skill-files/<encoded-id>/files/`，
路径只由服务器稳定 ID 派生，客户端 `local_repo_path` 不参与文件访问。单包编辑、删除
与备份导入复用 SQLite 收据 publication；只发布受影响包，元数据编辑不扫描其他包。
旧 `data/skills/` 由 `web-skill-metadata-v1` 一次迁移，验证归属、身份、元数据与历史，
冲突保留原始数据并阻止启动；不把未知用户转换为无主记录。完整旧树和数据库 safety
point 保全后才退役旧树，已有 SQL 中缺少的历史记录纳入同一次提交。回退须同时恢复
升级前数据库与旧树。SQL 正文及历史快照 blob 的后续退出仍独立记录为未完成。
备份 Skill 以稳定 ID 匹配，禁止按名字认领其他记录；整个 Skill 的时间戳选择同时
约束元数据、历史和包文件。已有私有记录只允许其所有者恢复，共享记录只允许管理员。
Web 历史解析与迁移编排保留连续步骤；超过 50 行的迁移函数由未知归属、冲突、
失败保全及重试回归覆盖。
验证涵盖 HTTP CRUD/重开、二进制包、旧树迁移/重试、晚失败回滚、多用户拒绝与旧快照
不覆盖较新包。迁移和备份按记录与包字节线性处理，正常单条写入不遍历全集。
`skill-sqlite-v1` 使用 SQL migration ledger，逐包核对元数据与版本冲突；旧受管
目录原始字节进入独立 recovery 后退出活动位置。外部目录保持原位，失效来源报错。
同一批迁移、SQL 字段绑定和包遍历函数可超过 50 行，以集中展示保全与提交顺序；
其回归核对完整包、恢复副本、SQL 回滚、再次启动和删除不复活。CLI 本地/远程导入只在 operations 暂存，Git checkout 不再留在按名称创建的第二份受管目录；分发已有 Skill 时必须存在实际包。该批验证记录见 implementation。
| 搜索与扫描缓存 | 可重建派生索引 | 不把用户批注、设置、版本混入可丢缓存 |

已有实体、ID、表及字段优先保留；只为真实缺口添加迁移。MCP/Plugin 若缺业务表，
由 db 包定义当前记录及版本约束，不能借 canonical_resources 延续文件权威。
同 ID 不同内容不能按非空、时间较新或来源优先静默覆盖：报告冲突并保留两份源，
未解决前不登记该迁移成功。未知字段保留在迁移恢复源，未经映射核对不得删除。

Renderer 的市场源、恢复路径和自部署设备身份沿用现有 `settings` 表，分别使用
`marketplaceSources`、`recoveryPaths`、`selfHostedDeviceId`，保持现有 hydrated
合同与来源顺序。Core 负责解析和迁移；DB 包负责设置行读写。工厂必须绑定调用方
提供的数据库，便携恢复只能绑定暂存根的数据库，不能借用活动全局连接。
`renderer-state-sqlite-v1` 一次性读取三个历史配置文件，保留原始字节的 recovery
副本；已有 SQL 值与历史值不同则报告冲突。SQL 写入、迁移账本与旧文件退出使用
同一 publication 收据。完成后只读写 SQL，重现的旧文件不得覆盖现值。
首次 renderer 导入将这些值与设置行、vault、完成标记一起提交，失败全部回滚。
IndexedDB 迁移标记仍是操作状态；应用/AI/同步设置与加密 vault 的共享所有者见下文。
正常操作按来源与恢复路径集合线性处理；迁移只读三个文件，无网络请求。
迁移及集成测试保留连续的准备、失败注入和重开断言；超过 50 行的流程不拆成
隐藏事务顺序的片段，由旧库升级、回滚与磁盘重开回归覆盖。
回退应恢复升级前数据库及 recovery 文件，不能让旧版直接写入新布局。验收需覆盖
旧文件升级、冲突、非法输入、SQL 失败、显式清空、磁盘重开和暂存恢复根隔离。

剩余设置收敛使用同一 Core 设置所有者：普通值及秘密引用保存在既有 `settings`，
实际秘密仍位于单一加密文件 `secrets/vault.enc`，不另建明文 SQL 副本。
Desktop 与 CLI 共用设备凭据访问；复用已安装的原生 keyring 依赖保存 256-bit
随机主密钥，vault 当前格式使用 Node AES-256-GCM，并认证 key ID 与格式身份。
空 vault 不要求创建或读取系统密钥，已有非空密文丢失密钥时禁止生成替代密钥。
设置行、vault 与首次 renderer 完成标记使用同一 SQLite 收据 publication。
应用、AI 与同步配置的当前实现已接入该所有者；迁移与入口回归仍在验证中。

`settings-sqlite-v1` 是旧 app/providers/sync/ai-models 配置及 Electron safeStorage
vault 的唯一转换边界。曾由配置文件拥有的字段按既有 owner 从文件采用，SQL 独有
字段保留；旧文件及待转换 SQL 行的原始字节保留在私有 recovery，普通路径不再读取或写回这些文件。旧版明文只存在原始恢复材料中，不能将 recovery 当作普通配置读取。
renderer 首次迁移保留已存在的模型清单；后续显式替换和清空遵守当前 SQL 合同。
`settingsUpdatedAt` 沿用 ISO 时间语义，AI 视图从同一设置修改时间派生，不另存同义
时间字段。Agent 设置和辅助状态继续使用各自领域入口，但共享同一数据库事务。

旧 Electron 密文需要 Electron 提供的 safeStorage 解密能力，仅在升级边界注入。
CLI 可独立升级旧明文 AI 配置和使用当前格式；若 profile 含尚未转换的 Electron
密文，必须明确要求先启动新版桌面端完成一次设备升级，不能静默读取脱敏旧镜像、
跳过秘密或降低加密。此约束只针对历史设备密文转换，不能保留双套日常实现。
回退需升级前数据库、原 vault 与配置 recovery 文件；跨设备便携恢复继续保留目标
设备秘密，不把 keyring 主密钥放入归档。加密验收覆盖错误密钥、IV/tag/密文篡改，
设置验收覆盖桌面/CLI 交替写入、空值清空、历史转换、失败恢复及真实 ZIP 重开。
升级备份中的 AI 清单修复只在 settings-sqlite-v1 内执行；账本完成后不得从旧备份
复活清空的清单。旧 SyncSettings.username/password 与代理凭据同样写加密引用。
空模型路由使用现有 AI 契约的 `{}` 默认值，原配置与便携恢复读回一致。
迁移和设置处理按条目及字节线性执行；无网络请求。SQL 保留每 key 的现有行结构，
不增加表或额外设置文档。升级编排、设置 publication 与 renderer 工厂及端到端测试可超过 50 行以保持原始输入、
事务决定与回滚断言连续可见。

包内 SKILL.md 是对外文件格式。导入时解析成当前记录；编辑时由同一个命令更新必要
包内容与记录。普通列表和读取不重新导入旧文件；外部编辑通过明确的扫描/导入操作。

Rule 收敛沿用 `rules`、`rule_versions`，不增加正文列。当前正文与历史正文
统一位于 runtime paths 的 `data/rule-files/`，元数据、项目绑定、版本身份和顺序只写 SQL。
`rule-metadata-v1` 在启动边界转换历史 canonical bundle、工作区 `_rule.json` 和版本
`index.json`，核对同身份正文和历史，保留 SQL 独有记录；冲突保留源并阻止就绪。
原目录以内容摘要备份到 recovery 后退出，目标正文只保留一个可写副本。
项目未部署的空 target/null root 配对必须保留；迁移和恢复不写外部目标。
正文、历史文件和相关 SQL 行使用同一 SQLite 收据 publication，SQL 失败回滚文件，
提交结果未知时先恢复，不能以逐条补偿覆盖已提交结果。日常保存先提交本地资产，
再沿用明确的外部部署及 sync-status 结果；部署失败不丢本地编辑。
普通读取不修剪丢失历史、不复活旧 JSON、不从外部目标修复已存在的受管资产。
历史缺失返回可观察错误；新发现的外部规则仍通过既有扫描入口导入。
整批导入先验证和计算合并结果，再一起提交，失败不能留下前几条已导入的状态。
既有 20 条日常历史策略不变；迁移保全全部历史。每条规则的日常处理按历史数线性，
全库迁移按记录与字节线性扫描，排序仅针对单条历史，不引入网络或新锁。
catalog 维护保留 Rule SQL 表；ZIP/checkpoint 从 SQL 与正文引用生成既有归档格式，
归档不充当实时数据源。回退需恢复升级前完整数据库与 recovery 原目录，不允许旧版
在新布局上直接写入。验收包含实际初始化、CRUD、整批失败、关闭重开、历史升级、
未部署项目和真实 ZIP 恢复；跨平台与 GUI 证据仍独立记录。
Claude scoped Rule 使用完整身份摘要作为受管目录名，正文按整个身份目录发布；原文件名不附加临时后缀，从而保留合法长文件名。迁移与正常保存复用同一文件 publication 计划。

Rule 归档文档 schema 2 允许当前正文独立于历史、历史为空；bundle 外层 manifest
格式不变。旧 schema 1 仅在导入边界读取，保留旧版正文/最后历史一致校验。
Rule workspace factory 继续集中组装同一依赖边界；项目创建与迁移编排的显式字段映射
超过 50 行时保留连续操作，由正常 CRUD、旧库转换、失败回滚和两次启动回归覆盖。

Web Rule 收敛复用同一 Rule 文件/SQL publication。Web 每个已认证用户拥有独立 Rule 集合，同一 Rule ID 和版本 ID 可以出现在不同用户中。`rules` 和 `rule_versions` 增加 `owner_user_id`，联合主键及版本外键均包含该列；空字符串明确表示 Desktop/CLI 的本机集合，不是 Web 用户，也不参与 Web 查询。Web 必须在服务边界验证用户存在。共享 RuleDB 查询始终按一个 owner 过滤，默认本机集合；公开 Rule ID 不改名、不嵌入租户。历史 schema v5 的全部行原样迁入本机集合，迁移与约束在初始化事务内完成，失败保留旧库和 safety point。

Web 当前正文与历史统一放在 `data/rule-files/<userId>/`；旧 `data/rules/<userId>/` 只由启动迁移消费。迁移验证实际目录的用户归属、元数据/索引/正文、路径与符号链接，保全原树后一次提交 SQL、当前文件和完成记录；不推断或认领未知用户。正常读取不读取旧 JSON，缺失正文/历史不得静默丢弃。Web 保存和恢复只修改服务器受管资产，不访问客户端项目路径。正常编辑沿用既有 20 条历史策略，历史迁移不截断。整体备份导入把 Rule publication 的 SQL 应用加入原有业务提交边界，禁止在外层 SQL 事务里单独提交文件。其他域的既有文件写入边界仍需单独收敛，不能把 Rule 的通过当作完整备份原子性。

Web 历史解析、迁移编排及 `buildRuleStorageGraphs` 的显式字段映射保留连续步骤，超过 50 行的部分由迁移失败/重试、两个用户同身份、历史与正文读回回归覆盖；不拆成分散的隐式写入。

验收覆盖两个用户相同 Rule/版本身份、认证 HTTP 保存/删除/重开、真实 v5 行升级、旧 Web 文件转换/重复启动/失败重试、整批晚失败以及缺失文件保全。规模按用户的 Rule 与历史条数线性处理，查询由联合键定位；历史只在需要正文或备份时读文件。回退使用升级前完整数据库与文件恢复副本，不把新租户库交给旧版程序写入。

Agent Provider 的本批收敛沿用 `agent_provider_profiles` 与
`agent_provider_model_mappings`，不新增表或存储模式。启动迁移合并历史 Agent bundle
中独有的稳定 ID；同 ID 的公开配置和完整映射必须一致，现有 SQL 秘密引用原样保留。
冲突保留全部源并阻止启动。已有文件 publication 负责备份原 bundle、退役旧元数据，
同一 SQL 事务写入新增记录和迁移完成记录。完成后普通增删改只使用 DB 类；catalog
维护必须复制这些 SQL 表，不能再从 Agent JSON 重建。导出/显式历史导入仍可使用
原 bundle 格式。已完成迁移后重新出现、但 SQL 中已不存在的旧记录视为冲突，禁止复活。
ZIP 导出继续使用既有脱敏 bundle 格式；完整导出复用一致 checkpoint，选择性导出
直接读取 SQLite 生成临时包，保留 profile/mapping ID 后清理临时文件。归档不携带
完整业务库或设备秘密引用；恢复在显式导入边界解析包并写回 SQL。
正常启动遇到丢失或不可读的业务库必须要求恢复，不能把文件目录当成完整业务备份。
迁移按配置 ID 线性合并；每个配置的映射按路由排序比较，单组为 O(m log m)。
恢复副本按内容哈希复用，成功路径文件只复制一次；不增加网络调用或新锁设施。

Prompt 的 canonical JSON 转换由 Core 的 `prompt-sqlite-v1` 启动迁移负责，
使用现有 prompts、prompt_versions、folders、prompt_relations、output_format_items 表，
不新增业务 schema 或另一套运行模式。转换按稳定 ID 合并文件独有记录；同 ID 字段不同、
重复版本位置、关联闭包错误或同名媒体字节不同均保留源并失败，不按时间选择赢家。
现有 SQL 行不使用 REPLACE 重写，避免级联删除既有版本和关系；提交事务核对完整图摘要。

迁移通过已有 publication journal 发布媒体副本和完整历史清单恢复副本，退役 Prompt
结构目录及 catalog.json，在 SQL 事务中记录完成并移除已失效的 Prompt 资源索引。
原 CAS 对象保留，媒体按 runtime path 真源落入实际 images/videos 目录；恢复副本及
数据库 safety point 保留升级回滚材料。失败回滚未提交文件和 SQL，重试从原始源继续。
已完成后的常规启动不读取旧 Prompt 图；若历史归档重新出现，只有完整图与 SQL 一致
才能再次退役，不一致必须显式恢复，不能复活已删除记录。归档导出/显式导入继续校验
原有格式；正常 catalog 维护显式传入 SQL Prompt 源，不能从 JSON 重建业务数据。

Core 与 Desktop 的 Prompt/Folder/关系/输出格式普通操作直接使用 db 包；移除
canonical Prompt coordinator 和 mutation 后的 JSON/Markdown 发布调用。Markdown 历史转换
由后续有序 `prompt-workspace-v1` 在 Core/Desktop 可写数据库开放前完成；不再执行
四象限启动合并或时间戳选胜。原 workspace/prompts、data/prompts、两类 versions
及 folders.json 经校验后按稳定 ID 合并；Markdown 未表示的 usageCount、归属等 SQL
字段保留，正文的历史序列化空白差异不会覆盖 SQL 原文。同 ID 实质冲突、缺父项、
不完整历史和不安全路径保留源并失败。完全没有版本的旧正文生成一个确定身份的当前版本。
恢复标记明确保留恢复后的 SQL，包括空库；旧文件只备份退役，不参与合并。

旧 Markdown 全字节恢复副本保存在 recovery/prompt-workspace-v1/<inventory-hash>/，
文件退役、恢复标记消费与 SQLite 完成记录沿用同一个 publication journal；失败回滚，
重试不覆盖既有行，完成后出现历史文件必须显式恢复。显式工作区导出和导入仍可使用
原文件格式，但导出路径固定为 cache/prompt-workspace/prompts，版本及回收内容位于
同一 cache/prompt-workspace 根；它不参与启动迁移，也不作为当前业务数据真源。
迁移读取与显式操作共用格式 codec；完整迁移编排保留单个 journal 提交边界，
超过 50 行的编排由整图、失败回滚、恢复标记和重复启动用例覆盖。
转换对记录使用 Map 合并和父级拓扑顺序，图排序 O(n log n)，媒体/恢复副本按文件复制，
哈希使用固定 64 KiB 缓冲；不新增网络请求、重试、限额或锁设施。完整迁移编排超过
50 行时保持一个可审查的 journal 提交边界，由冲突、回滚、重试及重开测试覆盖。

Web 使用同一迁移编排的显式历史格式选择器，独立 ledger 名为
`web-prompt-workspace-v1`。它只读取历史 `data/prompts/` 及其 `.versions/`，
保留 Web 的 ownerUserId、visibility、usageCount、lastAiResponse；未知用户引用
按真实外键失败，不能静默清空归属。迁移入口在 Web 数据库初始化，先完成迁移再开放
服务。普通 CRUD 只写 SQL；显式 workspace/sync 导出到 cache/prompt-workspace。
SQL 导入不再受 Markdown 文件路径长度约束，显式导出保留其路径校验和 staging 发布。
Prompt/Folder 创建、修改和归属写入共用事务，direct-insert 先检查已有 ID 的写权限。
服务中的既有 update 编排超过 50 行时保留连续的权限、文件夹约束、事务与读回，
避免把同一写入边界拆散；真实 HTTP 与 SQL 触发器失败测试覆盖回滚、重试与用户隔离。
历史格式分歧只存在于一次性迁移边界，当前应用不接受多套持久化结构。

Rule 记录更新使用 `ON CONFLICT(id) DO UPDATE`，不能使用会先删除父行的
`INSERT OR REPLACE`：`rule_versions` 的级联外键会使仅更新元数据也丢失历史。
此修复不改变 schema 或历史文件位置；版本替换和显式删除仍由对应 DB 方法负责，
调用方的外层事务可以原子回滚记录与版本。验证使用真实初始化、磁盘库重开、
UPDATE 触发器故障与外层事务故障；Rule 正文/历史的完整 SQLite 转换仍未完成。

Prompt、Folder、Skill 的 direct-insert 同样按主键原位更新，保留未在该请求中声明
删除的版本、树关系、图关系和输出格式。其他唯一键冲突必须失败并保留冲突双方，
不能通过 REPLACE 删除另一身份。完整快照恢复仍由调用方在事务内明确清空所选范围。
无需 schema 迁移；新旧库走相同 SQL，失败恢复依赖既有事务，回滚代码无需改数据。
Skill 的既有字段绑定方法保持连续映射（超过 50 行），以便审查所有导入字段；
真实 SQL 版本保留、来源唯一冲突和磁盘重开测试覆盖该入口。主键索引定位保持
`O(log n)`，取消了无意的级联删除和随后重建，不增加扫描、网络或持久化副本。

Prompt/Skill 的直接版本导入不再静默忽略唯一键冲突。按版本 ID 和
`(所属记录 ID, version)` 查重；唯一匹配的规范内容完全相同时幂等返回已存版本，
身份、所属记录、版本号、正文、备注、包快照或时间不同则报告冲突。JSON 对象键顺序
不影响比较，数组顺序仍有意义。新行在同一 SQL 事务内写入并读回验证；外层恢复事务
遇到冲突一并回滚。可空文本保留显式空串，Skill 版本直接绑定文本拒绝 null byte。
Web 直接版本导入返回数据库读回内容，冲突统一为 409/CONFLICT，不回显另一记录。
每个版本最多两次索引读取和一次插入，不扫描整段历史；内存只持有当前版本及最多两个
冲突候选，批量恢复沿用调用方事务。版本字段映射与单笔完整性编排超过 50 行时保持
连续，以便核对同一事务的比较、写入和读回；完整集成用例保留连续鉴权/重开流程。

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

现有 Desktop checkpoint 的本地收集和复制阶段不在结构化数据与媒体/包文件之间
让出事件循环；内部 Rule 读取回调同步返回本地结果。调用返回 Promise 的约定保留，
随后排入主进程的编辑只能发生在该阶段完成之后。这修复单个主进程命令之间的混合
快照，不替代跨进程 root owner、外部文件编辑检测或完整 pin/commitSequence 契约。

Amazon S3 支持基于 ETag 的 If-Match 条件写入；初始化用 If-None-Match。ETag 仅作
并发令牌，不当作 SHA-256。S3 兼容服务与 WebDAV 必须验证真实服务端条件写行为，
不能凭产品名或 OPTIONS 响应宣称安全。[S3 条件写入](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html)
[WebDAV ETag 与条件请求](https://www.rfc-editor.org/rfc/rfc4918.html#section-8.6)

传输合同统一为 `RemoteWriteCondition`：创建用 `ifNoneMatch: "*"`，更新用一次
GET 所得的强 ETag `ifMatch`，两者互斥。GET/PUT 将 opaque `etag` 原样穿过
main/preload/renderer；412、409 及条件更新时的 404 返回明确 `conflict`，不得
降为无条件重试。IPC 在网络请求前拒绝弱 ETag、通配 If-Match、多个条件及控制字符。
该通道本身不证明目标支持条件写；运行时能力验证、共同基线、资源级三方合并和
删除传播仍属于同步编排的必需部分。传输变更不改变 DB schema 或历史备份格式。
SDK 直连请求在消费完 body 后释放其私有连接；借用的代理连接由 network-proxy
统一管理，单次 S3 请求不得销毁其他请求正在使用的代理 agent。

Core `remote-publication` 在既有远端目录以随机独占名称探测真实 PUT/GET 行为：
create-only 必须拒绝已存在对象，正确 ETag 更新必须成功，旧 ETag 更新必须拒绝，
每次拒绝后读取内容必须保持不变。探测结束删除本次对象；清理失败返回未清理的
精确对象路径，不能报告能力已验证。GET 能提供 ETag 并不单独构成支持证据。
探测为常数次请求，不扫描用户对象，不新增重试、超时或并发策略。
发布使用观察到的强 ETag；响应丢失时只读回完全相同的 generation 字节来确定成功，
否则返回 uncertain，交给同步操作身份恢复。不得换身份再次上传或退回无条件写入。
当前 Core 原语与传输已实现，自动同步调用链的接入仍待共同基线/删除记录批次完成。

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

资源比较由 Core `causal-sync` 负责。输入是同一 `syncId` 的共同基线、当前远端
generation，以及由本地 owner 固定的**完整**资源清单；省略资源表示相对基线的删除，
不能传入筛选列表或省略空集合的便携导出。资源身份沿用 `resourceType/resourceId`，
完整资源的 `contentHash` 包含其业务字段、版本和文件引用；`references` 显式列出
必须同时存在的资源身份。Skill 整包只占一个比较单元。清单仅保存同步元数据及对象
引用，不替代领域 SQLite 表，也不保存第二份可编辑业务记录。

generation 的 `revision` 严格递增，`commitId` 标识一次提交，`parentCommitId` 指向
观察到的远端；每个资源保留最后变动的 revision、commitId、deviceId。删除条目保留
原 contentHash 和删除提交身份。未变的远端条目沿用原身份；双方独立达到完全相同的
资源结果可以收敛，删除与不同内容并发仍冲突。合并后统一检查引用闭包，任何冲突
只返回诊断，不返回可供部分提交的 generation。输入不会被改写。

首次加入时空本地可以接收远端；双方都有不同数据且没有共同基线时要求显式建立
基线，不猜测哪方权威。远端丢失、syncId 变化、revision 倒退、同 revision 异提交、
或缺失基线已有的资源/删除条目，都要求保护本地改动后重新同步。当前阶段不压缩
tombstone；设备确认/游标撤销的持久化与压缩仍待接入。比较为 O(资源数 + 引用数)，
输出排序为 O(n log n)，不逐资源请求网络。关系闭包只检查声明的引用；各领域 exporter
仍必须保证完整资源和正确引用，不能用该比较器的测试代替领域快照/恢复验收。

### Causal sync local commit state

共同基线与未决操作由 Core CausalSyncSession 和 SQLite sync_targets 持有。
schema v8 增加稳定 target id、device id、sync id、base_json 和 pending_json；
JSON 仅包含校验过的同步协议元数据、内容 hash、引用和观察到的强 ETag，
不存凭据或第二份可编辑业务内容。target id 由传输配置所有者派生并区分目的地，
设备身份保存在该目标的 sync_targets 记录中：首次由调用方提供唯一 UUID，
后续必须复用已存值；不能仅从目录路径派生，也不能在每次运行时重新生成。
新表由现有顺序迁移事务创建，旧用户原表不改写；失败保留旧库并可重试。
维护重建保留本机同步状态，旧 schema 没有此表时迁移为空；当前 schema 缺表必须失败。
该状态不作为另一个设备可导入的业务资源。回滚恢复升级前数据库安全点。

准备操作固定完整本地清单 hash、候选 generation、条件写 ETag 和单次操作身份。
已有未决操作时返回同一记录，不新建提交身份。HEAD 发布复用条件能力验证和
条件提交原语；结果不明时保留未决记录，重开先以相同候选字节核对远端。
明确条件冲突只撤销本次未决记录，保留原共同基线；不能把 uncertain 当成冲突。
本地应用在同一数据库事务中先核对最新完整清单，执行领域写集，再核对最终
完整清单与候选一致，最后推进基线。SQL 失败一起回滚。`complete` 只接受 SQL 写集；
更换实际文件使用 `completeWithFiles`，由既有 receipt publication 暂存完整写集，
暂存结束后、发布日志进入 prepared 和替换目标前核对原清单。校验失败仅清理暂存，
保留本地编辑、未决同步和旧基线。文件替换后，领域 SQL、最终清单核对、基线推进
和 receipt 在同一个事务提交；任一步失败恢复全部原文件和 SQL。SQL 已提交但文件
日志确认失败时按既有 receipt 恢复，不能重新应用写集。空文件写集同样执行 preflight。
领域回调只同步写 SQL，不能自行写文件或返回异步任务；文件变更统一提供给发布器。
该入口不改变持久格式，沿用 v3 发布日志与 schema v8 同步状态。复杂度为两次完整清单
读取和 O(B) 暂存/校验文件字节，额外内存为清单元数据；不复制文件字节到同步状态。
同步期间继续编辑会返回 local-changed，保留内容与原基线；已确认远端提交可释放
未决记录后重新进行三方比较，同资源变化仍需显式解决冲突。

此批交付持久化、条件提交和本地文件/SQL 联合提交边界。完整领域清单导出、领域写集构造、设备身份
和传输配置接入、自动同步替换、真实服务能力验收仍未完成；不能把这个状态机
的测试解释成自动同步已支持删除传播。比较与事务校验为 O(资源数 + 引用数)，
规范排序为 O(n log n)，不读取图片或包字节；网络发布没有新增重试循环或超时策略。

**外部 Agent 分发。** 保存资产和部署资产是两个命令。部署前比较 targetObservedHash；
外部用户修改时返回 conflict，保持目标原样。库内保存成功、外部部署失败时明确显示
“已保存，部署失败/待重试”，不回滚用户内容。

### Desktop causal sync integration

Core owns transport orchestration through `causal-sync/workflow.ts`. Each domain
exports its complete resource inventory, validates incoming payloads and prepares
one SQL/file write set; the renderer does not own baselines or domain mutations.
Immutable payloads are published and read back before conditional HEAD publication.
The existing SQLite sync target stores operation and device identity. Pending
operations pin their exact payloads under the target-specific cache until confirmed
application or explicit replanning; subsequent local edits cannot replace them.
No additional database schema or alternate application data store is introduced.
Normal completion releases the pins. A failed operation retains its existing base,
pending identity and recovery material. Rollback uses the existing receipt journal.

Prompt resources include complete version history, folder/parent dependencies,
graph links, output format items and referenced binary media. Skill resources are
whole packages with histories; changes in different files of one package still
conflict as one resource. Transport serialization is deterministic; timestamps in
business records are preserved, while export-time timestamps are not invented.
Rule resources include metadata, current content and history; deployment paths and
target status remain device-local. Incoming Rules update managed files without
deploying to an external Agent directory. Generation resources include the complete
batch metadata and hash-verified outputs, with an explicit source-Prompt dependency.
All domain writes and deletions join the existing SQL/file receipt transaction.
Skill replacement retains the destination's `.prompthub` sidecar. Capability checks
precede baseline creation; a remotely confirmed pending operation can finish from
its pinned payloads while offline.
MCP resources contain the public current definition, version metadata and complete
history documents. Device bindings and encrypted credential bytes remain local;
incoming references without a local credential use the existing unavailable state.
MCP history files, SQL records and the sync baseline share the same receipt commit.
Agent provider resources preserve stable profile/mapping IDs and public model
configuration. A required credential resolves to an existing destination reference
or the established unavailable reference. Changing a public profile never deletes
its local deployment snapshots; native activation and encrypted bytes are not sent.
Application settings form one resource using the existing renderer settings codec.
Portable UI/model preferences exclude credentials, native paths, sync destinations,
background-image configuration and machine startup behavior through
`DEVICE_RENDERER_SETTING_KEYS`. Agent root configuration stays device-local.
Matching AI provider/model identities retain destination API keys. Settings SQL and
the existing vault participate in the same receipt publication; no second vault or
normal JSON configuration store is created. Existing backup scopes remain separate.
Resource matching is linear apart from canonical sorting. File transfer uses the
existing text transport; large media/package memory budgets require measurement
before the complete Desktop integration is enabled.

The integration is not complete until every current portable domain is registered,
the actual automatic-sync call chain uses it, conflict/baseline actions are exposed,
and provider plus migration/release acceptance passes. An isolated domain test
does not authorize switching the whole workspace to a partial inventory.

### Automatic sync entrypoint and explicit review

Startup, interval and save-triggered Desktop sync call one typed main-process
IPC entrypoint. It reads canonical local settings, composes all domain owners,
and reuses the existing WebDAV HTTP/proxy and S3 SDK transports. Manual backup
formats remain separate. A target's duplicate invocations share one operation
because replaying the same persisted pending operation concurrently would race
its publication/completion; this is operation ownership, not a business quota.

Review tokens cover target, common base, local inventory, remote generation and
ETag. Conflicting resources and missing-reference participants require explicit
choices; independent edits retain normal merge behavior. A missing/unrelated
baseline requires a whole-library choice. Both pre-resolution inventories and
immutable objects are saved in a private recovery directory before publication.
Previously observed remote generations are archived before conditional HEAD
replacement. Encryption uses the existing transport codec; no plaintext fallback
or additional retry policy is introduced. Domain coordinators and ordered
integration fixtures may exceed 50 lines to keep atomic ordering visible.
Current source validation and deployed-provider acceptance remain separate gates.

### Plugin SQLite conversion

Plugin metadata moves to `plugins` and `plugin_versions`; stable IDs, names,
timestamps and version relationships are relational columns, while sparse public
metadata remains JSON in the owning row. Actual current and historical package
bytes live under `data/plugin-files/<encoded-id>/`, without a parallel writable
library JSON. Device source locations and deployment targets remain local metadata.
Schema migration 9 creates the tables without changing existing business rows.
The ordered `plugin-sqlite-v1` data migration imports legacy JSON/canonical bundles,
retains byte-preserving recovery copies and retires the old metadata only in the
same receipt publication as the SQL write. Conflicting stable identities stop the
migration with both sources intact. Reappearing retired inputs require explicit
recovery. Rollback restores the database safety point and retained source tree;
normal edits/deletions must survive reopening without reimporting retired files.
Portable backups continue to export the existing Plugin bundle format from SQL
and actual files. Migration, rollback/retry, package inventory, delete/reopen and
backup restoration are required before marking this conversion complete.
Complete ZIP exports read Plugin bundles from the verified SQL checkpoint;
selected Plugin exports materialize the same bundle format from SQLite and the
actual package files. Rollback/import responses return the committed managed
path, and local SSH source addresses are retained outside the portable payload.
Migration and publication orchestration may exceed 50 lines to keep the single
atomic operation visible; real SQL failure/retry and historical upgrade tests
cover the ordering and recovery boundary.

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
| Canonical 用户资产 | Core `migrations/plugin-metadata-v1.ts`、`canonical-storage-authority.ts` 及各 `*-resource-schema.ts`；核对完整包、版本、关系、媒体和可重建 catalog；authority marker 当前为 1，不能当作所有领域的 schema 版本 |
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

**近期来源样本（2026-10-09）。**
`packages/core/tests/fixtures/historical-runtime/` 保存 v0.5.9、beta.1、beta.2
三个精确发布 commit 的完整合成 profile、归档 hash、文件清单、SQLite schema/全部行、
正式 writer 的结果及第二个旧源码进程重开结果。生成器由同一历史 commit 加载
Core/DB/shared，来源测试逐个核对实际加载文件与 Git blob 的 SHA-256；三个样本均通过。
这些 profile 使用历史 CLI/Core 的默认初始化，不手写 Desktop authority 或 renderer
迁移完成标记；运行环境复用本机 Node 26 和现有第三方依赖，不能据此声称历史发行包
或 Desktop 原生环境已通过。beta.2 样本保留同名 active provider，不能在接入时恢复
beta.1 的唯一约束而丢弃记录。

保留归档完成来源与旧版重开验证。2026-10-14 新增
`packages/core/tests/historical-runtime-upgrade.test.ts`：从同一精确历史源码重新生成
隔离 profile，在原目录执行当前 Core 初始化、正常编辑和两次数据库重开；三个版本
直接升级通过，提交前失败保全及重试的三个用例也通过。该测试不改写保留归档或
其中的绝对路径；当前 Core 路径覆盖不等于 Desktop canonical 来源升级。
连续跨版升级和当前目标权威转换仍未完成。
转换必须通过实际启动入口消费这些来源，并保全稳定 ID、全部版本、关联、配置和
Skill/Plugin 包字节；其中固化的旧活动根路径须在单一升级边界重绑定，不能修改归档
掩盖路径问题，也不能在正常 reader 增加旧路径 fallback。Desktop file-first 来源、
旧设备加密凭据、早期结构组与部分完成状态仍需要分别准备样本。

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

### Web Settings SQLite authority

`apps/web` keeps its existing authenticated `user_settings(user_id, key)`
authority and JSON-valued rows. Normal GET is read-only; SET and backup import
use the current SQL transaction and never write `config/settings/*.json`.
No schema change, new storage engine, credential transformation or API change is
required. Invalid persisted JSON fails explicitly rather than becoming a string.

The startup converter `web-settings-sqlite-v1` runs after DB initialization and
before services become writable. It validates regular, non-symlink historical
files against known setting fields and verifies each owner exists. Unknown
historical fields remain preserved, including the exact source file. For an
owner with existing SQL rows, SQL retains whole-snapshot precedence, matching
the previous reader; a file-only owner receives its file fields. Missing fields
retain the current read-time defaults. Timestamps never choose authority.

Conversion stages a byte-verified recovery tree at
`recovery/web-settings-sqlite-v1/<sha256>/` with private permissions, then uses
the existing SQLite/file publication journal to commit imported rows, source
retirement and the migration ledger together. A pre-migration DB safety point
pairs with that tree for rollback in an isolated root. Failure restores the old
files and rolls back all imported owners. A completed migration never reimports
its recovery tree; reintroduced legacy files require explicit recovery. Preserve
post-upgrade SQL writes before downgrading. Web credentials retain their current
server storage policy; they are not logged or copied to a new ordinary mirror.

Preflight and publication are O(files + bytes), plus indexed SQL lookups.
The converter reads one owner's settings at a time; only file names/digests are
retained across users. Normal settings patches keep the existing bounded
per-user snapshot semantics. Tests cover authenticated tenant patches, SQL
readback, reopen, nullable clearing, first-read defaults, exact source recovery,
SQL precedence, unknown fields, rollback/retry, malformed files and symlinks.
The ordered migration and end-to-end lifecycle tests may exceed 50 lines so the
publication and before/after assertions remain visible together. Desktop
Settings and Web device registration are separate remaining conversions.

The removed read-side mirror also removes an accidental second-read SQL write.
An untouched default-only export now carries the Unix epoch as its settings
baseline, without creating SQL rows or inventing a user edit. It therefore
predates all recorded edits under the existing timestamp merge contract. This
preserves normal WebDAV pull and explicit forced-import behavior for snapshots
without a supplied timestamp. Causal sync remains a separate pending redesign.

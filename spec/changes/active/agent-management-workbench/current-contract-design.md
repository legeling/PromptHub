# Agent 当前契约统一设计

日期：2026-09-28。审查基线：`4863ebc0`。状态：设计完成，实施待执行。

权威需求为 [FR-AGENT-138](specs/agent-management/spec.md#fr-agent-138-one-current-contract-per-agent-capability)；
存储归属遵循 [foundation 当前需求](../foundation-integrity-redesign/specs/foundation/spec.md)。
执行进度只维护在 [tasks.md](tasks.md#agent-current-contract-convergence)，不建立第二份计划。
本轮仅审查代码与现行文档，没有执行或验收下列业务改造。

## 1. 目标与边界

同一 Agent、同一项能力只有一个当前配置结构、一个已解析目标、一个执行路径。
不同 Agent 的原生格式由现有 adapter 处理；copy 与 symlink 是用户明确选择的两种
操作，不能在失败时相互替代。平台原生支持多个文件或作用域时，可以在该 adapter
内按当前正式契约解析；这不等于允许 PromptHub 猜测历史版本或跨产品降级。

范围覆盖 Agent 配置与身份、根目录解析、Skill 分发状态/安装/卸载，以及调用这些
公共能力的供应商、会话、额度入口。MCP、Rules、Plugin 复用同一个路径结果；不在
本批次重写各自的业务模型。历史导入、备份恢复必须经过相同的数据转换边界。
不新增 Agent 数据库、持久化平台列表、通用策略框架、自动重试或备用执行链。

## 2. 已确认的代码问题

下表是静态阅读确认的分支与依赖，不把它们都宣称为已复现的用户故障。
路径以仓库根目录为基准，函数名为主要定位依据。

| 优先级 | 代码位置 | 当前行为与后果 | 处理方向 |
| --- | --- | --- | --- |
| P0 | `packages/core/src/agent-management/agent-settings-repository.ts`：`read/write`；`canonical-agent-device-config.ts`；`renderer-persistence-migration.ts:readHydratedState` | SQLite、设备 JSON、renderer hydration 存在多条设置读取/回写路径；当前 `localAuthority` 选择业务实现 | Agent 结构化设置收口到现有 SQLite `settings`，JSON 只作升级输入或备份导出；同步阻止启动重建/恢复回写旧真源 |
| P0 | `skill-installer-utils.ts:readBuiltinAgentOverridesFromSettings`（desktop main services） | 当前 overrides 为空时再尝试两代旧字段；解析失败返回空配置，可能落到默认目录 | 旧字段迁移后删除运行时读取；损坏配置明确失败，缺失值采用唯一正式默认值 |
| P0 | `apps/desktop/src/main/ipc/settings.ipc.ts`、renderer `settings.store.ts`、`settings-persistence.ts`、`settings-agent-actions.ts:writeBuiltinOverrides`；core `AgentSettingsRepository.setBuiltinOverride` | IPC、hydrate、Zustand migration、保存命令重复转换且双写旧字段；部分读取的转换先后顺序还不同 | 转换只进升级入口；renderer 只消费当前 DTO，保存命令只写当前字段 |
| P1 | `packages/core/src/agent-management/agent-inventory.ts:resolveAgentPlatformRoot`、desktop `skill-installer-utils.ts:getPlatformRootDir`、`packages/core/src/platform-paths.ts` | 三处路径解析各自处理默认值、环境变量、旧根目录；工作台与分发可能解析不同结果 | 在现有 core 路径模块统一当前配置解析，检测目录存在性与路径选择分开 |
| P0 | desktop `skill-installer-platform.ts:inspectPlatformSkillInstall` | `lstat` 看到软链接就返回 installed；未证明目标或 SKILL.md 可读 | 只有当前目标包可读且适用的原生注册成立才为 installed；断链与权限错误不可报告成功 |
| P1 | 同文件 `installSkillMdSymlink`；renderer `use-skill-platform.ts` | EPERM/EACCES/ENOTSUP/UNKNOWN 后自动 copy；renderer 接收 requested/effective/fallback 三套语义 | 按请求模式执行；失败保留旧状态并返回错误，用户另选 copy 才发起新操作 |
| P1 | 同文件 `legacySkillNames`、`cleanupLegacyPlatformSkillDirs`、`inspectSkillSourcePathInstall` | 普通业务接口仍接受历史名候选，是否仍有生产调用者须逐项核对；来源路径也能推断已安装 | 历史名称在迁移阶段归一；当前观察到的外部包与 PromptHub 拥有的安装分开，撤回前核对身份 |
| P0 | `agent-platform-context.ts:resolveAgentProviderContext`、`agent-session-service.ts`、`agent-usage-service.ts:queryAntigravityUsage` | Antigravity Skills 用 config，供应商/会话隐式转 CLI，额度先桌面会话再尝试 CLI/Gemini 凭据 | 明确桌面/CLI 产品边界与能力归属，按唯一来源执行；无有效桌面会话即报告对应状态 |
| P1 | `cherry-studio-skill-platform.ts:openCherryStudioDb` | 探测多个数据库与 modern/legacy schema 后执行写入 | 核对当前原生契约后保留唯一写入适配；不得替第三方迁移私有数据库 |
| P1 | `skill-platform-data-upgrade.ts`、`skill-platform-symlink-startup.ts`、`packages/db/src/database-migration-state.ts` | 新 Antigravity 步骤复用了旧 name-history；通用旧链接重绑仍每次启动执行；与带 checksum 的 DB 历史并未形成完整升级序列 | 复用现有迁移历史/恢复设施补齐顺序、校验与完成条件，旧结构转换从启动普通修复移入版本化步骤 |

现有回归也固化了旧行为：`skill-installer-platform.test.ts` 明确期望 symlink 失败后
copy；`settings-agent-roots.test.ts` 仍断言旧字段。清理源码时必须同步更正预期，
不能保留错误测试再加分支让它通过。`antigravity-skill-migration.test.ts` 已覆盖
旧默认目录托管软链接，但没有覆盖复制安装、历史别名配置或原生 Agent 消费。

## 3. 最小目标结构

```text
启动 / 旧数据导入 / 历史备份恢复
  -> 版本识别 + 原数据备份 + 顺序迁移 + 当前契约验证
  -> SQLite 当前 Agent 设置
       -> AgentSettingsRepository（唯一读写边界）
       -> core 当前路径解析（registry + 当前覆盖配置 + 正式环境变量）
       -> 对应能力 adapter（一个明确的原生目标）
       -> 实际结果 / 明确错误
       -> Desktop IPC、CLI 与 renderer 的同一契约

文件系统：Skill 包、分发副本或链接、Agent 原生文件、迁移恢复记录
SQLite：当前 Agent 设置、稳定身份、迁移历史及必要的结构化归属记录
```

### 配置与路径

- 复用 `builtinAgentOverrides`、`customAgents`、`disabledPlatformIds`、
  `agentIdentityPreferences` 的规范名称与现有共享类型；不另起 settings V2。
- 先把 Agent 相关键在 SQLite 中确定为唯一业务真源，再移除它们在
  `config/devices/agents.json` 的读时补建、双写和 renderer hydration 覆盖。
  文件备份须保留，其他域的 canonical 改造继续由 foundation 负责。
- `AgentSettingsRepository` 统一校验与事务写入；设置 IPC、Agent IPC、CLI
  复用它。renderer 保留会话中的 UI 状态，不拥有另一份持久化配置。
- 路径只按“明确覆盖配置 → 当前官方环境变量 → 当前 registry 默认值”解析；
  `exists` 只用于检测或报告缺失，不决定自动退到旧目录。
- 复用/收拢现有 `platform-paths.ts` 与 `agent-inventory.ts` 中的函数，给调用方
  同一结果；不新建路径服务体系。调用方不得再拼 Agent 专属备用目录。
- 初始无配置的默认值与配置损坏严格区分。清空 overrides 是有效操作，不能因
  空对象再次读取旧字段而把用户已删除的设置复活。

### 安装、状态与卸载

- 普通文件平台复用共享的完整包安装/撤回步骤；Cherry Studio 等原生注册由其
  当前 adapter 完成，不能把不同存储方式强行变成“所有平台都复制一个文件”。
- 保留明确的 copy/symlink 选择。结果复用现有合同并在切换批次统一生产者/消费者；
  删除 `fallbackReason` 及只用于自动降级的 UI。成功结果只返回一个 `mode`，
  同批替换 requested/effective 双字段，shared target 与平台 target 一起切换。
- 状态查询核验目标类型、链接目标、入口可读性和适用的原生注册；安装确认、
  My Skills、Agent Skills、详情及批量弹窗复用同一检查结果。
- “发现一个可用外部包”和“PromptHub 拥有这个分发目标”是不同事实。
  复用 activation 身份验证并按下述单一安装归属模型迁移，不新增并行 receipt。
  未核对归属，不按显示名称删除目标。
- 不在本次方案里新增持久化状态机；先让现有 installed/mode 与 IPC 错误合同
  表达准确。确需展示 broken/conflict 的原因时，在既有共享合同集中补充。

安装归属建议收敛到同一 SQLite 中的一张 `skill_installations` 表（代码盘点未发现
既有安装归属表）：`target_path` 为设备本地规范绝对目录及主键，`skill_id` 为
非空 Skill 外键（ON DELETE CASCADE），`mode` 为非空 copy/symlink；不保存可派生的
installed 布尔值或复制一份平台名称。核心查询是按目标查所有者、按 Skill 找撤回目标，
因此只增加 `skill_id` 索引。目录键解析实际父目录并保留安装项名称，不对末端
软链接取 realpath 而误把所有分发合并到源包；按目标 OS 处理大小写。删除 Skill
先成功撤回受托管目标，再事务删除记录。
同一个实际目录被多个 Agent 发现时只有一份归属，批量操作按实际目标去重，预览说明
共同受影响的 Agent，执行后全部刷新。第三批同时迁移 sidecar、撤下普通读写路径并
验证恢复/重启；sidecar 原件只留在恢复备份中。该表是设计提议，尚未修改 schema。

### Antigravity 与原生适配

[官方 Skills 文档](https://antigravity.google/docs/skills)（2026-09-28 核对）明确区分：
桌面 2.0 的全局目录为 `.gemini/config/skills`，CLI 为
`.gemini/antigravity-cli/skills`，IDE 还支持历史目录。审查基线中的 FR-AGENT-021 把
config 称为 CLI 与桌面的共享 Skill 根目录，与该证据不符；本轮已纠正文档，代码待调整。

建议保留现有 `antigravity` 身份用于当前桌面能力；CLI 若继续作为受支持产品，
在现有 registry 中使用独立目标和能力声明，不新增一层 profile/surface 路由框架。
具体 CLI 标识与已有供应商、会话索引的归属必须在第一批完成清单中冻结，属于
本方案的待评审产品选择，不得把旧 `antigravity` 数据整包改名或按目录名盲猜。
`gemini` 现有身份及其数据保留，不充当 Antigravity 的备用目标。

桌面额度只使用该产品当前已验证来源；会话、供应商、MCP、Rules、Plugin 分别记录
实际支持的产品与版本。当前桌面格式尚未验证的能力，保留数据并明确 partial/planned，
不能把 CLI 的成功算作桌面成功。原生数据不属于 PromptHub：不自动改写第三方
数据库、迁移 OAuth/Keychain 账号或搬动其会话目录。

## 4. 数据迁移与失败恢复

1. **识别源版本与所有者。** 盘点 v0.5.9、两版 0.6.0 beta 及当前快照的真实
   设置形状、设备文件与安装记录；缺失、工厂默认空值和用户清空不能混为一谈。
   JSON 与 SQLite 冲突时依据当时的正式 authority/迁移标记判定，不能按最新
   mtime 或“非空优先”猜测；无法判定的项目保留并报告。
2. **备份后转换。** 复用已有安全点和文件发布恢复机制。仅在迁移模块保留
   `customPlatformRootPaths`、`customSkillPlatformPaths`、`customAgentRootPaths`、
   `customSkillScanPaths`、旧 TRAE id 与旧根目录的转换。对历史相对/绝对路径按
   对应版本的语义解析，不能统一去掉最后一段。当前合法自定义路径保留。
3. **原子切换。** 当前数据写入并验证后，删除业务旧键并登记完成；同批删除
   normal reader/writer 的 fallback。文件发布与 SQLite 事务不能伪装成一个原子
   事务，须在中断后先恢复文件操作再核对/登记迁移；不记录部分成功为完成。
4. **覆盖恢复入口。** 启动、备份恢复、旧数据导入走相同转换，不能靠启动时的一次
   marker 让之后恢复的旧配置绕过升级。已部署迁移不改写；仅新增必要版本步骤，
   不以“测试版”推定可以删除旧历史或重新从 1 编号。
5. **安装数据分类处理。** 保留 `4863ebc0` 的真实软链接修复证据；新增历史 copy
   测试夹具，确认包身份、整棵文件树及目标冲突后再迁移。已有目标不覆盖，用户
   外部来源不搬迁，名称和相对资源路径不因迁移改变。正常业务不再接受旧名列表。
6. **回滚与资源。** 切换失败时旧数据/备份可恢复，恢复未完成的域不得进入正常写入。
   代码回退不能替代数据回滚；先退出本任务进程，再按该迁移恢复说明还原记录及
   文件。保留可追溯恢复资料，清理本任务 staging/句柄/锁；不终止用户进程。

现有数据库历史同时有 named `schema_migrations` 和带 checksum 的
`database_migration_history`。新增跨文件步骤应在既有版本管理机制中记录真实
制品/checksum，不能再造第三套 registry，也不能在文件未发布前用 SQL 完成标记
代替验证。具体接入由 foundation 升级所有者与第一批共同落实，后续批次依赖它。

## 5. 分批执行与交付门禁

本表描述依赖和验收；勾选进度只更新 tasks.md。每批先写回归，再完成源码、类型、
迁移、测试和文档的整批修改，静态审查后统一验证。迁移与删除对应业务兼容必须在
同一可交付批次；禁止先删读路径、下一批才补迁移。

| 批次 | 实施范围 | 依赖 | 可验收结果 |
| --- | --- | --- | --- |
| 1. 配置真源 | core AgentSettingsRepository、renderer persistence、settings IPC/store、shared Settings、DB/升级入口；先评审并确定 Antigravity 身份与安装归属表提议 | 旧版本夹具与 authority 清单 | 旧字段/设备 JSON 升级后仅当前 SQLite 键参与业务；Desktop/CLI 读写一致；清空与重启不复活 |
| 2. 路径解析 | shared 平台定义、core paths/inventory、desktop utils/context，以及 MCP/Rules/Plugin 路径调用者 | 1 | 一个当前 resolver；同配置跨入口得到同目录；不按存在性选旧根；有自定义目录时保持不变 |
| 3. Skill 行为 | installer/status/activation、公共 types、preload/IPC、hook/store/弹窗；旧名/复制安装迁移 | 1、2 | 正常完整包 copy/symlink、准确状态、所有权撤回；断链不报成功，权限失败不自动 copy，旧名参数退出业务 |
| 4. Antigravity 能力 | platform/context、供应商 adapter、session、usage、capability declarations | 1 冻结身份，2；Skill 验收依赖 3 | 桌面与 CLI 各自使用确定目录/凭据来源；不得跨产品补结果；每项能力有原生版本与实际验证记录 |
| 5. 其他 Agent 收口 | Kimi 历史根、Cherry 原生 schema；按盘点逐个检查剩余 adapter | 2、3 | 当前目标及支持版本明确；旧数据留在升级边界，第三方旧 schema 不被 PromptHub 偷偷改造 |
| 6. 发布验收 | 真实旧 profile、新 profile、恢复入口、全部受影响调用端、原生 Agent 消费 | 1–5 | 正常链路先过，异常/中断/重启再过；旧行为变异可使回归失败；声明 supported 的产品/OS有对应证据 |

优先完成前三批，形成配置—路径—操作的完整闭环；第四、五批按已冻结身份与实际
原生证据推进，不把未知接口或未测试平台伪装为已适配。第六批前不宣称整体完成。
每个完成批次独立提交，引用该需求与真实验证结果，发布前使用 Refs 而非 Closes。

## 6. 测试与成本

- 配置正常流程：真实 SQLite + 临时设备文件，从旧 profile 升级，经 settings IPC /
  core repository 读取、修改、清空、关闭重开；断言旧键不回写、另一入口立即一致。
  再测冲突、非法 JSON、路径穿越、失败后恢复、跳版本升级与历史备份恢复。
- 路径：默认、自定义、当前环境变量、当前目录缺失、旧目录仍存在、根目录软链接；
  比较 main/core/CLI 的同一结果，断言只读查询不创建平台目录。
- Skill：复用 `skill-public-workflow.test.ts`、`skill-platform-management.test.tsx`、
  `antigravity-skill-migration.test.ts` 的真实 preload/IPC/SQLite/文件夹具；新增断链、
  EPERM 不复制、历史 copy 与旧名迁移、撤回身份冲突，以及失败后原包保全。
  `skill-installer-platform.test.ts` 的自动 copy 成功预期必须改为明确失败。
- 原生能力：复用 Antigravity session/usage 与各平台 fixture；分别验证选定产品的
  成功入口和缺失凭据/进程/未知格式。网络响应夹具不能代替原生消费。
- 变异门禁：跳过配置迁移、重新启用空值旧键 fallback、恢复断链 installed=true、
  恢复 symlink→copy 任一故障，正常/错误流程的真实后置状态必须失败。
- 命令按影响选择：Desktop `vitest run <相关文件>`、`typecheck`、作用域 ESLint；
  core/CLI 对应测试与类型检查；文档 `pnpm spec:test`。历史全局测试类型错误单列，
  不以 focused green 声称全量 green。原生 UI 自动化另遵守 GUI 授权边界。
- 配置迁移与目录解析为 O(A + K)，A 是实际 registry 平台数，K 是设置条目数。
  普通状态扫描 O(I)，I 为请求范围中的安装数；完整包迁移 O(F + B)，F 为文件数、
  B 为字节数。共享一次解析结果，不在 renderer/main/CLI 重复全量扫描；包复制按
  已有单包 staging/恢复设施顺序执行，不预建并发池或额外缓存。

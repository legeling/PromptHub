# PromptHub 本地存储结构

> Superseded on 2026-09-15; archived on 2026-10-21. This is the former file-first design, not current requirements or current verification. See [storage architecture](../../knowledge/structure/storage-architecture.md) and its authoritative foundation contract. Historical body follows unchanged.

> 状态：v0.6 本地存储基础和文件优先运行期 authority 已实现并验证；最终
> 提交与发布状态由 `database-migration-safety` active change 管理。

## 1. 稳定边界

PromptHub 将持久数据按所有权分成五类，不再把所有内容统称为“备份”或
“数据库数据”：

| 类型             | 当前所有者                                 | 可移植性         | 恢复语义              |
| ---------------- | ------------------------------------------ | ---------------- | --------------------- |
| 用户资源         | `data/` 下的版本化 canonical bundle 与对象 | 可选择导出       | 可重建本地目录        |
| 本地目录与索引   | `data/prompthub.db`                        | 不直接复制活跃库 | 从 canonical 资源重建 |
| 设备配置         | `config/`                                  | 仅脱敏后可移植   | 独立恢复              |
| 设备密钥         | OS 安全设施或 `secrets/`                   | 默认不导出       | 重新认证或同设备恢复  |
| 安全点与恢复候选 | `backups/`                                 | 不进入普通同步   | 有界保留、显式恢复    |

自部署 Web 的用户、刷新令牌、租户归属和远端服务状态是服务端数据库权威数据，
不能转换成 Desktop 的本地用户资源文件。SQLite 中的迁移意图、客户端租约、会话
索引等运行状态也保持数据库所有权。

## 2. 当前目录

```text
<PromptHubRoot>/
  data/
    .layout-state.json
    prompthub.db
    prompts/<encoded-resource-id>/
    skills/<encoded-resource-id>/
    rules/<encoded-resource-id>/
    mcp/<encoded-resource-id>/
    plugins/<encoded-resource-id>/
    agents/<encoded-resource-id>/
    generations/<encoded-resource-id>/
    folders/<encoded-resource-id>.json
    tags/<encoded-resource-id>.json
    relations/<encoded-resource-id>.json
    output-formats/<encoded-resource-id>.json
    assets/objects/sha256/<prefix>/<sha256>
    assets/images/                 # 旧逻辑引用兼容期
    assets/videos/                 # 旧逻辑引用兼容期
    operations/journals/
    operations/migrations/
  config/
    app.json
    providers.json
    sync-providers.json
    marketplace-sources.json
    devices/
  secrets/
  backups/
    safety-points/
    recovery/
  cache/
  logs/
```

资源目录名使用稳定 ID 的可逆编码，不使用标题或用户输入直接拼路径。每个目录资源
包含 `manifest.json`，其公共格式为 `prompthub-resource-bundle` v1。manifest 声明
资源类型、稳定 ID、独立 schema 版本、用户 revision、payload 文件、总字节数、
SHA-256、对象引用和 provenance。读取时拒绝 traversal、控制字符、重复路径、
symlink、特殊文件、未声明文件、大小或哈希不一致以及越界清单。

Prompt、Skill、Rule、MCP、Plugin、Agent 和 Generation 使用独立 schema；新增资源
类型通过 registry 注册，不要求同步提升根布局版本。未知较新 schema 必须只读或
fail closed，不能用旧 reader 覆写。

## 3. Canonical 资源完整性

- Prompt bundle 保存当前记录、完整版本链、Tag 引用和媒体对象映射。
- Folder、Tag、Prompt relation 和 output-format item 是独立记录，避免修改一条边时
  重写整个 Prompt 集合。
- Skill bundle 保存完整可移植元数据、版本和受管包文件；`local_repo_path` 是设备
  派生值，不进入 portable identity。
- Rule bundle 保存当前 Markdown 和按时间递增的版本链。
- MCP bundle 不包含明文 `env` 或 header；值写入设备密钥存储，canonical 记录只
  保留绑定引用。
- Plugin bundle 保存可移植元数据、版本和包文件，设备本地安装路径在恢复时重建。
- Agent bundle 保存 PromptHub 管理的 Provider Profile 与模型映射；凭据引用不进入
  portable 内容。外部 Agent 原生会话仍由外部工具所有，除非显式导入。
- Generation bundle 保存 batch manifest、slot 状态和输出对象引用。
- 媒体和包 payload 进入不可变 SHA-256 对象库；重复内容去重，损坏的既有对象、
  源文件变化和 publication race 都必须拒绝。

只复制 canonical `data/` 到新根后，系统能够校验 bundle、重建当前 schema 的
SQLite 目录并比较 Prompt graph hash、资源目录 hash、ID、数量、版本和关系。
设备密钥与服务器权威表不属于这条可移植重建保证。

## 4. 运行期真相源与目录

v0.6 的本地用户资源以 canonical 文件为 authority，SQLite 是可重建的查询目录和
同设备 operational/server-compatible 状态存储。首次切换时 canonical projector 从
一致 SQLite image 与受管文件生成完整 stage，重建后的目录经过只读 reopen、
`PRAGMA quick_check`、迁移历史、domain count 和内容 hash 验证；只有全部条件通过才
发布 authority marker 和新运行期 context。

文件优先切换门禁包括：

1. 所有本地用户资源均有 canonical schema 和生产 projector。
2. renderer 持久状态已迁移到 `config/`、密钥存储或有界 cache，并在浏览器数据清空
   后可重新加载。
3. 从 canonical 文件重建的 SQLite 与当前库在稳定 ID、版本、关系和 hash 上一致。
4. 旧目录或数据库被保留为一个有界安全点。
5. 切换通过 durable journal 原子发布，并能在重启时完成或回滚。
6. 运行期领域写入已改为维护 canonical 资源，不能形成第二套“更新时间较新者获胜”
   的双真相源。

这些条件已在生产启动协调器和领域 mutation wrapper 中实现。切换发生在 renderer
持久状态迁移完成后的重启边界；缺少 marker/旧数据库时安全延后。发布前旧树进入一个
有界 UUID safety point，发布失败继续使用旧 context。SQLite 文件和旧媒体兼容引用
当前仍保留，用于目录查询、同设备状态、降级诊断和显式恢复，不构成第二套 newer-wins
authority。

支持的较旧资源 schema 通过不可变有序 converter 在 durable journal 下原子转换；
转换保留未知 additive 字段和用户 revision。未知较新 schema 只读或 fail closed，旧
客户端不得降级覆写。

## 5. Renderer 持久状态

一次性迁移器只读取 allowlist 中的 legacy key，先校验，再原子发布 canonical 配置和
设备密钥，重新读取确认后才在 renderer 中脱敏，并把完成 marker 写到 renderer 之外。

| renderer 内容                            | 稳定所有者                         |
| ---------------------------------------- | ---------------------------------- |
| 非敏感设置、marketplace sources          | `config/`                          |
| provider、sync、proxy 等凭据             | OS 安全设施或加密 secret store     |
| 本地资源 device ID、recovery path        | 主进程配置与恢复 registry          |
| 可选 self-hosted sync device ID          | `config/devices/renderer.json`     |
| 明确定义为持久的 Prompt variable history | 有界 canonical 配置                |
| UI 选择、筛选、列宽                      | 有版本和容量上限的 LocalStorage    |
| quota、remote catalog                    | 带 TTL 的 cache                    |
| clipboard signature、reload cooldown     | SessionStorage                     |
| legacy Prompt IndexedDB                  | 一次性恢复源，验证导入后按策略退出 |

浏览器数据清空后，用户资源、配置、凭据引用、device identity、marketplace sources、
版本历史和恢复候选仍必须存在；只允许 UI/cache 状态重建。

本地 Plugin projection、MCP binding 和 Agent device configuration 使用由活动存储根
确定性派生的 `device-<32 hex>` 身份。这个身份不依赖账号、登录或同步配置。
`selfHostedDeviceId` 只属于可选的 self-hosted 同步流程，未启用同步时保持 `null`；
配置或更换同步身份不能改变本地资源身份。旧 UUID/desktop 身份文档先按文档内身份完成
有界校验，再通过 canonical publication 无损重挂到存储根身份。
首次 canonical authority 发布和完整便携导出同样直接使用存储根身份；即使从未配置
PromptHub 账号或 self-hosted 同步，MCP bindings 也必须完整进入 checkpoint，且这些
本地操作不得创建或改写 `selfHostedDeviceId`。存在 bindings 但调用方未提供本地资源
身份时，shadow 构建必须在落盘前失败，不能静默省略绑定。

## 6. 根目录迁移

运行进程只绑定一个不可变 `RuntimeStorageContext`。根选择先尊重显式 boot pointer，
再检查默认根；同一进程不得让各 getter 分别选择 canonical 或 legacy 路径。

根目录先分类为 `canonical`、`legacy`、`empty`、`unrelated`、`mixed`、`unsafe` 或
`missing`，再执行 `switch`、`migrate` 或 `overwrite`：

- source 和 target 不能重叠，路径组件不能是 symlink 或特殊文件。
- inventory 有文件数、深度和总字节上限，并计算稳定 digest。
- 复制前检查目标容量和固定 headroom；源在发布成功前不修改。
- 目标先写到 sibling stage，校验文件 digest、SQLite 和 layout state 后原子 rename。
- boot pointer 只在目标发布后更新。
- durable journal 记录每个阶段；启动必须先恢复未完成操作，再打开服务。
- overwrite 的旧 target 作为有界 recovery artifact 保存；普通迁移完成后清理 stage。

## 7. 安全点、恢复与 Portable Snapshot

- 数据库安全点通过真实 SQLite 一致性 image 创建，记录 manifest、字节数和 SHA-256，
  并按数量、年龄和总字节上限清理。
- full restore 在不可见 stage 中准备 DB、文件、配置和领域数据，容量与安全校验通过后
  按 durable journal 发布；任一阶段失败都回滚，不返回 partial success。
- 恢复候选统一登记在有界 registry，旧 MCP sidecar、原始相邻 DB 副本和升级快照不再
  作为无限增长的隐式历史。
- Desktop 不再把上述三类安全数据当作互不相关的无限历史。升级快照、recovery
  artifact 与数据库 safety point 保持各自格式和 owner，但由启动协调器在一个总字节
  预算内选择保留集合；每类最新点、pin 与未完成迁移引用优先于可选历史。
- 应用内升级、目标版本首次启动与紧随其后的布局迁移共享同一个精确版本转换 safety
  point。布局迁移 marker 的有效完整引用也是重试的 safety point，不生成稀疏副本。
- portable ZIP 使用版本化 envelope 和 streaming archive。选择性导出只读取所选域；
  只有完整 durable scope 才能附带完整 canonical checkpoint。
- 完整导出在一个 maintenance intent 内关闭 writer、创建一致 DB image、生成 canonical
  checkpoint、核对 renderer logical envelope 与 canonical inventory，再发布 ZIP。
- 导入在 mutation 前独立验证 ZIP 路径、manifest、hash、容量、canonical/logical 一致性
  和 schema；不匹配时活动数据保持不变。

## 8. 产品拓扑

- Desktop 与本地 CLI 可共享一个本地根，但必须遵守 migration intent、client lease 和
  bounded busy 行为。
- self-hosted Web 使用显式 `DATA_ROOT`，Prompt/Skill/Rule/settings workspace 按用户
  隔离；服务端 auth/tenant 表保持数据库权威。
- Cloudflare D1、官方备份和官方 SaaS 是不同 authority mode，不能把本地 portable
  snapshot payload 当作在线 SaaS 数据模型。

## 9. 兼容范围

- 已验证 `v0.4.7`、`v0.4.8`、`v0.5.1`、`v0.5.2` 历史 SQLite 基线迁移到当前 schema，
  经过 canonical 投影并重新构建目录后仍保留 Prompt 四版历史和 Skill 历史。
- 新于当前 catalog 或资源 schema 的数据 fail closed，不降级重写。
- legacy `.json`、`.phub.gz` 和旧同步 payload 继续走明确兼容入口；它们不定义新的
  canonical 磁盘结构。

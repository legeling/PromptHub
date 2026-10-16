# 0.6.0 客户端数据归属与收敛清单

状态：2026-09-15 源码盘点完成；已选择 SQLite 与文件系统。下列逐表字段和代码证据仍有效，文件权威目标映射是旧方案参考，已被新的数据归属要求替代。
本文件是 [基础层设计](design.md#des-foundation-003-数据与数据库设计) 的明细，执行
[已确认数据归属](specs/foundation/spec.md#fr-foundation-003-data-ownership-and-invariants) 与
[0.6.0 基线要求](specs/foundation/spec.md#client-migration-baseline-060)，不定义第二套迁移规则。
配置字段优先级仍由 [Desktop 设置规范](../desktop-settings-authority-convergence/specs/desktop-settings/spec.md) 负责。

## 盘点范围与处理结论

只检查仓库源码和已有测试，不读取用户 profile、数据库文件、密钥或远端业务数据。
范围为 Desktop/本地 CLI 共用数据库和直接关联的文件；Web 仅用于识别共享表的真正
所有者，不包含 Worker/D1 或服务端改造。当前工作区有未提交变更，清单描述这一源码状态。

此前方案继续使用 `data/prompthub.db`，保留领域化关系表；不拆多套 SQLite、不建万能 JSON
表、不通过删库重建解决历史问题。SQL 资产表作为投影保留；文件包作为用户资产权威；
明确的运行记录留在数据库。物理列是否删改由下面的迁移证据决定，不能只凭命名清理。

整体简化范围与候选模型见 [数据模型评估](design.md#整体数据模型简化评估)。
以下是此前迁移层的约束，不能代替整体模型评估：[基线的简单设计要求](specs/foundation/spec.md#client-migration-baseline-060)：
一个升级入口、一组顺序迁移函数、一张现有历史表；复用现有事务和文件恢复设施。
清单用于查漏，不代表每张表都要改造。先处理已确认的结构不一致、多头写入与数据丢失风险；
现有结构能安全保留的数据继续保留。新增资源格式、拆字段或改调用架构，仅在本次修复确实
需要时实施，不作为引入迁移的整套前置工程。

## 当前目标

按 [最新数据归属要求](specs/foundation/spec.md#fr-foundation-003-data-ownership-and-invariants)，
普通业务表保留为 SQLite 真源；包和媒体保留为文件；settings 在 SQLite 中集中维护。
原先建议把会话批注等 SQL 字段再移成 canonical 文件的动作取消。批注留在数据库，
将它与可重建扫描字段区分即可。canonical_resources 及逐记录 JSON 目录按旧投影体系
审查退役条件，不能在转换验证前删除。配置 JSON、IndexedDB/LocalStorage 为升级输入。

2026-10-15 当前实现：Prompt、Folder、版本、关系和输出格式的业务 repository
已直接使用 SQLite；`canonical-prompt-graph-db.ts` 及普通操作的 JSON 发布调用已移除。
`prompt-sqlite-v1` 保全并合并历史图、复制媒体、保存恢复副本后退役旧目录，目录维护
显式保留 SQL Prompt 数据。Core/Desktop 旧 Markdown workspace 已通过
`prompt-workspace-v1` 启动转换并停止普通操作写回；显式导出使用 cache 工作区。
Web 的历史 data/prompts 与嵌套版本目录已通过独立 web-prompt-workspace-v1
迁移，保留租户归属和 SQL 字段；普通 Web CRUD 不再写 Markdown，显式导出使用 cache。
Agent Provider、Prompt 与 Rule 已按当前证据收敛；Skill/Generation/设置等领域仍未全部转换。下列旧方案表格和代码行号
保留为历史盘点，不能用作当前写入入口。

## 旧方案逐表映射（字段盘点仍有效）

字段来自 `packages/db/src/schema.ts` 及迁移历史建表语句。目标描述覆盖该行全部字段；
混合职责字段在“目标结构”中单列。SQL 名称和 TypeScript DTO 名称不同不代表重复字段，
转换仍由现有 DB adapter/领域 schema 负责。以下列举逻辑表，不包含 SQLite 内部表。

### `prompts`

- 当前字段：`id`, `owner_user_id`, `visibility`, `title`, `description`, `prompt_type`, `system_prompt`, `system_prompt_en`, `user_prompt`, `user_prompt_en`, `variables`, `tags`, `folder_id`, `parent_id`, `sort_order`, `images`, `videos`, `is_favorite`, `is_pinned`, `current_version`, `usage_count`, `source`, `notes`, `last_ai_response`, `created_at`, `updated_at`。
- 唯一所有者：Core Prompt；canonical Prompt 资源。
- 0.6.0 目标结构：保留为查询投影。正文、变量、标签、备注、收藏、置顶、usage_count、last_ai_response、排序均需随资产保全；current_version 必须指向合法内容版本。owner_user_id/visibility 保留来源语义，不能让本地旧 user ID 冒充服务端授权。
- 迁移方式：由真实旧 Prompt/版本联合转换，核对全部字段和媒体；已 canonical 时从资源重建，不以 SQL 覆盖文件。

### `prompt_versions`

- 当前字段：`id`, `prompt_id`, `version`, `system_prompt`, `system_prompt_en`, `user_prompt`, `user_prompt_en`, `variables`, `note`, `ai_response`, `created_at`。
- 唯一所有者：Core Prompt；canonical 版本文件。
- 0.6.0 目标结构：保留为版本目录；id、version、正文、变量、note、ai_response 和 created_at 均不可因重建丢失；唯一键 (prompt_id, version)。
- 迁移方式：原版本号和 ID 保留；缺当前版本属于单独可验证修复，不能统一用 MAX(version) 掩盖所有损坏。

### `prompt_relations`

- 当前字段：`id`, `source_prompt_id`, `target_prompt_id`, `kind`, `note`, `created_at`, `updated_at`。
- 唯一所有者：Core Prompt graph；canonical 关系资源。
- 0.6.0 目标结构：保留有类型的关系投影；端点、kind、note 与稳定 ID 持久保全。
- 迁移方式：同时核对端点存在、自连接限制和 (source,target,kind) 唯一性。

### `prompt_output_format_items`

- 当前字段：`id`, `source_prompt_id`, `target_prompt_id`, `sort_order`, `created_at`, `updated_at`。
- 唯一所有者：Core Prompt graph；canonical 输出格式资源。
- 0.6.0 目标结构：保留有序组合投影；target_prompt_id=NULL 表示自身项，不能用空字符串替代。
- 迁移方式：保留顺序与 NULL 自身项；验证普通唯一键及 self 唯一索引，实际组合输出一致。

### `folders`

- 当前字段：`id`, `owner_user_id`, `visibility`, `name`, `icon`, `parent_id`, `sort_order`, `is_private`, `created_at`, `updated_at`。
- 唯一所有者：Core Folder/Prompt graph；canonical Folder 资源。
- 0.6.0 目标结构：保留层级投影；is_private 与 visibility 不能仅凭名称相似合并，分别保留既有业务语义。
- 迁移方式：保留 ID、父子、顺序、图标和访问元数据；验证删除/移动影响与外键。

### `settings`

- 当前字段：`key`, `value`。
- 唯一所有者：按 key 分配给 Core config 或安全元数据 owner。
- 0.6.0 目标结构：停止作为迁移后的通用 Desktop 权威。key/value 是容器，不能整表当缓存或整表搬进 app.json；详见配置清单。
- 迁移方式：历史输入按已确认优先级转换；master_password 校验材料单独保全；未知 key 留在受控接入记录并明确归属后才清理。

### `skills`

- 当前字段：`id`, `owner_user_id`, `visibility`, `name`, `description`, `content`, `mcp_config`, `protocol_type`, `version`, `author`, `tags`, `is_favorite`, `source_url`, `source_id`, `source_label`, `source_branch`, `source_directory`, `canonical_skill_path`, `logical_name`, `variant_key`, `local_repo_path`, `directory_fingerprint`, `icon_url`, `icon_emoji`, `icon_background`, `category`, `is_builtin`, `registry_slug`, `content_url`, `installed_content_hash`, `installed_directory_fingerprint`, `fingerprint_algorithm`, `source_last_checked_at`, `source_last_error`, `source_binding_state`, `installed_version`, `installed_at`, `updated_from_store_at`, `prerequisites`, `compatibility`, `original_tags`, `safety_level`, `safety_score`, `safety_report`, `safety_scanned_at`, `current_version`, `version_tracking_enabled`, `created_at`, `updated_at`。
- 唯一所有者：Core Skill；SQLite 元数据与来源绑定，当前包为实际文件目录。Web 由服务器 Skill 服务持有元数据和权限，实际包仅按服务器 ID 存于 `data/skill-files/<encoded-id>/files/`，旧 JSON 镜像由版本化迁移退役。
- 0.6.0 目标结构：保留现有表作为结构化元数据权威。名称/逻辑身份、来源绑定、安装基准、用户标签、扫描报告与版本状态保全；local_repo_path 指向唯一受管包或明确的外部绑定，不能作为 portable 身份。mcp_config/protocol_type 不因字段旧就删除。
- 迁移方式：逐包保全 files、skill.json、版本及 hash；目录指纹与来源身份分别核对；旧字段只有证明已转换且无调用方后才能删除。

### `skill_versions`

- 当前字段：`id`, `skill_id`, `version`, `content`, `files_snapshot`, `note`, `created_at`。
- 唯一所有者：Core Skill；SQLite 持有版本身份；正文和包快照由 `skill-payload-files-v1` 迁至 `<skills-root>/.prompthub/versions/<encoded-skill-id>/<encoded-version-id>/`。旧 payload 列保留为 NULL，仅历史输入与隔离 staging 使用旧 codec。
- 0.6.0 目标结构：保留版本目录；files_snapshot 代表包内容，不是仅 SKILL.md 文本。
- 迁移方式：覆盖二进制/编码快照及 schemaVersion 1/2；版本和完整文件库存均一致。

### `rules`

- 当前字段：`owner_user_id`, `id`, `scope`, `platform_id`, `platform_name`, `platform_icon`, `platform_description`, `canonical_file_name`, `description`, `managed_path`, `target_path`, `project_root_path`, `sync_status`, `current_version`, `content_hash`, `created_at`, `updated_at`。
- 唯一所有者：Core Rules；SQLite 元数据与设备部署绑定。Web 按已认证 `owner_user_id` 隔离；空 owner 仅代表 Desktop/CLI 本机集合。
- 0.6.0 目标结构：`(owner_user_id, id)` 联合主键；managed_path 引用 data/rule-files 实际正文。外部工具路径不是另一个业务真源，跨设备导入不得自动部署。
- 迁移方式：schema v6 保留 v5 全部本机行；rule-metadata-v1 转换 Desktop/CLI 历史源，web-rule-metadata-v1 转换旧 Web 租户目录，源树完整保全后退出。catalog 维护保留 SQL。正常 CRUD 不写元数据 JSON。

### `rule_versions`

- 当前字段：`owner_user_id`, `id`, `rule_id`, `version`, `file_path`, `source`, `created_at`。
- 唯一所有者：Core Rules；SQLite 版本元数据，文件系统历史正文。
- 0.6.0 目标结构：主键、规则外键和 ordinal 唯一约束均包含 owner。版本 ID 可以跨用户复用；当前正文不因删除历史而回退。文件引用按稳定身份校验，缺失历史不能静默删除索引。
- 迁移方式：正文与引用、身份、source、顺序一起保全；历史转换不裁剪。SQL/file publication 收据协调失败恢复。实际检查和限制见 implementation 的 Rule 两个批次。

### `users`

- 当前字段：`id`, `username`, `password_hash`, `role`, `created_at`, `updated_at`。
- 唯一所有者：Web 服务端认证 owner；数据库权威。
- 0.6.0 目标结构：服务端保留。客户端共享 schema 中出现此表不等于本地需要第二套账号系统；禁止随 catalog 清空或把 password_hash 放进普通资产包。
- 迁移方式：区分部署产品；本地已有行先保留并查来源，不自动迁到远端账号或删除。

### `refresh_tokens`

- 当前字段：`id`, `user_id`, `token_hash`, `expires_at`, `created_at`。
- 唯一所有者：Web 服务端认证 owner；数据库权威。
- 0.6.0 目标结构：服务端保留令牌 hash/有效期；不作为客户端资产同步。
- 迁移方式：与 users 一同保全关联；本地历史副本的退役须先证实无有效认证用途。

### `user_settings`

- 当前字段：`user_id`, `key`, `value`, `updated_at`。
- 唯一所有者：Web 用户配置 owner；服务端数据库权威。
- 0.6.0 目标结构：按 user_id/key 保存服务端设置，与 Desktop settings 属不同用户边界；正常读写无 JSON 镜像。
- 迁移方式：服务端表结构不变；web-settings-sqlite-v1 在启动时转换文件独有的用户设置，已有 SQL 按原合同优先。原始文件私有恢复副本与 DB 安全点配对，提交后退役 config/settings，失败全部回滚；历史本地行不混入当前桌面用户配置。

### `generation_batches`

- 当前字段：`id`, `request_json`, `status`, `title`, `source_prompt_id`, `provider`, `model`, `requested_count`, `succeeded_count`, `failed_count`, `cancelled_count`, `interrupted_count`, `created_at`, `updated_at`, `completed_at`。
- 唯一所有者：SQLite GenerationDB；Core 协调图片提交，Desktop 运行任务。请求快照只存关系型列未表达的参数、模型 ID/name、变量和参考图标识。
- schema v7 保留旧索引行；generation-sqlite-v1 核对历史 manifest 与索引、完整图片后填充请求快照并退役旧源。无法核对时保留源并报错，不把缺失快照当空任务。
- 任务恢复只在启动时进行，列表只读；运行 attempt 的完整生命周期仍未由当前结构独立建模。

### `generation_outputs`

- 当前字段：`id`, `batch_id`, `slot_index`, `status`, `file_name`, `mime_type`, `byte_size`, `sha256`, `favorite`, `created_at`, `deleted_at`, `error_json`, `revised_prompt`。
- 唯一所有者：SQLite GenerationDB；实际图片在 `data/generations/assets/<batch-id>/<file-name>`，正常读写不再镜像到对象库或缓存。
- 收藏、错误和完整输出引用持久保存；新图片与 SQL 通过 receipt publication 一次提交，SQL 失败撤销图片。备份从 SQL 与图片生成临时包。
- 现有业务没有 deleted_at 写入入口；结构迁移保留该字段，若历史行非空且 manifest 无法表达，迁移明确报告冲突，不静默清除删除信息。

### `agent_provider_profiles`

- 当前字段：`id`, `platform_id`, `name`, `provider_kind`, `protocol`, `endpoint`, `config_json`, `secret_ref`, `source`, `archived`, `created_at`, `updated_at`。
- 唯一所有者：Core Agent Provider；SQLite 领域表；secret_ref 属设备秘密绑定。
- 0.6.0 目标结构：配置及稳定 ID 由 SQLite 持久化。config_json 维持领域 schema；secret_ref 不进入公开导出正文。允许同名 profile，ID 是身份。
- 迁移方式：`agent-provider-sqlite-v1` 在启动开放读写前合并历史包与 SQL；相同 ID 的公开字段和映射不一致时报错保留双方，SQL 既有 secret_ref 原样保留。旧包原字节留在 recovery 后退役；正常读取不再导入包。缺失或不可读 SQL 要求恢复，不能从包重建完整业务库。

### `agent_provider_model_mappings`

- 当前字段：`id`, `provider_profile_id`, `route_key`, `model_id`, `parameters_json`。
- 唯一所有者：Core Agent Provider；SQLite 领域表，与 profile 同一事务。
- 0.6.0 目标结构：持久路由记录，(provider_profile_id,route_key) 唯一；parameters_json 有当前结构。
- 迁移方式：与 profile 一批转换，逐路由核对 model_id 与参数，删除级联一致。

### `agent_provider_snapshots`

- 当前字段：`id`, `platform_id`, `provider_profile_id`, `native_digest`, `redacted_snapshot`, `backup_ref`, `operation`, `result`, `created_at`。
- 唯一所有者：Agent Provider 激活/恢复 owner；受控操作记录。
- 0.6.0 目标结构：继续作为操作审计/恢复元数据保留，不冒充用户内容版本，也不按普通查询缓存丢弃。backup_ref 的恢复文件另有生命周期。
- 迁移方式：核对 redacted_snapshot、native_digest、backup_ref 与真实恢复资产关联，禁止搬出秘密。

### `agent_session_sources`

- 当前字段：`id`, `platform_id`, `root_path`, `adapter_id`, `adapter_version`, `enabled`, `scan_cursor`, `last_status`, `last_scanned_at`, `last_error_code`, `created_at`, `updated_at`。
- 唯一所有者：SQLite `AgentSessionIndexDB`；设备选择与扫描进度由同一来源记录维护。
- 0.6.0 目标结构：保留现有 SQL 表；id/platform_id/root_path/adapter_id/enabled 是设备选择，adapter_version/scan_cursor/last_* 是扫描进度。无需再创建设备 JSON 或拆分重复状态。
- 迁移方式：既有数据已在 SQL，不做内容搬迁。维护重建完整保留来源 ID 与配置；root_path 不跨设备直接启用。

### `agent_session_index`

- 当前字段：`id`, `source_id`, `external_id`, `title`, `project_path`, `created_at`, `updated_at`, `model`, `message_count`, `redacted_preview`, `source_path`, `source_mtime_ms`, `source_size_bytes`, `source_digest`, `source_status`, `tags_json`, `note`, `indexed_at`, `annotation_updated_at`。
- 唯一所有者：外部 Agent 日志为会话正文权威；Core Agent 拥有用户批注。
- 0.6.0 目标结构：保留现有 SQL 表。tags_json/note/annotation_updated_at 与稳定 ID 是持久记录，不生成 canonical 批注副本。扫描只更新原生日志字段；缺失日志标记 missing，保留批注。
- 迁移方式：既有 SQL 无需转写；维护重建保全整表。`source_id/external_id` 是来源作用域身份，不能推断等同于 conversation 的 `agent_id/session_id`，同一 external_id 在不同来源中保持独立。

### `agent_conversation_metadata`

- 当前字段：`id`, `agent_id`, `session_id`, `title`, `project_id`, `project_path`, `tags_json`, `note`, `is_favorite`, `archived_at`, `created_at`, `updated_at`。
- 唯一所有者：SQLite `AgentConversationDB`；Agent 会话批注。
- 0.6.0 目标结构：id、agent_id/session_id、title/project 关联、tags/note/favorite/archived_at、时间均是持久选择。当前 DB-only，不能当 operational 缓存丢弃。
- 迁移方式：保留既有 SQL 稳定身份与数据，不从扫描索引覆盖它，不新增文件副本；维护重建复制完整记录。显式删除后普通启动不得恢复旧批注。

### `agent_conversation_handoffs`

- 当前字段：`id`, `source_agent_id`, `source_session_id`, `target_agent_id`, `project_id`, `project_path`, `transport`, `payload_digest`, `status`, `target_session_id`, `error_code`, `created_at`, `updated_at`。
- 唯一所有者：Agent Conversation 操作 repository；数据库运行记录。
- 0.6.0 目标结构：保留交接计划、payload_digest、结果和错误，不是会话正文或资产历史。
- 迁移方式：保持旧 ID/status，不在升级时重放 launch；重启后不得仅凭 planned 再启动外部 Agent。

### `canonical_resources`

- 当前字段：`resource_type`, `resource_id`, `schema_version`, `revision`, `content_hash`, `manifest_path`, `updated_at`。
- 唯一所有者：Core 领域资源 manifest；DB catalog。
- 0.6.0 目标结构：全字段为索引投影；不是第二份资源 authority。revision 与 schema_version 不混用。
- 迁移方式：由验证过的 canonical manifest 重建，核对路径、资源类型、ID、revision、hash。

### `storage_publication_receipts`

- 字段：`operation_key` 主键、`operation_id`、`committed_at`（Unix 毫秒）。
- 唯一所有者：packages/db 的 SQL 提交凭据；Core 文件 publication 只引用对应操作。
- schema v5 新增，每个操作键只保留最近一次 SQL 提交，与业务修改在同一事务写入；
  不复制正文、元数据或版本。普通纯 SQL CRUD 不使用该表。
- 启动恢复先按 operation ID 判定 SQL 是否已提交，再清理或回滚文件；目录维护必须
  保留凭据。数据库缺失、损坏或旧 SQL 日志无可证明的提交状态时保留恢复材料。

### `sync_targets`

- 当前字段：`id`, `device_id`, `sync_id`, `base_json`, `pending_json`。
- 唯一所有者：Core CausalSyncSession；SQLite 持有共同基线、未决操作身份与条件写观察值。
- 内容边界：只保存同步元数据和资源引用，不存凭据或领域内容。设备间业务备份不能覆盖目的设备的本机状态。
- 迁移方式：schema v8 事务建表；旧库无状态时为空，维护重建保留现有状态，失败回滚并使用既有数据库安全点恢复。
- 验收：两设备删除/冲突、重开、未决提交恢复、迟到本地编辑、晚期 SQL 失败与升级重试。自动同步入口接入仍待完成。

### `schema_migrations`

- 当前字段：`name`, `applied_at`。
- 唯一所有者：DB 迁移 runner；已发布历史。
- 0.6.0 目标结构：保留历史证据，停止扩展第二套无序迁移体系；不是应用版本表。
- 迁移方式：原有 name/applied_at 保留，接入完成后后续变化走统一有序 runner，不能伪造每条旧迁移执行时间。

### `database_migration_history`

- 当前字段：`migration_id`, `name`, `checksum`, `app_version`, `applied_at`, `duration_ms`。
- 唯一所有者：DB 迁移 runner；版本/校验记录。
- 0.6.0 目标结构：保留 1–3 已发历史，后续执行体与 checksum 绑定；app_version 只作诊断。
- 迁移方式：基线登记追加下一有效记录；迁移与成功记录同一 SQL 提交，失败不记录成功。

### `prompts_fts`

- 当前字段：`title`, `description`, `system_prompt`, `user_prompt`, `tags`。
- 唯一所有者：Prompt 字段；SQLite FTS5 派生索引。
- 0.6.0 目标结构：搜索投影可重建，索引及 trigger 在 DB 层统一维护。
- 迁移方式：升级后实际搜索正文/标签并更新再搜索；FTS5 自动生成的 shadow tables 不单独迁移。

## 文件和配置归属

下列路径相对于已绑定用户数据根；源代码通过 runtime paths 解析，不能硬编码用户路径。

| 当前存储 | 唯一所有者与目标 | 迁移/退役方式 |
| --- | --- | --- |
| `data/prompts/`、旧 `workspace/prompts/`，以及 SQL Prompt/Folder/关系 | Core Prompt graph；完整 canonical 资源与历史 | 校验整图、IDs、正文、历史、关系和媒体；旧 workspace 只作明确升级输入，完成后停用旧 writer |
| `data/skills/` 与 Skill 工作区、外部工具目录 | Core Skill 的 SQLite 元数据与实际 `data/skills/<id>/files/` 包 | 旧 bundle、设备绑定和缓存只在版本化迁移读取并保全至 recovery；不在读取时补造缺失文件 |
| `data/rule-files/`、旧 `data/rules/` 与工具规则文件 | Core Rules SQL 元数据；当前/历史正文为文件，Web 按用户目录隔离 | 旧元数据 JSON/index 由一次迁移保全并退役；外部目标只由明确部署修改 |
| `data/mcp/`、旧 `library.json` | Core MCP canonical server/版本；`config/devices/mcp-bindings.json` 拥有设备绑定 | 逐条比对旧 library 与新包，冲突保留；不能以新库非空为由删旧库 |
| SQLite `plugins` / `plugin_versions` 与 `data/plugin-files/` | Core PluginStorage；SQL 元数据、真实当前/历史包文件；本机来源与分发目标保留在本机行 | `plugin-sqlite-v1` 联合迁移旧 `data/plugins/`、library/versions JSON 与 device projection，保留原始恢复副本；市场缓存单独可重建 |
| `data/agents/` Provider 包 | Core Agent Provider 定义；秘密引用属于设备绑定 | 不与第三方 Agent 会话正文混淆；会话批注 canonical 格式尚缺，不把所有 `agents` 文件推定为同种资源 |
| `data/generations/`、生成缓存、`data/assets/objects/` 和 images/videos | Core Generation/媒体资源；缓存由资源重建 | batch/slots 与对象文件一同校验；收藏/删除语义保留；不可只复制 SQL 文件名 |
| SQLite `settings`、旧 `config/app.json` 与浏览器持久状态 | CoreSettingsStore；结构化值只写 SQL | 旧文件与 SQL 行由 settings-sqlite-v1 保全转换；renderer 仅一次导入，普通读取不补值 |
| SQLite AI 设置、旧 `config/providers.json` 与 `config/ai-models.json` | Desktop/CLI 共用 CoreSettingsStore | provider/model/route 只存 SQL，apiKey 只存 vault；历史 AI 备份修复限于升级 |
| SQLite 同步设置、旧 `config/sync-providers.json` | CoreSettingsStore；`SYNC_SETTING_KEYS` | endpoint/开关写 SQL，平铺与嵌套凭据写 vault 引用；不改远端同步协议 |
| SQLite `settings.marketplaceSources` | Core renderer persistence | Skill/MCP/Plugin 来源按稳定 ID 与顺序保全；历史 `config/marketplace-sources.json` 仅由 `renderer-state-sqlite-v1` 读取并退出 |
| SQLite Agent settings 与 `settings.selfHostedDeviceId` | Core 设备配置/身份 owner | Agent 由现有 Agent 迁移保全；同步设备身份由 `renderer-state-sqlite-v1` 导入，历史设备 JSON 不再是日常写入目标 |
| SQLite `settings.recoveryPaths` | Core renderer persistence | 历史 `config/recovery-paths.json` 仅在升级中导入；本机路径不随普通 portable 导出应用到另一设备 |
| `secrets/vault.enc`、OS secret facility、settings 中 `master_password` | 设备秘密/安全元数据 owner | vault 保存秘密；主密码 salt/hash 是验证材料，不是明文密码也不是普通缓存。其迁移与解锁初始化需要独立回归，不能直接删 settings 表 |
| IndexedDB、renderer localStorage | 旧版输入或临时 UI 状态 | 资产/持久设置先转换并验证，再登记；空 renderer 不覆盖现有资产；普通界面选择/弹窗状态无需升级成永久配置 |
| `data/operations/`、`.authority-state.json`、布局状态、数据库迁移 intent/history | Core root/提交恢复 owner 与 DB runner 各管本边界 | 保留提交决定、完成状态与历史；版本轴独立，不能整合成一个应用版本号 |
| 管理安全点、备份、日志、cache | 既有 recovery/backup/log/cache owner | 安全点与 portable 备份不是资源历史；按现有生命周期清理，恢复验证前不删除旧源 |

配置不能靠容器名证明逐字段完成。`renderer-persistence-policy.ts` 的分类集合是已有
可枚举入口，`master_password`、通用 settings key 及 SQL-only 调用方须另行核对。
当前 `networkProxy` 在设置 IPC 中使用，但未列入 APP_SETTING_KEYS；需在设置主题
确定持久配置文档/应用行为并补回归，不可自动套用默认值。未知 key 的处置不得是静默丢弃。

## 已确认差距与调用链证据

### #216 renderer cache migration correction (2026-10-03)

The Desktop legacy collector must extract only `customStoreSources` from each
Skill/MCP/Plugin persisted store before invoking the existing Core migration.
Remote catalog results, translation and view caches are not durable source
configuration and must not consume its snapshot budget. Settings, device identity,
recovery paths and IndexedDB migration status keep their existing conversion.
Core remains responsible for source validation, secret handling, publication and
the completion marker; this correction does not introduce a new storage owner,
schema, migration version or alternate business implementation.

Parsing is linear in legacy bytes, one store at a time; IPC carries only source
configuration rather than another serialized copy of the catalog caches. Invalid
JSON/store shapes fail with the affected key and no raw content in the error.
Legacy storage is retained until publication and hydration succeed, so failure
can be retried without clearing user data. Existing atomic publication rollback
and marker idempotency remain unchanged.

Regression: `apps/desktop/tests/unit/services/renderer-persistence.test.ts`
exercises cache-heavy legacy input through the real Core file publisher, reopen,
malformed stores, and publication-failure retry. The Electron transport is replaced
in the renderer fixture; Core publication and reopened configuration files are real.
It does not establish the reporter's complete historical macOS profile upgrade.
The cache/reopen test stays sequential beyond 50 lines to keep fixture creation,
the original rejection, migration and durable readback visible in one scenario.

Validation on 2026-10-03:

- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/services/renderer-persistence.test.ts tests/unit/main/settings-renderer-persistence-ipc.test.ts`:
  21 tests initially passed; after adding four malformed-shape cases, the affected
  renderer file passed all 13 tests. IPC's unchanged 12 tests retain their result.
- `pnpm --filter @prompthub/core exec vitest run tests/renderer-persistence-migration.test.ts tests/renderer-persistence-ai-file-authority.test.ts`:
  19 passed, including source validation, encrypted credentials, interrupted
  publication, rollback and migration idempotency.
- Desktop source typecheck and focused ESLint passed. A compiler program using
  the Desktop configuration plus the changed renderer test passed with zero
  diagnostics after correcting its existing optional-settings mock assignment.
- Two caches each containing 2 Mi characters (12 MiB of UTF-8 cache text combined)
  reproduce the raw-input rejection and migrate after source extraction. The final
  13-test bridge suite took 166 ms of test time on this host; this is not a
  cross-platform performance guarantee or an Electron startup measurement.
- Real Electron UI, reporter profile, Windows release packaging and full release
  harness were not run. No live profile, external Agent files or remote state changed.

以下保留 2026-09-15 旧设计盘点的证据。表中关于配置去 SQL 化、文件 authority 和投影重建的处理目标已失效；当前处理以本文末尾 BC01–BC08 和 design.md 为准。

| 优先次序 | 当前证据 | 必须收敛的结果 |
| --- | --- | --- |
| 1 | session_index 和 conversation_metadata 已归入 SQL sessions 保全集合；扫描字段与批注仍在现有表中 | 维护重建复制整表；正常扫描只标记 missing，不清除批注。无须迁往文件；原生会话日志保持第三方权威 |
| 2 | `apps/desktop/src/main/ipc/settings.ipc.ts:276` 先读全部 SQL 设置再覆盖 canonical；`:391` 保存仍写 SQL，专门预写 canonical 的是 closeAction | 收敛到已接受的配置 patch/发布入口；迁移完成后去掉 SQL 补值，缺字段要报告契约缺口 |
| 3 | `apps/desktop/src/main/security.ts:11` 的 master_password 仍存在 settings 中 | 设置去 SQL 化之前保全解锁验证材料；不能因为它不在一般 settings allowlist 就清除 |
| 4 | `packages/db/src/init.ts:650` 为 prompts/folders/skills 添加 visibility 时缺少新建 schema 的 CHECK；已发布 beta 同版本不同索引见设计盘点 | 基线检查实际默认值、约束、索引、trigger/FTS；有差异的表通过受控迁移统一，不只补列/改版本号 |
| 5 | `packages/core/src/canonical-metadata-migration.ts:28` 读取时可 publish，并在 canonical 非空时删除旧元数据；MCP/Plugin 的 read 调用此函数 | 搬到一次性升级入口，比较完整资产集合和版本后再退役旧源；日常 read 不再负责迁移/删除 |
| 6 | `apps/desktop/src/main/ipc/prompt.ipc.ts:292` 恢复先 DELETE，再在外层 SQL 事务内调用领域 direct insert，最后 syncWorkspace | 恢复成为受控批次，通过一个提交边界发布整图；不能把嵌套 canonical 写入当作普通 SQL 操作 |
| 7 | `apps/desktop/src/main/services/generation-library.ts:263` 在 SQL index transaction 内调用 canonical materialize；SQL rollback 无法自动恢复外部文件 | 与既有提交协调器收敛，先明确输出/收藏/删除及 attempt 边界，再验证中断恢复 |
| 8 | `packages/core/src/canonical-storage-shadow.ts:480` 保全表要求完整列列表相同，并通过 all() 读取整表 | 旧结构先规范转换再保全；读取/复制按实际行数分批，避免整张会话索引常驻内存；不是新增用户数量限制 |

不要误删合法投影/恢复代码：Desktop database 包装与 `packages/core/src/database.ts`
导出的 PromptDB 已直接来自 db 包，RuleDB 已转换为 SQL/文件提交协调器，SkillDB 已是 SQL/实际包发布协调器；不能只按
类名判断存储权威。shadow builder、catalog projector、受控 restore 内的原始 DB 操作有明确用途。
`skill-repo-reconciliation.ts` 对 local_repo_path 的更新属于设备投影；它本身不等于
另一个 Skill 内容 owner。Web 的原始 DB repository 属服务端边界，不应一律替换为本地文件写入。

## 改造批次与验收

1. **确定并保全当前数据。** 以已完成清单为依据，锁定本批实际需要修改的表/字段及
   历史输入。旧库未知内容、会话批注和密码验证信息先保全；没有确认转换方式的内容不删。
2. **集中修复和升级。** 沿用现有 DB/文件接口，修复已确认的重复写入及约束差异，
   把读取时迁移移入同一启动入口。迁移按顺序执行，验证成功才登记；失败使用现有事务或
   恢复设施。只在必须改变的边界补逻辑，不为统一外观重写全部 repository。
3. **实际验证。** 先验证旧数据升级后的查询、编辑、保存、检索和关闭重开，再验证
   重复启动、跳版本、非法输入及升级中断。涉及投影重建时额外验证用户数据保全；
   新建和升级结构对照包含约束行为，不只比较字段名。

既有验证入口可复用：`database-historical-fixtures.test.ts`、
`database-historical-canonical-rebuild.test.ts`、`database-migration-locks.test.ts`、
Core `renderer-persistence-migration.test.ts` 与 Desktop `idb-migration.test.ts`。
现有测试的模拟边界不等同于完整 Electron 启动；GUI、真实历史客户端及恢复演练仍需各自证据。

退役条件：对应所有读写方已改、历史转换完整、正常读写/重建/恢复验收通过后，才删除
旧格式分支或派生副本。本轮仅盘点与整理规范，任何表和用户文件均未删除。
源码盘点成本线性于相关源文件大小；迁移目标 O(entries + bytes)，资源逐项处理，SQL
采用既有事务与分批复制，不引入第二套备份/锁/调度框架。


## 正常业务路径兼容审查（2026-09-15）

2026-10-14 BC01 修复：Plugin 普通读取已移除迁移/删除动作；Core 启动执行
`migrations/plugin-metadata-v1.ts`，合并独有条目和历史，核对同 ID 元数据及包字节，
保留原始元数据恢复副本后通过现有发布 journal 同批退役旧文件。冲突、缺包、
无主历史及非法源不会被静默丢弃。原清理 helper 和无人调用的 MCP wrapper 已删除。
`plugin-metadata-migration.test.ts` 的 11 项回归与既有 canonical Plugin 的 14 项测试
通过；包含真实 Core initDatabase、两次重开、删除后不复活、注入失败回滚与重试。
Core typecheck 与两项 Desktop 启动回归通过。审查脚本现在运行同一注册测试，
不再依赖已删除 helper。新构建的签名 ARM64 DMG 已通过隔离共存数据的原生界面验收：
两个条目、历史与包内容可读，收藏写入及两次冷启动保留，二进制字节与恢复副本核对通过。
这不代替完整稳定版升级、Windows 或自动恢复重启验收，也不代表 SQLite authority
和因果同步改造完成。
迁移和恢复约定见 `spec/knowledge/behavior/data-recovery.md`。下文保留原始反例。

2026-09-24 实现进度：BC02 的 Renderer CRUD/整图恢复后端 fallback 已移除；BC03 的
IDB 迁移失败、读取错误透传和超时放行已修正并通过定向验证，详见 implementation.md。
这些结果不覆盖完整 Electron 启动或真实历史客户端验收。BC01、BC04–BC08 尚未收敛，
下表保留原始审查证据，不代表所有列出的旧行号仍对应当前源码。

审查标准：历史数据只能在升级、导入、恢复边界转换；正常读写仅使用当前契约。
以下是当前工作区的调用链检查，覆盖 Desktop/Core 的 Prompt、Folder、版本、设置、
Skill、Rule、MCP、Plugin、Agent 配置、Generation 与路径选择。未穷尽所有 UI、
第三方 Agent 协议或远端服务，也不把每个 `legacy`/`fallback` 命中都判为违规。
本轮不修改业务源码；结论用于同一批交付中的迁移与旧实现移除。

| 编号 / 优先级 | 正常入口、触发条件及证据 | 当前影响 | 处理与验收 |
| --- | --- | --- | --- |
| BC01 / P1 | MCP `mcp-library.ts:493`、Plugin `plugin-library/storage.ts:88` 的 read 调用 `canonical-metadata-migration.ts:28`；当前库非空且旧文件存在 | 无集合/版本比较就 unlink 旧库，Plugin 同时把 versions.json 纳入清理；旧库独有数据可能被读取动作删除 | 转入明确迁移入口，逐资源保全/核验；业务 read 无迁移写入或旧源删除。反例见隔离脚本 |
| BC02 / P1 | Renderer `services/database.ts:216,252,652,736` 等 CRUD 在 bridge 方法缺失时进入 IndexedDB；摘要方法 `:205` 还兼容旧 getAll bridge | 缺失/错配接口不报契约错误，反而读取或写入另一份业务库；同一界面方法有两套实现 | 只保留当前 bridge，缺失即报错；IndexedDB 读取代码留给升级入口，去掉正常 CRUD。Web bridge 实现当前契约，不能以旧 web runtime 为由留下旧端点分支 |
| BC03 / P1 | `services/database.ts:1051,1109,1145` 对 bridge 缺失、部分迁移或失败返回与无须迁移相同的 migrated:false；`App.tsx:987–998` 随后继续 fetch | 升级失败/未完成未构成明确业务阻断；同时 `App.tsx:981` 到时会显示 UI。此为源码控制流结论，未启动 GUI 验证所有按钮状态 | 升级结果区分 ready 与失败；失败不进入正常业务读写。不把“下次启动重试”当作本次升级成功 |
| BC04 / P2 | `main/ipc/settings.ipc.ts:276–383` 每次 GET 将旧根字段转换成 customAgents/builtinAgentOverrides，随后合并 canonical；renderer `stores/settings.store.ts:222–291` 再推导旧字段、sync.provider 与当前字段 | 旧字段翻译同时散落 main/renderer，且派生回旧字段继续流转；难以判定空配置是删除还是缺省 | 在数据迁移中一次归一 Agent/同步字段；正常 DTO 一个结构，UI 不再输出旧别名。默认值/合法可选字段不等于版本兼容，不机械删除所有空值处理 |
| BC05 / P2 | `agent-management/agent-settings-repository.ts:164–206` 根据 localAuthority 选择 SQL/配置文件；read 调用 `canonical-agent-device-config.ts:134`，文件缺失则从 DB 发布 | 查询会写配置，存储模式决定同一个设置的业务路径；文件删除可让旧 SQL 值重新生效 | 旧配置转换进当前 SQLite；AgentSettingsRepository 固定读写当前记录，不再 ensure-on-read 或双写 |
| BC06 / P2 | Core `canonical-prompt-graph-db.ts:355`、`canonical-skill-db.ts:84`、`canonical-rule-db.ts:365`、`canonical-agent-provider-db.ts:140`；Generation `generation-library.ts:351` 按 localAuthority 分支 | 日常 create/update 等在 SQL-only 与 canonical publication 两种实现间切换；迁移状态渗透领域逻辑 | 先保全独有文件数据，再按新目标保留 SQLite 业务实现；文件变更保持必要发布。去掉 authority 业务开关，不是把所有判断硬编码为 true |
| BC07 / P2 | Rule `rules-workspace.ts:948–960,1050` → ensureGlobalRuleMaterialized → `:899,912` 读取 legacy history 并初始化版本 | 列表/正文读取承担历史升级，可再次导入旧历史；与合法的外部规则扫描混杂 | 旧历史版本迁移到唯一版本记录；正常列表/读取不查旧 history。明确扫描外部文件和导入仍是产品功能，不能连同它们删除 |
| BC08 / P2 | `runtime-storage-context.ts:345–381` 根据布局和 authority marker 选择数据库/包/媒体/工作区路径，并把模式传给业务；`runtime-paths.ts:133,155,174` 继续分支 | 旧目录选择成为每次业务运行的常态，而非一次性升级输入 | 启动探测只用于迁移规划；成功后返回固定当前路径。旧根扫描仅在升级/恢复入口，不再保留业务级旧路径 fallback |

### 不应机械删除的内容

- `packages/db/src/init.ts` 的历史 ALTER/数据转换、Desktop data-layout migration、
  IndexedDB 历史读取本身属于数据迁移，需要收拢入口，不能直接删掉输入支持。
- `renderer-persistence-migration.ts` 的旧数据解析也属于转换；但仅以 migrate 命名
  不足以合规，例如 renderer `renderer-persistence.ts:184` 还启动长期写文件订阅，
  这些正常写入需与迁移分离并按新 SQLite 设置目标移除。
- Skill `compatibility` 是面向工具/平台的业务字段；UTF-8 与二进制编码是实际文件
  内容表示；当前不同 Provider/Agent 协议是外部契约，不等同于本产品旧版业务实现。
- MCP `mcp-market-reconciliation.ts:109` 缺失安装基准时保护用户外部修改，不能通过
  迁移猜出从未记录的旧 hash。迁移应把它转换成当前结构的明确“基准未知”状态，
  后续按统一冲突处理执行，不新增旧版本专用更新算法。
- 当前 `skills/library-commands.ts` 统一委托 SQL/文件发布，不再按 canonical marker 切换或拒绝正常 CRUD；
  其阻断原则可保留，但完成条件必须切换到已确认的 SQLite + 文件系统目标。

### 测试问题与复核方式

`packages/core/tests/canonical-mcp-library.test.ts:426–445` 构造不同 ID 的旧条目，
却断言 read 后旧 library 被删除且旧条目没有被迁入；这是旧权威选择假设，不是数据
无损迁移的证明。新回归应先覆盖当前数据正常读写，再覆盖新旧各有独有条目、同 ID
不同内容、版本缺失和失败保全，不能只把测试里的 expected 改成新实现输出。

`apps/desktop/tests/unit/services/database.test.ts` 用模拟 IndexedDB 验证正常 CRUD，
等于继续维护旧后端业务。相关用例应改成当前 bridge/SQLite 功能验证，历史 IDB
用例则集中验证数据转换；`idb-migration.test.ts` 已有拒绝非原子导入的保护，可保留
并增加“部分/失败不能进入 ready”的验收。

隔离复核脚本：[compatibility-read-audit.mjs](compatibility-read-audit.mjs)。
执行命令：`node spec/changes/active/foundation-integrity-redesign/compatibility-read-audit.mjs`。
它调用真实迁移辅助函数与临时文件，先检查 current-only 和 source-only，再检查新旧
各有独有条目的保全；失败退出码表示问题复现，不能报告成业务测试通过。
不调用完整 MCP/Plugin service，不运行 Electron，不读取或改动用户 profile。

2026-09-15 实际复核：脚本退出码 1。current-only 与 source-only 两个正常对照通过；
distinct-existing-data 场景中 sourceRead、sourcePreserved、sourceRepresented 均为 false，
确认旧源未读取、未迁入且已删除。临时目录在 finally 中清理，输出 temporaryRootRemoved:true。
BC02–BC08 为源码调用链审查，尚未进行完整业务或 GUI 复现。变更追溯校验及新增文档
链接/锚点检查通过；未运行全量测试，未修改业务实现。


### BC07 explicit Rule history upgrade (2026-10-14)

Normal list/read materialization no longer reads `rule-history`. The versioned `migrations/rule-history-v1.ts` conversion is called by Rules bootstrap at Desktop startup, CLI Rules/workspace boundaries and Rule imports. It preserves exact historical source text under recovery, merges existing histories without migration truncation, and atomically retires source files with publication. Failure prevents the affected entrypoint from proceeding. The 32-case migration suite, related CLI/Desktop checks and signed ARM64 native migration/edit/history/backup/automatic-restore-relaunch flow pass; see implementation.md for evidence and limits. This does not close the broader SQLite authority transition.

### 2026-10-16 Skill payload migration

The migration moves `skills.content` and both Skill version
payload columns to the file owner described in `spec/knowledge/behavior/skills.md`.
Only nullable retired columns remain in SQLite for historical input; after
`skill-payload-files-v1`, triggers prohibit non-null runtime payload writes.
Metadata and version identities remain relational. Real SQLite/file checks pass
for old-data upgrade, two reopens, pre-commit rollback, post-commit receipt recovery,
binary history, linked packages and discovery exclusion. Exact affected checks
and remaining acceptance boundaries are recorded in implementation.md.

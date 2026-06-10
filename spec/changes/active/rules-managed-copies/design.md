# Design

## Overview

Rules 应改成与当前 `data/` 架构一致的“文件真相源、数据库索引、外部文件同步”的结构：

1. **`userData/data/rules/`** 保存规则正文、项目规则副本和版本文本，是 Rules 的业务真相源。
2. **数据库**保存规则列表、状态和查询缓存，可从 `data/rules/` 重建。
3. **外部目标文件**（如 `~/.claude/CLAUDE.md`、某项目目录下 `AGENTS.md`）只作为部署目标和互操作表面，不再是唯一数据源。

这使 Rules 同时具备：

- 类似 Prompt 的正文与版本管理
- 类似 Skill 的本地 canonical 副本与外部平台同步
- 与当前 `userData/data/` 布局一致的备份、迁移、恢复能力

## Affected Areas

- Data model:
- `data/rules/` 作为业务真相源，按全局规则、项目规则和版本目录组织文本数据
- 数据库中的 `rules` / `rule_versions`（后续实现）只承担索引和状态缓存，不应成为正文唯一来源
- `ruleProjects` 不再作为项目规则的长期真相源；项目规则记录应沉淀进 `data/rules/projects/`
- 现有 `KNOWN_RULE_FILE_TEMPLATES` 继续作为全局规则白名单模板，但只负责“可建档规则目标”，不再直接代表正文存储位置

- IPC / API:
- `rules:list` 改为从数据库规则记录生成列表，而不是每次拼模板 + settings 路径
- `rules:read` 改为读数据库正文、版本和同步状态，并返回目标文件存在情况
- `rules:save` 改为先写数据库和 managed copy，再尝试同步外部目标文件
- 新增显式部署/重新部署/从目标文件导入/解决冲突等 IPC 能力

- Filesystem / sync:
- 新增 managed copy 根目录：`<userData>/data/rules/`
- 目录建议按语义分层：`global/<platform>/`、`projects/<slug>__<id>/`、`.versions/<rule-id>/`
- 每条规则保留一个正文文件和一个 `_rule.json` 元数据文件；版本正文放在 `.versions/<rule-id>/NNNN.md`
- 外部目标文件继续放在平台原生位置，但角色降级为 mirror target
- 升级备份、手动 ZIP 导出、WebDAV 同步应覆盖 `data/rules/`；数据库只作为加速层附带备份

- UI / UX:
- 删除 `Current Project` 项
- 项目规则列表只显示用户手动添加的项目目录所对应的规则记录
- 规则详情需要显示三层信息：PromptHub 托管状态、managed copy 状态、外部目标文件状态
- 保存按钮语义变为“保存到 PromptHub”，部署按钮语义变为“同步到目标文件”或“重新部署”
- 历史版本恢复默认只恢复到当前草稿/当前记录，不自动覆写外部目标文件

## Proposed Data Model

### `data/rules/`

建议目录：

- `data/rules/global/<platform>/<canonical-file>`
- `data/rules/global/<platform>/_rule.json`
- `data/rules/projects/<slug>__<id>/AGENTS.md`
- `data/rules/projects/<slug>__<id>/_rule.json`
- `data/rules/.versions/<rule-id>/0001.md`
- `data/rules/.versions/<rule-id>/index.json`

说明：

- 规则正文和版本正文以纯文本形式存盘，符合规则市场、diff、手工恢复和 Finder 直查需求。
- `_rule.json` 保存规则 id、目标路径、同步状态、最近更新时间等轻量元数据。

### 数据库索引层

建议字段：

- `rules`: id、scope、platform_id、managed_copy_path、target_file_path、sync_status、updated_at
- `rule_versions`: rule_id、version、version_file_path、source、created_at
- 注意：这些表是索引层，不是正文唯一来源；`prompthub.db` 丢失后应能从 `data/rules/` 重建。

## Managed Copy Layout

建议遵循现有 `userData/data/` 结构，把 Rules 副本放在：

- `userData/data/rules/<rule-id>/RULE.md`
- `userData/data/rules/<rule-id>/meta.json`（可选）

原因：

- 当前数据布局迁移已把内部持久化资源集中到 `userData/data/`，例如 `data/skills`、`data/assets/images`、`data/assets/videos`
- 规则副本放在 `data/rules/` 能自然进入升级快照、目录迁移、未来 ZIP 导出与人工排查
- 使用纯文本 `RULE.md`，最适合规则市场分发、手工恢复与 diff

## Source of Truth Contract

主从关系必须明确：

1. **`data/rules/` 中的正文文件和版本文件是主真相源**
2. **数据库是规则列表、状态与查询缓存**
3. **外部目标文件是部署目标，不是主真相源**

保存流程：

1. 写 `data/rules/...` 当前正文文件
2. 追加 `.versions/<rule-id>/NNNN.md`
3. 更新 `_rule.json`
4. 尝试同步外部目标文件
5. 更新数据库索引和 `sync_status`

读取流程：

- 默认从 `data/rules/...` 读取
- 若规则尚未建档，首次可从目标文件导入并创建 `data/rules/...`
- 若数据库索引丢失，可从 `data/rules/...` 重建索引
- 若目标文件被外部改动，进入冲突检测而不是静默覆盖

冲突解决流程：

1. 扫描或读取规则时，重新计算 managed copy 与 target file 的内容 hash。
2. 如果两者不同，详情读取返回 managed content、target content 与 `out-of-sync` 状态。
3. UI 展示两边内容，由用户选择要保留哪个版本作为事实来源，并在执行覆盖前二次确认：
   - `use-managed`: 将 PromptHub 托管正文写回外部目标文件。
   - `use-target`: 将外部目标文件导入 PromptHub 托管正文，并追加一条版本快照。
4. 解决完成后重新计算 `sync_status`，更新 `_rule.json` 与数据库索引。

## Backup / Restore Model

### Backup

规则应纳入与 Prompt/Skill 一样的内部备份结构：

- `DatabaseBackup` 新增 `rules?: RuleBackupRecord[]`，作为文件真相源的导出清单与导入载荷

备份时：

- JSON/压缩备份导出 rules 清单和版本内容
- ZIP 导出直接把 `data/rules/` 明文文本副本一起打包，便于人工检查与脱机恢复
- settings snapshot 不再承担规则业务真相源角色

### Restore

恢复时：

- 先恢复 `data/rules/`
- 再恢复或重建数据库索引
- **不自动强制覆写外部目标文件**
- 恢复后如果目标文件存在且匹配，可标记 `synced`
- 如果目标文件缺失或不同，标记为 `target_missing` 或 `conflict`，由用户手动部署

这与当前 Skill 恢复逻辑类似：先把 PromptHub 自己的数据恢复完整，再决定是否重新部署到外部生态。

## Migration Strategy

### From current file-first model

1. 为所有现有全局规则模板和 `ruleProjects` 派生规则记录
2. 删除 `workspace-agents` / `Current Project` 伪规则项，不再生成
3. 对每个现有规则目标：
   - 若目标文件存在，导入正文到数据库
   - 生成初始版本快照，来源使用现有 `create` / `manual-save` / `ai-rewrite` 枚举，不新增 `import-from-disk`
   - 写入 managed copy `RULE.md`
4. 尝试吸收旧版 user data 同级 `rule-history/*.json` 到 `data/rules/.versions/<rule-id>/`
   - 若目标文件存在，当前目标内容作为最新托管正文，legacy history 作为更早版本合并
   - 若目标文件缺失，使用最新 legacy history 恢复托管正文，并保留 `target-missing` 同步状态
   - 旧版来源值只会归一化为现有枚举：`create`、`manual-save`、`ai-rewrite`
5. 迁移完成后，旧 `rule-history` 不再作为主版本来源

## Rule Market Readiness

该方案为未来规则市场预留最关键的能力：

- 市场下载的规则可以直接落为 `data/rules/...` 下的一组文本与元数据文件
- 市场安装包可以只是一份 Markdown 文本或包含 metadata 的轻量包
- “快速替换规则”本质上就是：
  - 写新版本到 DB
  - 写 managed copy
  - 选择性重新部署到目标文件
- 即使外部目标路径暂时不存在，市场下载的规则也已经安全保存在 PromptHub 内部，可稍后绑定和部署

## Tradeoffs

- 选择“data/rules 真相源 + DB 索引 + target file 部署”三层结构，比现在纯文件直写复杂，但这是规则市场、可恢复、跨设备迁移三者同时成立的最低成本方案。
- 文本正文与版本正文落在 `data/rules/` 会增加磁盘文件数量，但这与当前 Prompt/Skill 方向一致，也最符合用户可见、可备份、可手改的产品原则。
- 初期不做实时文件监听，而是用显式加载/保存/部署/冲突检测，能避免复杂度失控，也更符合当前桌面产品的工程节奏。

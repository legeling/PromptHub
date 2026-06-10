# Implementation

## Status

当前这条 change 的核心生命周期目标已基本收口：核心身份模型、数据库约束、商店去重、安装态判定、删除语义、managed 容器命名、自建 Git refresh 稳定性，以及项目/平台/UI 关键回归都已经通过当前定向验证与真实 Electron E2E。长期目录结构与平台激活模型仍保持“统一 variant 容器 + 平台按逻辑名单激活”；`directory_fingerprint` 的生产链路也已从 `SKILL.md` 近似值收口为真正的整目录指纹，`local-dir` store 的整目录导入缺口已补齐。

本轮又确认了两组尚未收口的问题：

- 删除 skill 当前只删数据库记录，不删 PromptHub managed repo 容器，导致用户看到 repo 目录残留 `SKILL.md` / sidecar。
- 自建 Git / Gitea source refresh 后，存在远端 identity 漂移风险，表现为 `Imported` 消失、看起来像重新出现了新条目或新 source。

其中本轮已先收口第一组问题，并同步了新的目录命名决策：

- `My Skills` 删除 skill 时，现在会在删除 DB 记录前清理 PromptHub managed 容器。
- 清理范围仅限 PromptHub `data` 目录中的 managed 容器，不会删除用户原始外部目录。
- 新创建/新导入的 managed 容器目录改为可读格式：`<skill-name>--<short-id>`。
- 旧的纯 `skill.id` 容器目录继续作为 legacy 路径兼容读取。

## Findings Captured Before Implementation

- 当前远端列表会在加载阶段对同名 skill 直接折叠，问题发生在 source 进入 UI 之前。
- 当前安装态判断存在 name-based fallback，会把“另一个来源的同名 skill”错误地标成已安装。
- 当前数据库 `skills` 表对 `LOWER(name)` 存在唯一索引，因此即使 UI 不折叠，也无法并行安装同名实例。
- 在实际启动迁移中，`drop_skill_name_unique_v2` 还暴露出一个底层适配问题：`node-sqlite3-wasm` 的 `prepare()` statement 必须手动 `finalize()`，而现有 `@prompthub/db` 适配层没有对单次查询/执行自动释放，导致前序 migration statement 把后续 `DROP INDEX idx_skills_name_lower` 锁住，报 `SQLite3Error: database table is locked`。
- 当前删除调用链是 `deleteSkill -> ipc skill:delete -> uninstallSkillMdForSkill -> db.delete(id)`，不会调用 repo 清理逻辑；因此删除后 repo 残留是当前实现行为，不是偶发脏数据。
- 当前商店 installed 判定已切到 `source_id`，因此 refresh 后“已导入消失”基本可以收敛为 `source_id` 生成链不稳定，而不是 name-based 旧逻辑回归。
- 用户已明确要求容器目录名不能退化成纯 UID；因此本轮把 managed 容器命名收敛为“skill 名称前缀 + 稳定短后缀”，例如 `writer--7dc211f6`。
- 在继续追 refresh 问题时，又确认 `remoteStoreEntries` 会通过 Zustand persist 持久化缓存；因此历史上已经缓存进去的错误 `source_id` 会在用户手动 refresh 前持续影响 `Imported` 判断。

## White-box Audit Result

### Source Taxonomy Finding

本轮先把 skill 来源从“商店源”扩展为完整生命周期 taxonomy。当前代码里至少有以下入口和出口需要分别建模：

- PromptHub-authored：手工创建、AI 生成后创建。
- Built-in registry：packaged `BUILTIN_SKILL_REGISTRY`。
- Built-in remote stores：Claude Code git source、OpenAI Codex git source、Community / `skills.sh`。
- Custom stores：`marketplace-json`、remote `git-repo`、`local-dir`。
- Local-path `git-repo`：UI 类型是 `git-repo`，但 URL 被识别为本地路径时会走 local-dir loader。
- Direct Git import：Create modal 里粘贴 Git URL 扫描后直接安装，不一定持久化为 store source。
- Local scan import：默认平台目录或用户指定目录扫描导入。
- Project scan import：project root / deploy target 扫描，project 同时可能是来源和分发目标。
- File import / restore：JSON import、PromptHub backup / export restore。
- Internal managed mutation：managed repo 文件编辑、repo sync、store update、version restore、metadata/safety update。
- Outputs/projections：project copy/symlink、platform activation、exports。

结论：此前矩阵主要覆盖“商店 source”主链路；现在已升级为完整来源 taxonomy。后续白盒和测试必须按“入口 -> My Skills managed repo -> 内部 mutation -> 对外 projection -> 可能再次扫描导入”的闭环检查。

### Resolved White-box Failures (This Round)

1. **`skills-sh` entries had no `source_id`**
   - 位置：`apps/desktop/src/renderer/services/skills-sh-store.ts:226-295`
   - 关联入口：`apps/desktop/src/renderer/components/skill/store-remote-sync.ts:451-470`
   - 原问题：`parseSkillsShDetail()` 返回 `RegistrySkill` 时没有填 `source_id`。
   - 但 `loadSkillsShStore()` 最后调用的 `dedupeRegistrySkills(...)` 按 `skill.source_id` 建 `Map`。
   - 影响：多个 `skills-sh` 条目会共享 `undefined` key，被折叠成一个；后续 React key、详情选择、installed 判断也无法稳定按来源实例工作。
   - 本轮修复：为 `skills-sh` 定义稳定 source identity：`sourceType=skills-sh` + `sourceUrl=https://skills.sh` + `skillPath=detailPath`。

2. **Direct Git import selection and imported-state used `slug/source_url`**
   - 位置：`apps/desktop/src/renderer/components/skill/CreateSkillModal.tsx:176-193`、`apps/desktop/src/renderer/components/skill/CreateSkillModal.tsx:520-545`
   - 原问题：direct Git import 的已导入判断使用 `installedGitHubSources.has(skill.source_url)`，选择集合使用 `selectedGitHubSkills` keyed by `skill.slug`。
   - 影响：同一个 Git repository 中若扫描出同 slug / 同名但不同目录或不同 canonical path 的 skill，会出现选择联动、跳过错误或安装态误判。
   - 本轮修复：direct Git import 已改为优先 `source_id`，同时保留 `source_url` 兼容历史已安装记录。

3. **Claude Code Store list grouping still used source-id-only installed state**
   - 位置：`apps/desktop/src/renderer/components/skill/SkillStore.tsx`、`apps/desktop/src/renderer/stores/skill.store.ts`、`apps/desktop/src/renderer/services/skill-store-update.ts`
   - 原问题：详情和更新检查已经有较宽的 canonical identity 匹配，但 store 列表和 store selector 仍然只按当前 `source_id` 分组。
   - 影响：当 Claude Code remote source 刷新后 `source_id` 变化，或历史已安装记录只保留 `content_url` / `source_url` / legacy `registry_slug` 时，列表页会把已导入 skill 放回 Available。
   - 本轮修复：`SkillStore.isSkillInstalled()`、`getRecommendedSkills()`、`getFilteredRegistrySkills()` 统一复用 `findInstalledRegistrySkill()`。
   - 同时收紧 `findInstalledRegistrySkill()` 的 legacy `registry_slug` fallback：如果本地 skill 已有明确 `source_id` / `content_url` / `source_url`，不允许 registry slug fallback 覆盖显式 source mismatch，避免同 slug 不同 branch/source 被误标为已导入。

### Verification Added For Claude Code Installed State

- `apps/desktop/tests/unit/services/skill-store-update.test.ts`
  - 覆盖 legacy install 通过 `content_url` 匹配刷新后的 remote entry。
  - 覆盖同 display name 不同 source 不允许误匹配。
  - 覆盖同 `registry_slug` 但显式 `source_id` 不同不允许 fallback 误匹配。
- `apps/desktop/tests/unit/stores/skill-registry-selectors.test.ts`
  - 覆盖 store selector 的 Installed / Recommended 分组使用 canonical identity。
- `apps/desktop/tests/unit/components/skill-store-installed-state.test.tsx`
  - 黑盒覆盖 Claude Code Store 列表页：历史导入的同一 skill 显示 `Imported`，同 install name 的另一个 package 仍显示可导入。

### Severe Gaps (Must Be Explicitly Tracked)

1. **`local-dir` source is path-aware, not branch-aware**
   - 位置：`apps/desktop/src/renderer/components/skill/store-remote-sync.ts:420-446`
   - 关联入口：`apps/desktop/src/renderer/components/skill/store-remote-sync.ts:506-509`
   - 当前 `local-dir` 的 `source_id` 只由 `sourceType=local-dir`、`sourceUrl=skill.localPath || dirPath`、`skillPath=skill.filePath` 组成。
   - 如果 custom source 类型是 `git-repo`，但 URL 被识别为本地路径，加载阶段同样转入 `loadLocalDirectoryStore(source.url)`，不会把 custom source 的 `branch` / `directory` 纳入 `source_id`。
   - 影响：如果用户对同一路径的本地 Git 仓库反复切换 branch，系统不会把它识别为两个 branch variant，而会把它理解为“同一路径内容发生变化”。
   - 结论：这不是 bug，而是当前模型的明确边界；但必须作为未覆盖组合显式记录，不能对外宣称“所有 branch 组合都已考虑”。

2. **历史 `remoteStoreEntries` 错误 identity 缓存仍可能短暂影响 UI**
   - 位置：`apps/desktop/src/renderer/stores/skill.store.ts` persist state
   - 影响：修复前缓存下来的错误 `source_id` 会在用户首次 refresh 前继续影响 `Imported` 判断。
   - 结论：refresh 后可被纠正，但缓存自动清洗尚未实现。

3. **Project scan is both source and sink**
   - 位置：`apps/desktop/src/renderer/components/skill/SkillProjectsView.tsx`
   - 影响：My Skills 可以分发到 project，project 又可以被扫描并导入 My Skills；如果 identity 和路径边界不清，会出现循环导入、重复实例或把 projection 误认为原始 source。
   - 结论：这是完整生命周期审计必须单独覆盖的边界，不能只用商店安装态测试替代。

### Follow-up Closed: Persisted Remote Store Cache Identity

- 发现：`remoteStoreEntries` 通过 Zustand persist 持久化，但同版本 hydrate
  之前没有清洗缓存条目。修复 source identity 生成后，旧缓存中的错误
  `source_id`、空 entry 或 stale error 仍会在用户首次 refresh 前进入 store，
  继续影响 `Imported` 判断。
- 处理：`skill.store.ts` 新增 remote store cache normalizer，并在 persist
  `merge` 与 `partialize` 中复用。custom `git-repo` 缓存会基于 source 的
  normalized URL / branch / directory 和 skill 的 canonical path 重算
  `source_id`；`local-dir` 与 `marketplace-json` 也按各自 loader identity
  规则重算；空或畸形 entry 不再恢复，stale error 不再持久化。
- 验证：新增 same-version persisted custom git remote cache hydration 回归测试，
  先失败于旧 `error/source_id` 原样恢复，修复后通过。整份
  `skill.store.test.ts` 与 desktop typecheck 已通过。

### Follow-up Closed: Managed Repo Rollback Fingerprint

- 发现：managed repo 的文件编辑和 repo sync 已会在写入后刷新
  `directory_fingerprint`，但版本回滚只恢复 `content/instructions` 并替换文件树，
  没有按替换后的 repo 文件重新计算目录指纹。结果是回滚后 DB 仍可能保存旧
  `directory_fingerprint`，后续本地变更判断和同内容 identity 逻辑会读到 stale 状态。
- 处理：桌面 skill 版本回滚现在先替换目标版本的 managed repo 文件，再基于实际 repo
  path 计算整目录 fingerprint，并只更新 `content`、`instructions` 与
  `directory_fingerprint`，不写入 `source_id`。
- 验证：新增 version rollback 回归测试，断言 rollback 前会创建当前快照版本、
  文件替换后会计算 fingerprint、DB update 不包含 `source_id`，返回结果保留原
  source identity 且带新 `directory_fingerprint`。同时复跑 local repo IPC、
  repo sync 与 version IPC 三组测试。

### Follow-up Closed: Direct Git Import Installed Matching

- 发现：Store 列表与更新检查已统一使用 `findInstalledRegistrySkill()`，可以通过
  `source_id`、`content_url`、`source_url + install_name` 和受限 legacy
  `registry_slug` 判断已导入；但 direct Git import modal 仍维护自己的轻量判断，只看
  `source_id/source_url`。如果用户已有旧安装记录只保存了 `content_url`，同一个 Git
  skill 在 direct import 扫描后仍会显示为可导入。
- 处理：`CreateSkillModal` 的 direct Git scan 结果和默认选中集合改为复用
  `findInstalledRegistrySkill()`，让 direct Git import、persisted git store cache、
  Store 列表和更新检查使用同一 installed 判定语义。
- 验证：新增 direct Git scan 旧 `content_url` 匹配回归测试，先失败于未显示
  `Already Imported` 且默认选中，修复后通过。已复跑整份
  `create-skill-modal.test.tsx`，以及 `skill-store-update` / `skill.store` 中
  installed matcher 与 remote cache 相关目标测试。

### Follow-up Closed: Local Scan / Project Copy Loop Import

- 发现：项目 Skills 分发会把 My Skills 的 managed repo 复制或 symlink 到项目 target
  目录；项目副本再通过 Create Skill 的本地扫描入口扫描时，旧逻辑只比较 scanned
  `localPath` 与已安装 skill 的 `source_url/local_repo_path`。对于 copy 分发，项目副本路径
  与 managed repo 路径不同，因此会被误算为新的可导入来源，形成 deploy -> rescan ->
  duplicate import 循环。
- 处理：Create Skill 本地扫描入口改为复用 `matchScannedSkillToLibrary()`，与项目页扫描
  状态使用同一套身份匹配：`localPath`、`symlinkTargetPath` 和
  `directory_fingerprint` 都能匹配 My Skills。项目 target 副本只要目录指纹与库内 skill
  一致，就显示为 `Already Imported` 且不进入默认导入集合。
- 验证：新增本地扫描项目分发副本回归测试，先失败于 Importable/Selected 计数错误和缺少
  `Already Imported`，修复后通过。复跑 `create-skill-modal.test.tsx` 与
  `skill-scan-status.test.ts`。

### Medium Risks (Design Works, But Not Exhaustively Covered)

1. **Managed container short suffix has an explicit fallback, but remains display/storage naming**
   - 位置：`apps/desktop/src/main/services/skill-installer-repo.ts`
   - 默认 `<short-id>` 仍取 `computeStableTextHash(...).slice(0, 8)`，以保持目录名短且可读。
   - 已补兜底：当 preferred 容器存在且 `.prompthub/source.json` 明确属于另一个
     source / variant 时，新的 managed repo 会自动扩展到 12/16/24/32/48/64 位稳定后缀，
     并把 sidecar `variantKey` 写成实际容器名。
   - 边界：逻辑唯一性仍然依赖 `skill.id` / `source_id`，目录短后缀只作为人类可读的
     storage key，不作为跨系统 identity。

2. **Marketplace JSON source identity mainly relies on `sourceUrl + contentUrl/slug`**
   - 位置：`apps/desktop/src/renderer/components/skill/store-remote-sync.ts:348-365`
   - 影响：若两个不同 marketplace entry 最终拼出相同 `sourceUrl + skillPath`，会被 dedupe 到同一个 `source_id`。
   - 结论：当前已足够覆盖主流 JSON registry，但对高度非规范的第三方 marketplace 仍有灰区。

3. **Local scan import is path-based, not source-id based**
   - 位置：`apps/desktop/src/renderer/components/skill/CreateSkillModal.tsx:127-143`、`apps/desktop/src/renderer/stores/skill.store.ts:890-930`
   - 当前默认平台目录扫描导入使用 `source_url=scanned.localPath`，导入态按 `source_url/local_repo_path` 路径匹配。
   - 影响：对“从外部本地目录导入一次”足够；但跨 backup restore、路径大小写/符号链接、project projection 再扫描等组合还需要测试保护。
   - 结论：这条链路是 path identity，不是 `source_id` identity，需要在完整生命周期测试里单独对待。

4. **Project deploy intentionally projects by logical name**
   - 位置：`apps/desktop/src/renderer/services/project-skill-targets.ts`
   - 当前 project target 路径是 `<targetDir>/<skill.name>`，`getMissingProjectTargetDirs(...)` 也按 `skill.name` 判断。
   - 影响：同名变体在一个 project target 中天然是单激活/替换关系，而不是并存关系。
   - 结论：这符合“对外目录名保持标准 skill 名”的长期方向，但必须有 UI/测试确认“切换变体”语义，避免用户误以为两个同名变体可以在同一 target 并存。

### Confirmed Safe Boundaries (After Current Fixes)

1. **`git-repo` source is branch-aware**
   - 位置：`packages/shared/utils/skill-identity.ts:158-167`
   - `branch` / `directory` / `skillPath` 全部进入 `buildSkillSourceId()`。

2. **Self-hosted Git refresh no longer depends on temp clone roots**
   - 位置：`apps/desktop/src/main/services/skill-installer.ts:675-714`
   - 当前优先基于 `filePath` 计算 repo-relative canonical path，避免临时 `.remote-scan-*` 目录污染 identity。

3. **Store dedupe is source-aware rather than name-aware**
   - 位置：`apps/desktop/src/renderer/services/github-skill-store.ts:169-177`
   - 当前去重基于 `source_id`，而不是 `slug/name`。

4. **Backup/export restore uses skill id for file trees**
   - 位置：`apps/desktop/src/renderer/services/database-backup.ts:246-316`、`apps/desktop/src/renderer/services/database-backup.ts:691-776`
   - export 的 `skillFiles` 以 `skill.id` 为 key；restore 先建立旧 id 到新 id 的映射，再按映射写回文件。
   - 结论：同名 skill 的 backup/restore 主路径不会天然按 name 覆盖；只有兼容 fallback 会尝试按 name 解析旧格式。

5. **Platform install status has activation-state disambiguation**
   - 位置：`apps/desktop/src/main/services/skill-installer-platform.ts:86-121`、`apps/desktop/src/main/services/skill-installer-platform.ts:637-648`
   - 虽然平台目录按 `skill.name` 单激活，但状态判断会额外检查 activation state 的 `skillId`。
   - 结论：同名变体不会因为平台目录存在同名 skill 就全部显示 installed。
   - 验证补强：2026-06-10 已新增同名 inactive variant 负例，平台目录存在
     `writer/SKILL.md` 且 activation 指向 `skill-a` 时，`skill-a` 显示 installed，
     同名 `skill-b` 的 boolean status 与 detail status 均显示未安装。

## Additional Implementation Notes (This Round)

- `apps/desktop/src/renderer/services/skill-source-badges.ts`
  - 新增 `My Skills` 专用来源标签构建逻辑。
  - 卡片和列表默认只显示单一来源标签：Claude Code Store、OpenAI Codex Store、Community Store、自定义商店名、项目导入、本地导入、GitHub 导入、Gitea 导入、Gitee 导入、Git 导入、远程链接导入或本地创建。
  - 不再复用商店 variant badge 里的 `Stable` / `Dev` / branch / directory 解析结果，避免把 `skills/.curated/...`、repo 路径片段或技术来源信息暴露给用户。
  - 后续按用户反馈微调为：`main/master` 默认分支不显示额外标签，非默认 Git 分支显示真实分支名，例如 `dev` 或 `feature/search`。
- `apps/desktop/src/renderer/services/skill-source-channel.ts`
  - 新增远端来源渠道解析，按 `source_url` / `source_label` 区分 GitHub、Gitea、Gitee、普通 Git 与远程链接。
- `apps/desktop/src/renderer/components/skill/detail-utils.ts`
  - 详情页来源元信息继续展示“渠道 + 地址/路径”，并将远端 Git 来源细分到 GitHub / Gitea / Gitee / Git。
- `apps/desktop/src/renderer/components/skill/SkillPreviewPane.tsx`
  - 技能详情预览的描述胶囊改为“来源标签 + 作者 + 用户标签”。
  - 移除 raw `category` 胶囊，避免把 `dev` 这类内部分类显示成用户标签。
  - 用户标签只展示用户实际保留的标签，过滤导入时的 `original_tags`。
- `apps/desktop/src/renderer/stores/settings.store.ts`
  - 新增 `skillListPageSize` 设置项，并通过 Zustand persist 持久化。
  - 可选值收敛为 `10 / 25 / 50 / 100`，默认 `10`；setter、merge 与 migrate 都会把无效历史值规范化回默认值。
- `apps/desktop/src/renderer/components/skill/SkillManager.tsx`
  - `My Skills` 列表/画廊分页读取持久化的 `skillListPageSize`。
  - 用户切换每页数量后立即写入 settings，并把当前页重置到第一页，避免落在不可见页码。
- `apps/desktop/src/renderer/components/skill/SkillStore.tsx` 与 `SkillStoreDetail.tsx`
  - 从自定义商店安装 skill 时，会把用户定义的商店名称写入导入后的 `source_label`，让 `My Skills` 后续能显示商店来源而不是底层仓库路径。
- `apps/desktop/tests/unit/components/skill-view-tags.test.tsx`
  - 补充回归测试，覆盖 OpenAI 商店标签、GitHub/Gitea/Gitee/Git 导入标签、自定义商店标签、本地导入与项目导入。
  - 补充非默认分支来源标签测试，验证 `main` 不显示、非默认分支显示真实分支名。
- `apps/desktop/tests/unit/components/skill-detail-utils.test.ts`
  - 补充详情来源元信息测试，验证 Gitea、Gitee 与普通 Git 来源渠道显示。
- `apps/desktop/tests/unit/components/skill-preview-pane.test.tsx`
  - 补充详情预览胶囊测试，验证不显示 `Dev` 分类，保留来源、作者与用户标签。
- `apps/desktop/tests/unit/stores/settings-desktop-workspace.test.ts`
  - 补充 settings 持久化测试，验证 `skillListPageSize` 会写入 localStorage，且 setter / persisted migrate 会规范化无效值。
- `apps/desktop/tests/integration/components/skill-ui.integration.test.tsx`
  - 补充 `SkillManager` 集成测试，验证列表读取已持久化的每页数量，并在选择新数量时调用 settings setter。

- `apps/desktop/src/renderer/services/skills-sh-store.ts`
  - `parseSkillsShDetail(...)` 现在为 `skills.sh` 条目生成稳定 `source_id`。
  - identity 使用 `sourceType=skills-sh`、`sourceUrl=https://skills.sh`、`skillPath=detailPath`，避免多个 community 条目在 `dedupeRegistrySkills(...)` 中共享 `undefined` key。
  - 同时写入 `source_label=skills.sh` 与 `canonical_skill_path`，让后续来源展示和调试有稳定字段。
- `apps/desktop/src/renderer/components/skill/CreateSkillModal.tsx`
  - direct Git import 的已导入判断从单纯 `source_url` 扩展为优先 `source_id`、兼容 `source_url`。
  - Git scan 结果选择集合从 `slug` 切到稳定 registry selection key，优先使用 `source_id`，避免同 repo 同 slug 不同目录时点击一个条目影响另一个条目。
- 已补充并通过回归测试：
  - `apps/desktop/tests/unit/services/skills-sh-store.test.ts`
    - 验证 `skills.sh` 条目生成稳定 `source_id`
    - 验证同名但不同 owner/repo/detailPath 的 `skills.sh` 条目生成不同 `source_id`
  - `apps/desktop/tests/unit/components/create-skill-modal.test.tsx`
    - 验证 direct Git import 中两个同 slug 不同 `source_id` 条目可以独立选择，取消一个后仍可只导入另一个

- `apps/desktop/src/main/services/skill-installer-repo.ts`
  - 新增 preferred managed container path 逻辑：新写入优先使用 `<skill-name>--<short-id>`。
  - 保留 legacy `skill.id/repo` 路径 helper 供旧数据兼容读取。
  - 新增 `getManagedContainerPathForSkill(...)`，用于在 preferred / legacy / 当前 managed 路径之间解析真实容器。
  - 新增 `deleteManagedVariantContainer(...)`，统一删除整個 PromptHub managed 容器。
- `apps/desktop/src/main/ipc/skill/shared.ts`
  - managed repo 自举与解析改为优先使用 preferred path，但保持 legacy fallback。
- `apps/desktop/src/main/ipc/skill/local-repo-handlers.ts`
  - repo path 回写改为 preferred managed path。
- `apps/desktop/src/main/ipc/skill/crud-handlers.ts`
  - `skill:delete` 现在会在删除 DB 记录前解析并删除 PromptHub managed 容器。
  - 删除前仍会先做平台卸载；容器删除只对 managed 路径生效，不会触碰外部原始目录。
- `apps/desktop/src/main/services/skill-installer.ts`
  - 自建 Git / Gitea 的 `scanRemoteGithub(...)` 现在优先使用 `filePath` 推导 repo-relative canonical path，而不是依赖临时 clone 目录下的绝对 `localPath`。
  - 这样 refresh 时不会再把临时 `.remote-scan-*` 根目录差异带入 `source_directory` / `canonical_skill_path` / `source_id`。
- 已补充并通过回归测试：
  - `apps/desktop/tests/unit/main/skill-installer-repo.test.ts`
    - 验证 managed 容器命名为 `skill-name--短后缀`
    - 验证 repo 与 sidecar 文件落在可读容器目录下
    - 验证 legacy managed repo 路径可继续复用
  - `apps/desktop/tests/unit/main/skill-crud-ipc.test.ts`
    - 验证删除 skill 时会清理 PromptHub managed 容器
    - 验证不会误删外部原始目录
  - `apps/desktop/tests/unit/main/skill-installer.test.ts`
    - 新增自建 Git nested directory 场景，验证 refresh 后 `source_directory` / `canonical_skill_path` 使用 repo-relative 口径
    - 新增“不同临时 clone 根目录下连续 refresh 两次”场景，验证 `source_id` 稳定
    - 新增 `importFromJson` 回归，验证 `source_id` 与来源元数据一起 round-trip 保留
  - `apps/desktop/tests/unit/components/skill-store-remote.test.tsx`
    - 新增自建 Git source refresh 后 `Imported` 状态不消失
  - `apps/desktop/tests/unit/components/skill-i18n-smoke.test.tsx`
    - 修复 settings selector mock 后，重新通过 detail/project/distribution/translation/export 等 UI smoke
  - `apps/desktop/tests/e2e/skill-create-structure.spec.ts`
    - 更新为基于真实 `local_repo_path` 推导 managed 容器，验证 UI 创建 skill 落入新容器结构
  - `apps/desktop/tests/e2e/local-store-source.spec.ts`
    - 更新为基于真实 `local_repo_path` 推导 managed 容器，验证本地 source 安装/更新落入新容器结构
  - `apps/desktop/tests/e2e/backup-restore.spec.ts`
    - 新增 skill `source_id/source_directory/canonical_skill_path` 的 backup/export 与 restore 恢复断言
    - 对齐当前 `data/assets/*` 与 `data/prompts/*.md` 布局，验证 media / prompt / skill files / source identity 一起恢复

## Implementation Notes

- 已在 `packages/db/src/adapter.ts` 为单次执行场景新增 `db.run(sql, ...params)`、`db.get(sql, ...params)`、`db.all(sql, ...params)`，统一使用底层 `prepare()` 后在 `finally` 中自动 `finalize()`。
- 已把 `packages/db/src/init.ts` 中迁移流程的大部分单次 statement 调用改为新的 adapter helpers，避免 migration transaction 内遗留未释放的 statement 锁。
- 已新增回归测试 `apps/desktop/tests/unit/main/database-migration-locks.test.ts`，覆盖：
  - adapter helper 会自动释放单次 statement
  - legacy `idx_skills_name_lower` 在迁移期间可被成功删除，且不会再触发 table lock
- 已完成商店/库内实例级 identity 切换：
  - `RegistrySkill` / `Skill` 新增并持久化 `source_id`
  - `source_id` 成为同名实例并存的主判定键
  - `SkillStore` / `SkillStoreDetail` / `TopBar` / store update path 不再按 `slug/name` 判安装或选中
- 已把 PromptHub managed repo 路径从按 `skill.name` 切换为实例唯一目录保存，避免同名 skill 覆盖本地仓库目录。
- 已把平台安装/卸载/安装状态从按 `skill.name` 切换为按 `skill.id` 调度，并补上基础兼容层。
- 当前代码中一度引入“平台唯一目录名”以避免同名覆盖，但经过结构评审后，已将长期方向收敛为：
  - 进入 My Skills 的所有 skill 都进入统一 variant 容器
  - `copy / symlink` 只决定容器内 `repo/` 的 materialization 方式
  - 外部平台保持按逻辑 skill 名单激活，而不是长期依赖唯一平台目录并存
  - 老目录继续兼容，不做一次性强制迁移
- 已把统一 variant 容器真正落地到主进程 repo 层：
  - 新 managed skill 现在写入 `skills/<instance-key>/repo/`
  - 容器元数据写入 `skills/<instance-key>/.prompthub/source.json` 与 `variant.json`
  - `symlink` 模式只让容器内的 `repo/` 指向外部源目录，不再让整个 skill 根目录变成外部链接
- 已把主要入口收敛到统一容器：
  - `installFromSkillContent`
  - `installFromLocalPath`
  - `installFromGithub`
  - `ensureLocalRepoPath` 的 repo 自举路径
- 已把平台侧从“唯一目录并存”收敛为“逻辑名单激活”：
  - 平台技能目录恢复为 `~/.xxx/skills/<logical-name>/`
  - 当前激活的 variant 通过平台激活映射文件记录
  - 同逻辑名 skill 在 PromptHub 库内可并存，但平台侧一次只激活一个
- 已将上述长期方向同步到当前 change 的 `proposal.md` / `design.md` / `specs/desktop/spec.md`，作为后续代码继续收敛的约束。
- 已修复 `SkillStore` 中 custom source 列表区被隐藏的 UI bug：此前 header 会显示数量，但 `showCatalog` 为 `false` 导致实际卡片列表不渲染。
- 已补充并通过当前回归测试：
  - `apps/desktop/tests/unit/stores/skill.store.test.ts`
  - `apps/desktop/tests/unit/components/skill-store-remote.test.tsx`
  - `apps/desktop/tests/unit/main/skill-installer-platform.test.ts`
  - `apps/desktop/tests/unit/main/skill-installer-repo.test.ts`
  - `apps/desktop/tests/unit/main/skill-installer.test.ts` 中 `installFromGithub` 相关用例
  - `apps/desktop/tests/unit/services/skill-identity.test.ts`
    - 直接验证 `buildSkillSourceId(...)` 在 source / branch / directory / skillPath 维度上的稳定性与区分度
    - 直接验证 `computeDirectoryFingerprint(...)` 会忽略 `.prompthub/` / `.git/` / `node_modules/`，且对真实目录内容变化敏感
  - `apps/desktop/tests/unit/services/github-skill-store.test.ts`
    - 验证同 repo 同名 skill 在不同 branch 下生成不同 `source_id`
    - 验证同 repo 同 branch 下不同目录/路径的同名 skill 会保留为不同变体
    - 验证重复 tree entry 会按 `source_id` 去重
  - `apps/desktop/tests/unit/main/skill-db-source-id.test.ts`
    - 验证同名不同 `source_id` 可共存
    - 验证相同 `source_id` 会被数据库/SkillDB 拒绝
- 在补齐唯一性测试时发现并修复 `packages/db/src/skill.ts` 的更新路径缺陷：
  - 之前 `SkillDB.update()` 只在更新 `name` 时检查重复
  - 导致“仅更新 `source_id`”不会触发唯一性校验
  - 现已改为：只要 `name` 或 `source_id` 任一变化，就按“优先 `source_id`，否则 `name`”执行重复校验
- 已补充并通过真实 Electron E2E：
  - `apps/desktop/tests/e2e/local-store-source.spec.ts`
    - 验证本地目录导入进入 `skills/<id>/repo/`
    - 验证 sidecar `skills/<id>/.prompthub/source.json`
    - 验证 sidecar `skills/<id>/.prompthub/variant.json`
  - `apps/desktop/tests/e2e/skill-create-structure.spec.ts`
    - 验证 UI 手动新建 skill 进入 managed variant container
    - 验证 `skills/<id>/repo/SKILL.md` 与 sidecar 文件落盘
- 已完成 `directory_fingerprint` 生产链路收口：
  - `packages/shared/utils/skill-identity.ts`
    - 指纹算法现在同时支持文本文件与二进制文件字节级哈希
    - 新增 `computeDirectoryFingerprintFromHashes(...)`，用于远端 Git tree 直接按 blob hash 组装目录指纹
  - `apps/desktop/src/renderer/services/github-skill-store.ts`
    - GitHub tree 扫描改为基于 `git/trees` 返回的 blob `sha` 计算真正的整目录指纹
    - 不再把单个 `SKILL.md` 内容 hash 冒充目录指纹
  - `apps/desktop/src/renderer/components/skill/store-remote-sync.ts`
    - marketplace JSON 源在拿不到完整目录时不再伪造 `directory_fingerprint`
    - local-dir 源改为透传主进程扫描得到的真实目录指纹
  - `apps/desktop/src/main/services/skill-installer.ts`
    - `installFromGithub` / `installFromSkillContent` / `scanLocalPreview` 均改为基于真实 repo 文件字节写入 `directory_fingerprint`
  - `apps/desktop/src/main/services/skill-repo-sync.ts`
    - 新增 `computeRepoDirectoryFingerprint(...)`
    - `buildSkillSyncUpdateFromRepo(...)` 现在会在 repo 内容变更时同步回写目录指纹
  - `apps/desktop/src/main/ipc/skill/local-repo-handlers.ts`
    - `syncFromRepo` 以及直接编辑 `SKILL.md` 的写入路径都会刷新 `directory_fingerprint`
  - `packages/core/src/cli/skill-cli-service.ts`
    - CLI 的安装、repo 自举、扫描预览、`syncFromRepo` 也统一接入真实目录指纹
- 已补充并通过 `directory_fingerprint` 回归测试：
  - `apps/desktop/tests/unit/services/skill-identity.test.ts`
    - 新增二进制文件变化会影响目录指纹的断言
  - `apps/desktop/tests/unit/services/github-skill-store.test.ts`
    - 验证远端 Git tree 目录指纹来自 blob hash，而非 `SKILL.md` 内容
  - `apps/desktop/tests/unit/main/skill-repo-sync.test.ts`
    - 验证 repo 同步会回写 `directory_fingerprint`
  - `apps/desktop/tests/unit/main/skill-installer.test.ts`
    - 验证 `scanRemoteGithub` 会透传真实 `directory_fingerprint`
- 已修复 `local-dir` source 安装/更新链路中的真实目录内容丢失问题：
  - 问题调用链：`SkillStore` 本地源安装/更新动作 -> `skill.store.ts` registry install/update 分支 -> 仅 `writeLocalFile("SKILL.md")` 写入 managed repo -> `syncFromRepo` 扫描到的目录只剩单文件 -> `directory_fingerprint` 错误塌缩
  - 根因是 renderer 在 local source 场景下没有把完整 skill 目录 materialize 到 managed repo，而是只写了 `SKILL.md`
  - 现已改为：
    - local source 安装后直接 `saveToRepo(skillId, localDir, "copy")`
    - 随后统一执行 `syncFromRepo(skillId)`
    - local source 更新也走同一整目录同步链路
  - 已补充 `apps/desktop/tests/unit/stores/skill.store.test.ts` 断言 local source 安装/更新会调用 `saveToRepo(...)` 与 `syncFromRepo(...)`
  - 已补充并通过真实 Electron E2E：
    - `apps/desktop/tests/e2e/local-store-same-name-variants.spec.ts`
    - 验证同一 `local-dir` source 下，两份同名 skill 在 `SKILL.md` 完全相同、仅资源文件不同的情况下：
      - 商店列表不会错误折叠
      - 第一份导入后第二份仍可继续导入
      - 导入到 `My Skills` 后两个实例的 `source_id` 与 `directory_fingerprint` 都保持区分
- 已完成 UI 标签与状态 badge 收口：
  - 新增共享 badge 解析层：
    - `apps/desktop/src/renderer/services/skill-variant-badges.ts`
    - 统一从 `source_url` / `source_label` / `source_branch` / `source_directory` / `is_builtin` 推导来源与变体标签
  - 新增共享展示组件：
    - `apps/desktop/src/renderer/components/skill/SkillVariantBadgeList.tsx`
  - 已接入以下入口：
    - `SkillStoreCard`
    - `SkillStoreDetail`
    - `SkillGalleryCard`
    - `SkillListView`
  - 当前可直观看到的 badge 包括：
    - 来源：`Official` / `Community` / `Local` / `Git`
    - 变体：`Stable` / `Dev` / 具体 branch / 目录路径摘要
    - 状态：`Imported` / `Update available`
  - 导入后 `My Skills` 视图采用 best-effort 回显：
    - 优先使用现有字段
    - 缺少持久化 `source_branch` / `source_directory` 时，从 `source_url` 尝试反推
    - 无法可靠推导时只显示稳定来源类型，不伪造 branch / directory
  - 已补充并通过组件测试：
    - `apps/desktop/tests/unit/components/skill-view-tags.test.tsx`
    - `apps/desktop/tests/unit/components/skill-store-remote.test.tsx`
- 已完成 source 元数据持久化收口：
  - `Skill` 现已正式持久化以下字段，而不是只存在于 `RegistrySkill` / renderer 内存态：
    - `source_label`
    - `source_branch`
    - `source_directory`
    - `canonical_skill_path`
  - 已打通的层级：
    - `packages/shared/types/skill.ts`
    - `packages/db/src/schema.ts`
    - `packages/db/src/init.ts`
    - `packages/db/src/skill.ts`
    - `apps/desktop/src/renderer/services/skill-normalize.ts`
    - `apps/desktop/src/renderer/stores/skill.store.ts`
    - `apps/desktop/src/main/services/skill-installer.ts`
    - `apps/desktop/src/main/services/skill-installer-export.ts`
    - `apps/desktop/src/main/services/skill-import-sanitize.ts`
    - `apps/desktop/src/renderer/services/database-backup.ts`
  - 结果：
    - store 导入后的 `My Skills` 现在可以直接读取持久化来源元数据
    - badge 展示不再依赖 URL 反推作为主路径，仅把反推保留为兼容 fallback
    - JSON 导出 / 导入与 backup restore 也会保留这些来源字段
  - 已补充并通过的持久化回归：
    - `apps/desktop/tests/unit/main/skill-db.test.ts`
    - `apps/desktop/tests/unit/main/skill-db-source-id.test.ts`
    - `apps/desktop/tests/unit/main/skill-installer.test.ts`

- 已补齐 `My Skills` 列表级交互：
  - `SkillManager` 从渐进渲染切换为与 prompt 表格一致的页码分页，支持 10/25/50/100 page size，批量选择语义限定为当前页可见项。
  - `SkillGalleryCard` 与 `SkillListView` 接入右键菜单，支持查看详情、收藏/取消收藏、标签管理、平台快速安装与删除。
  - `SkillGalleryCard` 与 `SkillListView` 接入 `application/x-prompthub-tag` drop，侧栏 skill 标签现在可拖拽到卡片/列表行来为目标 skill 添加标签。
  - `SkillListView` 采用更紧凑的行布局：来源 badge 与用户标签合并到同一元信息行，行高估算下调到 72px，右侧平台状态固定宽度靠右，减少分页后列表区域的空白感。
  - `SkillStoreDetail` 对旧 registry 数据补充 `source_id || slug || source_url` 回退，避免旧本地 source 在更新/卸载时传入空 identity。
  - 已补充 `skill.viewDetail`、`skill.paginationSummary` 与 `skill.tagAssigned` 的 7 个 locale 文案，避免右键菜单回退到英文。
  - 修正法语、西语、繁中里平台安装相关的英文/简体残留文案。
  - 已补充并通过集成测试：
    - `apps/desktop/tests/integration/components/skill-ui.integration.test.tsx`
    - 覆盖分页跳转、右键菜单查看详情、中文右键菜单本地化、拖拽标签赋值。

- 已收敛 project deploy 同名变体的 target 语义：
  - 新增 `getProjectTargetDirsRequiringDeployment()`，在判断 `My Skills -> Project`
    部署目标时同时考虑 target 下的 logical name 与 skill identity。
  - 同一 target 下已存在同 identity 的 skill 时继续显示 `Already Imported`，不重复部署。
  - 同一 target 下存在同名但不同 `directory_fingerprint` / 源路径的变体时允许重新部署，
    并将 copy/symlink 调用改为 `{ ifExists: "overwrite" }`，符合实际目录
    `<targetDir>/<skill.name>` 的单激活关系。
  - 已接入入口：
    - `SkillProjectsView`
    - `SkillLibraryImportModal`
    - `SkillFullDetailPage`
  - 已补充并通过的回归：
    - `apps/desktop/tests/unit/services/project-skill-targets.test.ts`
    - `apps/desktop/tests/unit/components/skill-projects-view.test.tsx`

- 已收敛 managed 容器短后缀碰撞兜底：
  - `getManagedContainerPathForSkill()` 现在会读取 preferred 容器的
    `.prompthub/source.json`，只有 metadata 与当前 skill identity 匹配或无法确认时才复用。
  - 如果 preferred `skill-name--8位后缀` 明确属于另一个 source / variant，则自动选择
    更长的稳定后缀路径，例如 `writer--7dc211f6e9ce`。
  - `ensureManagedVariantContainer()`、`saveToLocalRepoBySkillId()` 与
    `saveContentToLocalRepoBySkillId()` 写入 sidecar 时使用实际容器 basename 作为
    `variantKey`，避免 fallback 容器写入旧 8 位 key。
  - 已补充并通过回归：
    - `apps/desktop/tests/unit/main/skill-installer-repo.test.ts`

- 已明确并实现本地路径 git-repo 的 branch-aware identity 边界：
  - 设计结论：
    - `local-dir` 继续表示普通本地目录来源，不读取 git 状态，`source_id` 不包含 branch。
    - `git-repo` 即使 URL 是本地文件路径，也表示用户显式选择了 git source 语义；
      `source_id` 必须包含配置的 `branch`、`directory` 与相对 repo root 的
      `canonical_skill_path`。
    - PromptHub 不隐式探测当前 checkout / detached HEAD / dirty working tree 来改变
      `source_id`，避免用户切分支后已安装身份漂移；dirty 内容差异继续由
      `directory_fingerprint`、本地文件读取和更新检测处理。
  - 修复：
    - persisted `remoteStoreEntries` hydration 现在对本地路径 `git-repo` 保留
      `source_branch` / `source_directory`，并按 `git-repo + repo root + branch +
      directory + skill path` 重算 `source_id`。
    - custom source refresh 对本地路径 `git-repo` 会按配置的 `directory` 扫描子目录；
      生成 registry entry 时保留 branch/directory badge metadata，`source_url` 仍指向
      实际 skill 目录以保持本地文件读取和安装路径语义。
  - 已补充并通过回归：
    - `apps/desktop/tests/unit/stores/skill.store.test.ts`
    - `apps/desktop/tests/unit/components/skill-store-custom-sources.test.tsx`

- 已补齐 local-dir / 本地路径 git-repo 的组合测试：
  - same-version persisted cache hydration 覆盖：
    - `local-dir` 清理误缓存的 `source_branch` / `source_directory`
    - 同一本地 git repo 的 `main` / `dev` 分支生成不同 `source_id`
    - 不同 worktree 路径即使同为 `dev` 分支也生成不同 `source_id`
    - detached/no-branch 本地 git source 保持 `git-repo` identity，但
      `source_branch` 为 `undefined`
  - custom source refresh 覆盖：
    - dirty working tree 内容变化时，`directory_fingerprint` 与 `content` 更新
    - `source_id` 保持稳定，不因未提交内容变化而漂移
  - 已补充并通过回归：
    - `apps/desktop/tests/unit/stores/skill.store.test.ts`
    - `apps/desktop/tests/unit/components/skill-store-custom-sources.test.tsx`

## Expected Verification

- `main/dev` 两个 branch 下同名 skill 应在商店中同时可见。
- 安装 `main` 后，`dev` 条目仍应可安装，并显示为另一变体而非已安装。
- 两个同名实例安装后，本地库与详情页都能区分来源。
- 仅当 source identity 与内容都一致时，系统才允许折叠或强提示重复。
- 从自建 Git / Gitea source 导入的 skill，在手动 refresh source 后仍保持相同 `source_id`，且 `Imported` badge 不消失。
- 从 `My Skills` 删除一个由 PromptHub 托管的 skill 后，对应 managed repo 容器不再残留孤儿 `SKILL.md`。

## Verified So Far

- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/skill-installer-platform.test.ts tests/unit/stores/skill.store.test.ts tests/unit/components/skill-store-remote.test.tsx`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/skill-installer.test.ts --testNamePattern="SkillInstaller.installFromGithub"`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/skill-installer-repo.test.ts tests/unit/main/skill-installer-platform.test.ts tests/unit/stores/skill.store.test.ts tests/unit/components/skill-store-remote.test.tsx`
- `pnpm --filter @prompthub/desktop lint`
- `pnpm --filter @prompthub/desktop typecheck`
- `pnpm --filter @prompthub/desktop test:e2e -- tests/e2e/local-store-source.spec.ts`
- `pnpm --filter @prompthub/desktop test:e2e -- tests/e2e/skill-create-structure.spec.ts`
- `pnpm exec playwright test tests/e2e/local-store-source.spec.ts tests/e2e/skill-create-structure.spec.ts`
- `pnpm exec vitest run tests/unit/services/skill-identity.test.ts tests/unit/services/github-skill-store.test.ts tests/unit/main/skill-db.test.ts tests/unit/main/skill-db-source-id.test.ts`
- `pnpm exec vitest run tests/unit/stores/skill.store.test.ts tests/unit/components/skill-store-remote.test.tsx tests/unit/main/skill-installer-platform.test.ts tests/unit/main/skill-installer-repo.test.ts tests/unit/main/skill-installer.test.ts tests/unit/main/database-migration-locks.test.ts tests/unit/services/skill-identity.test.ts tests/unit/services/github-skill-store.test.ts tests/unit/main/skill-db.test.ts tests/unit/main/skill-db-source-id.test.ts`
- `pnpm exec vitest run tests/unit/services/skill-identity.test.ts tests/unit/services/github-skill-store.test.ts tests/unit/main/skill-repo-sync.test.ts tests/unit/main/skill-installer.test.ts`
- `pnpm exec vitest run tests/unit/stores/skill.store.test.ts`
- `pnpm exec vitest run tests/unit/components/skill-view-tags.test.tsx tests/unit/components/skill-store-remote.test.tsx`
- `pnpm exec vitest run tests/unit/main/skill-db.test.ts tests/unit/main/skill-db-source-id.test.ts tests/unit/main/skill-installer.test.ts`
- `pnpm --filter @prompthub/desktop test:e2e -- tests/e2e/local-store-same-name-variants.spec.ts`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-projects-view.test.tsx tests/unit/components/skill-i18n-smoke.test.tsx tests/unit/main/skill-installer-platform.test.ts tests/unit/main/skill-installer.test.ts tests/unit/main/skill-installer-repo.test.ts tests/unit/main/skill-crud-ipc.test.ts tests/unit/components/skill-store-remote.test.tsx`
- `pnpm --filter @prompthub/desktop test:e2e -- tests/e2e/skill-create-structure.spec.ts tests/e2e/local-store-source.spec.ts tests/e2e/local-store-same-name-variants.spec.ts`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/skill-installer.test.ts --testNamePattern="importFromJson preserves source_id alongside source metadata"`
- `pnpm --filter @prompthub/desktop test:e2e -- tests/e2e/backup-restore.spec.ts`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/services/skills-sh-store.test.ts tests/unit/components/create-skill-modal.test.tsx`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-store-remote.test.tsx`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/skill-view-tags.test.tsx tests/unit/components/skill-store-card.test.tsx tests/unit/components/skill-store-remote.test.tsx tests/unit/components/create-skill-modal.test.tsx`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/skill-view-tags.test.tsx tests/unit/components/skill-detail-utils.test.ts`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/skill-preview-pane.test.tsx tests/unit/components/skill-view-tags.test.tsx tests/unit/components/skill-detail-utils.test.ts`
- `pnpm --filter @prompthub/desktop exec eslint src/renderer/services/skill-source-badges.ts src/renderer/components/skill/SkillGalleryCard.tsx src/renderer/components/skill/SkillListView.tsx src/renderer/components/skill/SkillStore.tsx src/renderer/components/skill/SkillStoreCard.tsx src/renderer/components/skill/SkillStoreDetail.tsx src/renderer/components/skill/SkillScanPreview.tsx src/renderer/components/skill/CreateSkillModal.tsx tests/unit/components/skill-view-tags.test.tsx tests/unit/components/skill-store-card.test.tsx tests/unit/components/skill-store-remote.test.tsx tests/unit/components/create-skill-modal.test.tsx`
- `pnpm --filter @prompthub/desktop exec eslint src/renderer/services/skill-source-channel.ts src/renderer/services/skill-source-badges.ts src/renderer/components/skill/detail-utils.ts tests/unit/components/skill-view-tags.test.tsx tests/unit/components/skill-detail-utils.test.ts`
- `pnpm --filter @prompthub/desktop exec eslint src/renderer/components/skill/SkillPreviewPane.tsx tests/unit/components/skill-preview-pane.test.tsx src/renderer/services/skill-source-channel.ts src/renderer/services/skill-source-badges.ts src/renderer/components/skill/detail-utils.ts tests/unit/components/skill-view-tags.test.tsx tests/unit/components/skill-detail-utils.test.ts`
- `pnpm --filter @prompthub/desktop lint`
- `pnpm --filter @prompthub/desktop typecheck`
- `pnpm --filter @prompthub/desktop test -- --run tests/integration/components/skill-ui.integration.test.tsx tests/unit/components/skill-view-tags.test.tsx tests/unit/components/skill-preview-pane.test.tsx`
- `pnpm --filter @prompthub/desktop exec eslint src/renderer/components/skill/SkillManager.tsx src/renderer/components/skill/SkillGalleryCard.tsx src/renderer/components/skill/SkillListView.tsx src/renderer/components/layout/Sidebar.tsx src/renderer/components/skill/SkillStoreDetail.tsx tests/integration/components/skill-ui.integration.test.tsx`
- `pnpm --filter @prompthub/desktop typecheck`
- `pnpm --filter @prompthub/desktop test -- --run tests/integration/components/skill-ui.integration.test.tsx tests/unit/components/skill-view-tags.test.tsx`
- `pnpm --filter @prompthub/desktop exec eslint src/renderer/components/skill/SkillListView.tsx tests/unit/components/skill-view-tags.test.tsx tests/integration/components/skill-ui.integration.test.tsx`
- `pnpm --filter @prompthub/desktop typecheck`
- `pnpm --filter @prompthub/desktop test -- --run tests/integration/components/skill-ui.integration.test.tsx tests/unit/components/skill-i18n-smoke.test.tsx tests/unit/components/skill-view-tags.test.tsx`
- `pnpm --filter @prompthub/desktop exec eslint tests/integration/components/skill-ui.integration.test.tsx tests/unit/components/skill-i18n-smoke.test.tsx`
- `pnpm --filter @prompthub/desktop typecheck`
- `pnpm --filter @prompthub/desktop test -- --run tests/integration/components/skill-ui.integration.test.tsx tests/unit/components/skill-i18n-smoke.test.tsx tests/unit/stores/settings-desktop-workspace.test.ts`
- `pnpm --filter @prompthub/desktop exec eslint src/renderer/stores/settings.store.ts src/renderer/components/skill/SkillManager.tsx tests/integration/components/skill-ui.integration.test.tsx tests/unit/components/skill-i18n-smoke.test.tsx tests/unit/stores/settings-desktop-workspace.test.ts`
- `pnpm --filter @prompthub/desktop typecheck`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/skill-view-tags.test.tsx tests/unit/components/skill-store-card.test.tsx tests/unit/components/skill-store-remote.test.tsx tests/unit/components/skill-preview-pane.test.tsx`
- `pnpm --filter @prompthub/desktop exec eslint src/renderer/services/skill-source-badges.ts src/renderer/services/skill-variant-badges.ts src/renderer/components/skill/SkillStoreCard.tsx tests/unit/components/skill-view-tags.test.tsx tests/unit/components/skill-store-card.test.tsx tests/unit/components/skill-store-remote.test.tsx`
- `pnpm --filter @prompthub/desktop typecheck`

以上验证均已通过。

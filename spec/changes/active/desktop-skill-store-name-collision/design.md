# Design

## Current Behavior Summary

问题链路：

`remote source load -> dedupeRegistrySkills(by slug + install_name) -> SkillStore.isSkillInstalled(by slug/name) -> SkillDB.create(by name unique) -> 同名 skill 被隐藏或无法并存`

当前至少有四个地方会把不同来源的同名 skill 误当成同一个：

1. `github-skill-store.ts` / `store-remote-sync.ts` 的 `dedupeRegistrySkills()`
2. `SkillStore.tsx` 的 `isSkillInstalled()`
3. `SkillStoreDetail.tsx` 中 `registry_slug === skill.slug || item.name === skill.name`
4. `SkillDB.create()` + `skills(LOWER(name))` 唯一索引

## Root Cause

系统把“用户看到的名字”误当成“实例身份”。

但在商店语义里，至少有三层概念：

- `display identity`: 用户看到的名字、描述、标签
- `source identity`: 它来自哪个 source / branch / directory / path
- `content identity`: 它当前整个 skill 目录的实际内容

当前实现只保留了 display identity，导致不同来源与不同内容都被折叠。

## Recommended Model

### 1. RegistrySkill 增加稳定来源身份

建议新增字段：

- `source_id: string`
- `source_label?: string`
- `source_branch?: string`
- `source_directory?: string`
- `directory_fingerprint?: string`
- `canonical_skill_path?: string`

其中：

- `source_id` 是 UI 缓存、详情选中、安装映射、更新判断的核心键
- `slug` 只保留为“商店内可读标识”，不再承担全局唯一职责

推荐 `source_id` 生成规则：

`sha256(sourceType + normalizedSourceUrl + branch + directory + canonicalSkillPathOrContentUrl)`

### 2. 全目录指纹而不是单文件指纹

当前系统并不只是管理单文件 skill，而是目录模型：

- `Skill` 有 `local_repo_path`
- 主进程支持列出、读取、写入 skill repo 内文件
- `skill_versions` 已支持 `files_snapshot`

因此“两个 skill 是否完全相同”的判断不能只看 `SKILL.md`，而应基于整个目录：

- 递归列出 skill 目录中的所有纳管文件
- 过滤 Git 元数据、系统噪音文件和临时文件
- 对每个文件做路径标准化与内容标准化
- 形成稳定排序的 manifest
- 对 manifest 求哈希，生成 `directory_fingerprint`

推荐纳管字段：

- `relativePath`
- `fileType`
- `normalizedContentHash`

推荐默认排除：

- `.git/**`
- `.DS_Store`
- `node_modules/**`
- 常见构建缓存目录
- 编辑器临时文件

### 3. 远端去重策略调整

保留两级去重：

- 第一级：按 `source_id` 去重，避免同一个 source 被重复收集
- 第二级：仅在 `source_id` 不同但 `directory_fingerprint` 相同，且用户来自 mirror / nested registry 时，标记为 `duplicateContentOf`，而不是直接删除

即：

- “整个目录完全相同”允许折叠或弱提示
- “同名但不同内容”绝不折叠

### 4. 本地 Skill 安装实例模型调整

数据库建议新增：

- `source_id TEXT`
- `install_variant_label TEXT` 或 `source_label TEXT`

并把唯一约束从：

- `UNIQUE LOWER(name)`

改为更合理的实例约束之一：

- 方案 A：不对 name 做唯一约束，仅对 `source_id` 做唯一约束
- 方案 B：允许 `(LOWER(name), source_id)` 唯一

推荐方案 A：

- `name` 是展示名，不应承担唯一键职责
- `source_id` 更符合“安装的是哪一个来源实例”

### 4.1 长期磁盘结构建议

这是一个长期结构问题，需要同时满足：

- 用户看得懂
- 同名 skill 可并存
- 与现有用户目录兼容
- 不要求一次性重排历史 data

推荐最终目标结构：

```text
<data-root>/skills/
  <logical-skill-name>/
    variants/
      <variant-key>/
        SKILL.md
        ...other files
        .prompthub/source.json
    .prompthub/current.json
    .prompthub/active-platforms.json
```

其中：

- `<logical-skill-name>` = 用户认知中的 skill 逻辑名，优先 `install_name || name || slug`
- `<variant-key>` = 可读来源标签 + 稳定短哈希，例如 `icelemon-dev--9bd1a77e`
- `source.json` 记录 source 元信息、来源 URL、branch、directory、`source_id`、`directory_fingerprint`
- `active-platforms.json` 记录每个平台当前激活的是哪个变体
- `current.json` 记录 PromptHub UI 默认选择的变体

### 4.2 为什么不推荐“按来源作为顶层目录”

不推荐：

```text
skills/
  <source>/
    <skill-name>/
```

原因：

- 用户真正关心的是“writer 这个 skill 的不同变体”，不是“某个 source 下面恰好有个 writer”
- 同一个 source 下还可能有 branch / directory / nested path，source 不是足够稳定的目录层级
- 按 source 分顶层后，同名 skill 会被拆散，用户不容易理解当前有哪些变体

### 4.3 为什么不推荐“一次性切到全新目录结构”

虽然上面的目标结构更清晰，但对现有用户直接切过去成本太高：

- 现有 managed repo 路径会整体变化
- 现有平台软链接或 copy 目录需要全部重建
- 用户可能已经依赖当前 data 目录路径做备份、脚本同步、外部编辑
- 历史 skill 需要统一归组到 `<logical-skill-name>/variants/*`，迁移过程复杂且容易中断

因此推荐采用“两阶段”策略，而不是一步到位。

### 4.4 渐进迁移策略

#### Phase 1：兼容优先（当前推荐默认）

- 进入 My Skills 的所有 skill，都统一进入同一套 variant 容器模型
- 不要求历史目录立刻改名或归组
- 数据库以 `source_id` + `directory_fingerprint` 为实例索引主轴
- UI 以“逻辑名 + 来源标签”组织展示
- 平台侧把“同逻辑名只能激活一个变体”作为显式规则

当前推荐的统一容器形态是：

```text
<data-root>/skills/
  <instance-key>/
    repo/
      SKILL.md
      ...other files
    .prompthub/
      source.json
      variant.json
```

其中 `<instance-key>` 可以是：

- 历史目录：原路径保留，并在内部逐步补 `repo/` / `.prompthub/` 兼容层
- 新目录：`<logical-name>--<short-source-hash>` 或现有实例 id 派生目录

关键点：

- 不是“只有 PromptHub 自己托管的 skill 才用这个结构”
- 而是“只要一个 skill 进入 My Skills，就有一个统一 variant 容器”
- `copy / symlink` 只决定这个容器里的 `repo/` 是真实复制目录，还是指向外部源目录的符号链接

这样做的重点不是“目录最优雅”，而是：

- 历史用户无需大迁移
- 同名 skill 不会覆盖
- 新旧结构可共存
- 所有进入 My Skills 的 skill 都有统一形态，后续好演进

#### Phase 2：目标结构收敛（后续版本、用户可感知迁移）

- 当系统已经稳定掌握 `source_id` / `directory_fingerprint` / 逻辑名映射后
- 再引入后台迁移器，把实例目录逐步收敛到 `<logical-skill-name>/variants/<variant-key>`
- 迁移必须满足：
  - 可中断恢复
  - 保留旧路径兼容层或重定向记录
  - 自动修复平台安装映射
  - 允许用户延后迁移

### 4.5 平台安装结构建议

平台侧不建议默认允许“同逻辑名多个变体同时激活”。

推荐规则：

- PromptHub 内部：允许同名变体并存
- 外部平台：同一个逻辑 skill 名，一次只激活一个变体

因此平台目录保持平台兼容优先：

```text
~/.claude/skills/<logical-skill-name>/
```

安装新变体时：

1. 检测当前平台该逻辑名是否已有激活版本
2. 若已有，则提示“切换平台当前激活版本”
3. 用户确认后，替换平台目录内容或软链接目标
4. 更新 PromptHub 内部 `active-platforms.json`

不建议把平台目录默认写成：

```text
~/.claude/skills/<logical-name>--<variant-key>/
```

因为部分平台生态长期假设目录名与 skill 逻辑名 / frontmatter `name` 对应，这会引入兼容不确定性。

### 4.6 还需要纳入模型的长期场景

除了“同名 skill 并存”本身，还必须一起考虑以下长期场景，否则结构很快又会失配：

- PromptHub 自己维护官方 skill 商店
- 同一个逻辑 skill 针对不同平台存在轻微变体
- 用户直接在 PromptHub 内创建一个全新的 skill
- 用户从本地目录 / 项目目录导入 skill 到 My Skills
- 项目级部署继续支持 `copy / symlink`
- 导出、备份、恢复后必须保留变体关系与平台激活关系

这些场景要求我们把“逻辑 skill”、“来源变体”、“平台投影视图”分开建模，而不是继续把所有事情塞进一个 `Skill.name`。

### 4.7 建议的长期概念模型

建议把一个 skill 体系拆成三层：

1. `Logical Skill`

- 用户认知中的 skill 家族，例如 `writer`
- 决定平台兼容名、商店分组、默认展示聚合

2. `Variant`

- 同一个逻辑 skill 下的一个具体来源实例
- 例如：
  - `official-main`
  - `icelemon-dev`
  - `local-authored`
  - `project-linked`
- 由 `source_id` 唯一标识

3. `Platform Projection`

- 某个 variant 在特定平台上的投影视图
- 用于处理“Claude / Cursor / Windsurf 只差少量 frontmatter、说明文本或辅助文件”的情况
- 平台投影不应强行膨胀成一个全新的逻辑 skill，也不应污染 variant 的 canonical repo

### 4.8 推荐的长期目录语义

平台 overlay 目前只作为未来预留能力，不作为当前结构设计重点。

因此当前主结构先围绕：

- logical skill
- variant
- canonical repo
- active platform mapping

进行设计；overlay 只要求未来可插入，不要求现在必须落地。

在长期目标结构中，可以为每个 variant 预留平台相关内容作为 overlay 或 projection：

```text
<data-root>/skills/
  <logical-skill-name>/
    variants/
      <variant-key>/
        repo/
          SKILL.md
          ...shared files
        overlays/
          claude/
            SKILL.md                # optional override / patch input
          cursor/
            SKILL.md
        .prompthub/
          variant.json
          source.json
    .prompthub/
      current.json
      active-platforms.json
```

说明：

- `repo/` 是该 variant 的 canonical source-of-truth
- `overlays/<platform>/` 只存“与 canonical repo 不同的最小平台差异”
- 若某平台没有特殊差异，则直接使用 `repo/`
- `active-platforms.json` 记录每个平台当前激活哪个 variant，以及是否使用特定 projection

但在当前阶段，完全可以先不创建 `overlays/` 目录，只保留将来扩展位。

### 4.9 对“用户在 PromptHub 内创建 skill”的建议

用户在 PromptHub 内新建 skill 时，不应把它视为“无来源的例外数据”，而应直接成为一个合法 variant。

推荐规则：

- 自动创建一个 `Logical Skill`
- 自动创建一个默认 variant，例如：
  - `local-authored--<short-id>`
- `source.type = local-authored`
- 该 variant 没有远端更新来源，但仍有完整 `source.json`
- 后续如果用户把这个 skill 发布到自己的官方商店，或 fork 出平台特化版，都应在这个逻辑 skill 下新增 variant，而不是重建一个无关 skill

### 4.10 对“官方商店 + 平台轻微变体”的建议

未来如果 PromptHub 自己维护官方 skill 商店，建议商店条目以“逻辑 skill + variant + optional platform overlays”组织，而不是把每个平台版本直接发布成完全不同的 skill 名。

例如不要：

- `writer-claude`
- `writer-cursor`

而应是：

- `logicalName = writer`
- `variant = official-main`
- `overlays.claude = {...}`
- `overlays.cursor = {...}`

但这里的 overlay 明确是“少量差异的预留能力”，不是当前主结构的核心。

当前优先级仍然是：

- 同名 variant 可并存
- 历史目录可迁移
- 平台激活关系清晰

这样才能同时满足：

- 用户认知上仍然是同一个 skill
- 商店内不会爆炸成大量名字相近的条目
- 平台安装时能正确 materialize 成对应平台内容

### 4.11 对 copy / symlink 的建议语义

`copy / symlink` 不应该改变 canonical store 的结构，只应该影响“某次分发”的 materialization 方式。

建议统一语义：

#### A. 导入到 My Skills（从外部目录进入 PromptHub）

- 不管 `copy` 还是 `symlink`，都必须先创建统一 variant 容器
- 默认：`copy`
- 原因：
  - 便于备份
  - 便于后续平台分发
  - 不依赖外部目录一直存在
- 只有用户显式选择时才允许 `symlink`
- 若使用 `symlink`，链接目标放在容器内部的 `repo/`，而不是让整个 variant 根目录语义混乱

即：

```text
skills/<instance-key>/repo -> /external/source/dir
```

而不是：

```text
skills/<instance-key> -> /external/source/dir
```

这样 `.prompthub/source.json`、`variant.json`、未来的本地元数据仍然可以稳定放在容器内。

#### B. 从 My Skills 导入到项目目录

- `copy`：把当前 variant（必要时叠加 platform overlay）复制到项目目标目录
- `symlink`：把项目目录链接到当前 variant 的 materialized 结果
- 当前阶段如果没有平台 overlay，默认 materialized 结果就是 variant 容器内的 `repo/`
- 注意：如果未来存在平台 overlay，symlink 目标不能简单指向 canonical `repo/`，而应指向 materialized 目录或明确不支持该场景

#### C. 安装到外部平台

- `copy` / `symlink` 只是平台目录 materialization 的实现方式
- 平台当前激活的是哪个 variant，由 `active-platforms.json` 决定
- 它不应该回写改变 variant 的 canonical source 身份

### 4.12 还没完全落地但必须现在考虑的边界

以下问题如果不在结构层先想清楚，后面会反复返工：

- 用户把官方 skill 安装后又本地修改，这个实例是“脱离上游的 fork”还是“仍然跟踪更新的 dirty variant”？
- 用户重命名逻辑 skill 时，是否同时重命名平台兼容名？
- 两个 variant 整个目录相同但平台 overlay 不同，是否视为相同内容？当前阶段不是重点；若未来正式引入 overlay，建议把 projection 也视为内容边界的一部分
- 备份/恢复时，是否把 `active-platforms.json`、`source.json`、overlay 一起视为 canonical data？建议是
- 导出为 zip / SKILL.md / 发布到官方商店时，导出的单位是“逻辑 skill”“单个 variant”还是“逻辑 skill + 全部 variants”？建议三个都支持，但默认导出单个 variant

### 5. 安装态与更新态重算

安装态判断改为：

- 优先匹配 `skill.source_id === registrySkill.source_id`
- 其次匹配“规范化 source 元信息相等”
- 最后才做弱匹配提示，不再直接用 `name` 判 installed

更新态判断改为：

- 只在 source identity 对应的已安装实例上检查更新
- 若同名但不同 source，仅显示 `another variant installed`

### 6. UI 方案

#### 列表

- 不再把 `installed` 和 `recommended` 做互斥分桶过滤
- 改为统一数据集展示，卡片上用 badge 表达状态

badge 建议：

- `Installed`
- `Update available`
- `Another variant installed`
- `Duplicate content`

#### 卡片标签

卡片副标题下增加来源 chips：

- source 名称
- branch
- directory
- 作者

### 6.1 本轮 UI 收口策略

本轮先做最小但一致的可视化收口，不改动底层 identity 模型：

- 新增一个共享的 variant badge 解析层，统一从 `RegistrySkill` / `Skill` 推导：
  - 来源标签：`Official` / `Community` / `Local` / `Git`
  - 变体标签：`Stable` / `Dev` / `Branch:<name>` / `Dir:<path>`
  - 状态标签：`Installed` / `Update available`
- badge 解析优先使用已有字段：
  - `source_url`
  - `source_label`
  - `source_branch`
  - `source_directory`
  - `registry_slug`
  - `is_builtin`
- 组件复用策略：
  - 商店卡片 `SkillStoreCard`
  - 商店详情 `SkillStoreDetail`
  - 我的技能 gallery `SkillGalleryCard`
  - 我的技能 list `SkillListView`
  - 以上四处共用一套 badge 数据与样式映射，避免每处单独判断
- 本轮不做：
  - “同名其它已安装变体列表” 的详情页增强
  - “Duplicate content” 弱提示
  - 统一列表替代 Installed/Available 双分区

### 6.2 变体标签判定规则

- 来源类型：
  - `local-dir` 或本地路径 -> `Local`
  - `skills.sh` / 社区 marketplace -> `Community`
  - 内置 curated / 官方 registry -> `Official`
  - 其他 git / marketplace / self-hosted repo -> `Git`
- 分支标签：
  - `main` / `master` / `stable` / `release` -> `Stable`
  - `dev` / `develop` / `beta` / `next` / `canary` / `nightly` / `preview` / `alpha` -> `Dev`
  - 其他 branch -> 直接显示 branch 名
- 目录标签：
  - 只有存在 `source_directory` 时展示
  - 长目录只显示末段 + 保留完整 title

### 6.3 我的技能来源回显策略

导入后的 `Skill` 记录目前未持久化 `source_label` / `source_branch` / `source_directory`，因此本轮采用 best-effort 回显：

- `is_builtin + source_url` 可识别为官方来源
- `source_url` 若为本地路径，则识别为 `Local`
- `source_url` 若包含 `skills.sh`，识别为 `Community`
- `source_url` 若包含 `/tree/<branch>/...`，尝试从 URL 反推 branch / directory
- 对无法准确推导的导入项，只显示稳定的来源类型标签，不伪造 branch / directory

#### 详情页

详情页需显示：

- 当前条目来源
- 已安装的同名变体列表
- 当前条目与已安装条目的差异摘要：
  - same directory content
  - different directory content
  - different branch

## Migration Strategy

### Short-term

- 先新增 source identity 字段
- 先停止 UI 层 name-based collapse
- 保留旧数据可读
- 对历史无 `source_id` 的本地 skill 做 best-effort 回填
- 历史 data 目录不做强制重排
- 平台目录继续按逻辑 skill 名兼容

### Mid-term

- 移除 `idx_skills_name_lower`
- 新增基于 `source_id` 的唯一约束或索引
- 调整所有“按 name 查 skill”的调用点
- 在数据库中补齐“逻辑名 -> 变体实例 -> 平台激活”映射
- 为未来 `logical-skill-name/variants/` 结构预留元数据与迁移器

### Long-term

- 提供用户可感知、可回滚的后台迁移，把实例目录逐步归组到 `logical-name/variants/variant-key`
- 为历史脚本、备份、路径依赖提供迁移提示或兼容层
- 在迁移完成率足够高后，逐步弱化数据库中仅用于记录路径的冗余字段

## Open Questions

- 对于用户手动创建、没有 source identity 的本地 skill，是否允许与商店同名 skill 并存：建议允许。
- 当两个同名 skill 只有 `SKILL.md` 一样、但其他文件不同：必须视为不同变体。
- 当两个同名 skill 整个目录完全一样，但来源不同，默认是都显示还是默认折叠：建议默认都显示，但在卡片上标 `Duplicate content`，把折叠留给后续筛选交互。
- 何时把当前实例级目录正式迁移到 `logical-name/variants/variant-key`：建议等 identity、平台激活映射、目录指纹全链路稳定后，再开启一次显式迁移项目。

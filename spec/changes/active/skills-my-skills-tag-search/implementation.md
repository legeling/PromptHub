# Implementation — skills-my-skills-tag-search

## What shipped

在“我的 Skill”主内容头部新增可键入搜索的多选标签过滤（OR）交互；选中状态与
侧栏标签面板共用 skill-store `filterTags`（single source of truth）。

New/changed files：
- 新增 `src/renderer/services/skill-tag-options.ts`——候选 tags 收集（unique/trim/sorted）与键入收窄纯函数。
- 新增 `src/renderer/components/skill/SkillTagSearchFilter.tsx`——presentation-only 的搜索多选下拉控件。
- `src/renderer/components/skill/SkillManagerLibraryHeader.tsx`——新增受控 props，在 my-skills filter bar 渲染控件（无 tags 时隐藏）。
- `src/renderer/components/skill/SkillManager.tsx`——绑定 store `toggleFilterTag/clearFilterTags`，派生 `skillTagOptions` 并传 props。
- 7 个 locale `skill.*` 各 +6 键（含 parity 测试要求）。
- 测试：`tests/unit/services/skill-tag-options.test.ts`、`tests/unit/components/skill-tag-search-filter.test.tsx`。
- spec 记录：`spec/changes/active/skills-my-skills-tag-search/*`。
- 分支：`feat/my-skills-tag-search`（基于 upstream `main` @ `d62134bc` 创建）。

## Status（当前真实状态/日期戳）

- 分支 `feat/my-skills-tag-search` 已推送到 `origin`（fork `Siborne/PromptHub`）。
- Commits（按时间序，push 远端均同步）：
  1. `59f2bacf` feat(skill): add tag filter search in My Skills（初始特性 + 验证）。
  2. `c6a311fc` fix(skill): address PR #213 review finds（CodeRabbit follow-up round 1：locale 键重复 / trim 归一 / ARIA / 返回类型）。
  3. `0a3a0e67` fix(skill): align a11y, docs status and tests in PR #213 (round 2)（移除失配 `aria-haspopup` / 测试去掉 `as any` / 统一文档状态）。
  4. `dc246512` fix(skill): align My Skills tag filter with sidebar on owner review (round 3)（幽灵筛选可清除 / 候选与侧栏同源 user-tags / 已选列表有界滚动 / spec 验收同步）。
- PR：`legeling/PromptHub#213`（base `main`，head `Siborne:feat/my-skills-tag-search`）状态 `open`，head 已随上述 commits 更新。
- Pending（本轮待推送，未列于上方 commits）：codeRabbit round-4 的 `registryOnlySkill` 测试 fixture 修正 + 对应 tasks/implementation round-4 记录；全量 `pnpm test:run` 仍在宽松后台运行，结果待 `EXIT=` 出现后补录。

## Design decisions

- 不新增 store 字段/持久化；复用 `filterTags`/`filterVisibleSkills` 得到 OR + 与侧栏联动。
- 候选列表与侧栏同一形状（unique、trim、sorted），派生自容器数据，避免重复状态。
- 纯逻辑抽到 service 以脱离组件树做单测；控件为无状态受控组件，交互经回调。

## What was verified

Commands run（均从 `apps/desktop`）：
- `pnpm exec vitest run tests/unit/services/skill-tag-options.test.ts` → 1 file，7 passed。
- `pnpm exec vitest run tests/unit/components/skill-tag-search-filter.test.tsx` → 1 file，6 passed。
- `pnpm exec vitest run`（5 文件，含 skill-i18n-manager parity、sidebar-skills、skill-filter）→ 5 files，53 passed；
  其中包含经 `SkillManagerLibraryHeader`/`SkillManager` 挂载路径的头端 smoke（“My Skills header filters”、“filter by source”）
  与跨 6 locale `skill` 键对齐断言。
- `pnpm typecheck` → exit 0（`tsc --noEmit` clean）。
- `pnpm exec eslint <本次新增/修改的 6 个受检文件> --max-warnings 0` → RC 0。

### Known limits（状态截至 round-1 提交时）

- 全量 `pnpm test:run` 在开发会话的前台/后台多次尝试均因运行环境 2 分钟墙钟超时提前中断，
  未取得全量收尾绿单。受影响模块的针对性单测、链路上游回归、typecheck 与 lint 均绿；
  全量 suite 建议在 CI 或本机宽松超时的终端执行确认。
- 「未提交/未提 PR」仅为 round-1 提交前状态；后续已按用户确认 commit 并更新 PR #213（见上方 Status）。

## Sync

- 稳定文档/规则无跨界变化：本次为 renderer 视图内入口新增，无 IPC、shared 类型、
  schema/持久化变更，故无需改动 `spec/knowledge/*` 或 `spec/rules/*`。
- 验收映射：`FR-TAGSEARCH-001~003` → DESIGN → TEST（上列 UI + service + parity 测试）→ T（tasks list）已闭环。

## CodeRabbit follow-up（PR #213 review fixes）

Review 后追加修复（已在后续 commit 提交）：

- **locale 键重复**：首轮新增的 `skill.removeTag`（带 `{{tag}}`）与既有 `skill.removeTag`
  同层键重复，JSON 后者覆盖并触发 Biome `noDuplicateObjectKeys`。删除新增行，组件改用
  既有的唯一键 `skill.removeTagWithName`。
- **统一 trim 语义**：候选值 trim 而 `filterVisibleSkills` 用原始值 `includes`，空白标签
  显示却点不中。在 `skill-filter.ts` 对 `filterTags` 与 `skill.tags` 两侧归一 trim（忽略空），
  并在 filter 单测补空格回归用例。
- **显式返回类型**：`SkillTagSearchFilter` 增加 `: JSX.Element`。
- **ARIA 语义**：原 `role="listbox"`/`role="option"` 内嵌可聚焦 `checkbox` 无效组合，
  改为 `role="group"` + 直接 `role="checkbox"` 按钮，并新增 `skill.tagFilterOptions` 文案键（7 语言）。
- **全量 suite**仍需宽松超时环境执行；本次定向回归 + typecheck + lint 全绿。

Follow-up verification（同前执行方式）：
- `vitest skill-filter + skill-tag-options`：13 passed
- `vitest skill-tag-search-filter + skill-i18n-manager + sidebar-skills`：42 passed
- `pnpm typecheck`：exit 0；`eslint`（本次改动文件）：RC 0
- 7 locales JSON：解析合法、无重复键

## Owner review round 3（PR #213 maintainer feedback）

- **幽灵筛选 toggling**：header 控件原先仅当候选非空渲染；若激活标签来自已被移除的来源（`filterTags` 残留、候选空），列表会被旧标签过滤为空且无入口清除。
  改为 `skillTagOptions.length > 0 || skillActiveTags.length > 0` 渲染；补 “stale active tag 仍可清除/移除” 集成回归（skill-i18n-manager）。
- **候选语义对齐**：控件改为直接复用侧栏同源推导 `buildSkillStats(skills, deployedSkillNames).uniqueUserTags`（仅用户标签），删掉第二套 `collectSkillTagOptions` 收集逻辑及其单测；spec 增 `FR-TAGSEARCH-004` 与验收场景。
- **已选列表有界滚动**：selected `<ul>` 增加 `max-h-40 overflow-y-auto`；补“多选（40 tags）列表有界滚动”组件回归。

### Owner round 3 verification
- `vitest skill-tag-search-filter + skill-i18n-manager + skill-tag-options`：26 passed（含两条新增回归）。
- `pnpm typecheck`：exit 0；`eslint`（改动文件）：RC 0。
- 对应代码 commit：`dc246512`（详见上方 Status）。

## CodeRabbit round 4（stale-fixture 显式化）

- 将 stale-selection 回归改为显式 `original_tags: ["general"]` 的 `registryOnlySkill`（经 `Skill` 对象的 `original_tags` 字段），使 user-tag 候选确定为空——不再依赖 `baseSkill.registry_slug` 的隐性推导——从而只验证“存在 active tags 时控件仍保留/可清除”。
- tasks 第 10 行渲染条件措辞同步为“候选与 active 均空才不渲染；候选空但有 active 仍渲染”。
- 全量套件仍在宽松后台运行；**尚未取到 `EXIT=` 汇总**，等它跑完把实际 pass/fail 数字、lint 错误数、typecheck 错误数补录到本文件与 tasks 并打勾。
- Round-4 验证（当前）：`vitest skill-i18n-manager.test.tsx` → 16 passed（含修正后的 stale 用例）；typecheck/eslint 复跑随全量结束一并确认。

## Feature round 5（设置开关：frontmatter 标签纳入候选）

用户反馈“我的 Skill”标签过滤框消失。根因：`packages/db/src/init.ts` 迁移把无 `original_tags` 的既有 skill 回填为 `original_tags = tags`，导致本地创建 skill 的标签被判为“来源自带（original）”并被 `buildSkillTagCandidates` 默认排除 → 候选为空 → 控件按“候选与 active 均空”隐藏。

按用户确认的语义，维护者第 2 条“只显用户标签”保留为默认；新增设置 `settings.skillTagFilterIncludeFrontmatter`（默认 false）：
- 关闭（默认）：候选 = `buildSkillTagCandidates(skills, false)` = `buildSkillStats(...).uniqueUserTags`（用户标签），与侧栏一致。
- 开启：候选 = 用户标签 ∪ SKILL.md frontmatter（`original_tags`）标签，使本地标签重新可筛，不丢弃平台侧用户标签。

落地：`settings-types/defaults/general-actions/normalizers/persistence` 贯穿新布尔字段；`skill-stats.ts` 新增导出 `buildSkillTagCandidates(skills, includeFrontmatter)`（复用私有 `getUserSkillTags`/`inferOriginalSkillTags`，单一来源）；`SkillManager` 读设置并用它派生候选；`SkillSettings` 新增一个 `ToggleSwitch` section；7 个 locale 增 `settings.skillTagFilter*` 三个 key；spec 增 `FR-TAGSEARCH-005`。

### Round-5 verification
- `vitest skill-stats.test.ts`：4 passed（含 `buildSkillTagCandidates` 默认 user-tags / 开启并集 / registry 标签仅开启出现，3 个新用例）。
- `vitest skill-i18n-manager.test.tsx`：16 passed（SkillManager 默认关闭不回归）。
- 7 个 locale 的 `settings.skillTagFilter*` 三键齐全、JSON 合法。
- `pnpm typecheck`：exit 0；`eslint`（改动文件，max-warnings 0）：RC 0。
- UI 开关为与文件内其它 `ToggleSwitch` 同构的受控绑定；行为核心由 `buildSkillTagCandidates` 单测覆盖。
- 全量 `pnpm test:run` 仍为跨环境长跑（本 feature 改动后需 CI/宽松环境最终确认）。

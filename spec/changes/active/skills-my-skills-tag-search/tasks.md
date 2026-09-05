# Tasks — skills-my-skills-tag-search

- [x] 在 `main` 上创建分支 `feat/my-skills-tag-search`。
- [x] 建 active change 契约（proposal/specs/design/tasks/implementation）。
- [x] TDD（service）：`services/skill-tag-options.ts` + `tests/unit/services/skill-tag-options.test.ts`
      覆盖：unique/trim/忽略空、排序稳定、查询收窄大小写不敏感、无匹配、空集合（7 passed）。
- [x] 实现 `components/skill/SkillTagSearchFilter.tsx`（presentation、受控）。
- [x] 组件单测 `skill-tag-search-filter.test.tsx`（6 passed）：展开列出、查询收窄、toggle、移除 chip、
      清除全部、可访问性状态。
- [x] `SkillManagerLibraryHeader` 注入 props 并在 my-skills filter bar 渲染：仅当候选 tags 与 active tags **都为空**时不渲染；候选为空但仍存在 active tags 时渲染控件以支持清除筛选。
- [x] `SkillManager` 绑定动作、派生候选并传 props。
- [x] i18n：`skill.*` 6 个新键覆盖 7 语言；parity 测试绿。
- [x] desktop `pnpm typecheck`（`tsc --noEmit`）→ exit 0。
- [x] 受检文件 `eslint --max-warnings 0` → RC 0。
- [x] 相关回归（sidebar-skills、skill-filter、skill-i18n-manager 的 SkillManager/Header 挂载 smoke）53 passed。
- [ ] 全量 `pnpm test:run`——本开发会话多次受约 2min 墙钟限制中断；后续曾在宽松后台尝试跑通，早期可见失败均为与本分支无关的既有环境用例（agent/cli/mcp presets），最终结果见 implementation/CI。
- [x] 汇报用户；确认后提交 / push / 开 PR（两次确认；commits `c6a311fc`、`0a3a0e67` 已推送并更新 #213）。

## CodeRabbit follow-up（添加到 tasks 供追溯）

- [x] 删除新增的重复 `skill.removeTag` 键，组件改用既有唯一键 `removeTagWithName`（7 locales JSON 合法、无重复）。
- [x] `skill-filter.ts` 对 `filterTags` 与 `skill.tags` 两侧统一 trim（忽略空），并补空格标签跨层回归测试。
- [x] `SkillTagSearchFilter` 补显式返回类型 `: JSX.Element`，ARIA 改为 `role="group"` + `role="checkbox"`。
- [x] 新增 `skill.tagFilterOptions` 文案键（7 语言）。
- [x] follow-up 定向回归 13+42 passed、`typecheck` exit 0、`eslint` RC 0。

## CodeRabbit follow-up round 2（compl 02）

- [x] 移除与 `role="group"` 失配的 `aria-haspopup="listbox"`（a11y trigger 语义同步）。
- [x] `skill-filter.test.ts` 新回归用例改用类型化 `Skill[]` fixture，去掉 `spacedSkills as any`（符合 No-any）。
- [x] `implementation.md`「未提交/未建 PR」等旧状态已统一为真实分支/commit/PR（并补 Status 小节、提交时间戳）。
- [x] round-2 定向验证：related vitest 19 passed；typecheck exit 0；eslint RC 0；全量跑进行中或已见本章开头说明。

## Owner review round 3（maintainer feedback on #213）

- [x] header 在 “候选为空但有 active tags” 时仍渲染，令残留激活标签可清除/移除（防“幽灵筛选”）。
- [x] 控件候选改用 `buildSkillStats(...).uniqueUserTags`（与侧栏同源 user-tags），删除第二套 `collectSkillTagOptions` 收集逻辑。
- [x] 已选标签 `<ul>` 有界滚动（`max-h-40 overflow-y-auto`）。
- [x] 两条新增回归：stale active 可清、40 tags 列表滚动。
- [x] round-3 定向验证（vitest 26、typecheck、eslint）通过；代码 commit `dc246512` 已推送到 PR #213。（状态同步见 implementation.md）

## CodeRabbit round 4（latest review on stale-fixture）

- [x] stale-selection 回归改为显式 `original_tags: ["general"]` 的 `registryOnlySkill`，确保 user-tag 候选确实为空，仅由 active tags 驱动控件保留（避免依赖 `registry_slug` 隐性推导）。
- [x] tasks 第 10 行渲染条件措辞已改为“候选与 active 均空才不渲染；候选空但有 active 仍渲染”。
- [ ] 全量 `pnpm test:run` 最终汇总（仍在宽松后台运行；完成后把实际 pass/fail 数字、lint 错误数、typecheck 错误数写入 implementation.md 并打勾本项）。

## Feature round 5（frontmatter 标签开关）

- [x] `settings.skillTagFilterIncludeFrontmatter`（默认 false）：settings-types/defaults/general-actions/normalizers/persistence 贯穿字段与 setter。
- [x] `skill-stats.ts` 新增 `buildSkillTagCandidates(skills, includeFrontmatter)`（默认 user-tags；开启并集 original_tags），并补 3 个单测。
- [x] `SkillManager` 读设置并用 `buildSkillTagCandidates` 派生候选。
- [x] `SkillSettings` 新增 `ToggleSwitch` section；7 个 locale 增 `settings.skillTagFilter*` 三键。
- [x] 根因记录：`packages/db/init.ts` 回填 `original_tags = tags` 导致本地标签被排除。
- [x] round-5 验证：skill-stats 4 passed、skill-i18n-manager 16 passed、7 locale 键齐全、typecheck exit 0、eslint RC 0。

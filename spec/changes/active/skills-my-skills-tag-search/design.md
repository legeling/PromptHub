# Design: 在我的 Skill 里按标签搜索/过滤（OR）

## 目标

在“我的 Skill”（`my-skills`）主内容头部提供可键入搜索 + 勾选多选的标签过滤控件，
命中任意选中标签（OR）即显示该 Skill。选中状态**复用既有的共享 skill-store
`filterTags` 状态**及 `filterVisibleSkills` 语义，与侧栏标签面板双向联动，
不引入第二处标签状态源，不改 DB/持久化/IPC/搜索服务核心。

## 现状与为何如此设计

- “我的 Skill”列表/画廊数据已统一由 `services/skill-filter.ts#filterVisibleSkills`
  汇聚，内置 `filterTags`（OR：`filterTags.some(tag => skill.tags?.includes(tag))`）与文本 `searchQuery` 过滤。
- 侧栏 `SidebarResourceTagPanel` 已通过 store `toggleFilterTag/clearFilterTags/filterTags`
  提供“按侧栏 chips 过滤”，而主内容头一直没有直接入口。
- `SkillManager`（1438 行容器）为 header 提供几乎所有受控 props，header 本身无状态；
  给它加 prop 就能把功能挂在既有 my-skills filter bar，不需要重构容器结构或 store 模型。
- `t(...)` 二次默认值 + locales 必需校验（`skill-i18n-manager` 跨语种对齐测试）既已成项目规范。

## 变更面（boundary）

Data
- 无 schema/migration/新持久化状态。候选标签与已选标签都是**派生**自 `skills`+store 现有 `filterTags`。
Contract
- 无 IPC/shared 类型变化；纯 renderer 内部。
Ownership
- 纯候选/过滤推导服务：`src/renderer/services/skill-tag-options.ts`（替代在模块重复的局部逻辑，供单测）。
- 展示控件：`src/renderer/components/skill/SkillTagSearchFilter.tsx`（presentation-only，受控 props）。
- 接线：`SkillManagerLibraryHeader.tsx`（props + 渲染）+ `SkillManager.tsx`（绑定 store action、派生候选）。
i18n
- en/zh/zh-TW/ja/fr/de/es 的 `skill.*` 增加 6 键。
Compatibility / rollback
- 纯 UI 门禁：无 tags 时不渲染控件；切换回 main 即撤消；不涉及用户数据迁移。

## 交互（可访问性要点）

- trigger button：`aria-expanded`/`aria-haspopup`，存在已选时可用计数强调并 aria 提及计数。
- 展开面板：顶部可搜索 input（自动聚焦），候选以 `role=checkbox`/`li role=option`（`listbox`）呈现；
- 点击进入/退出 is `toggleFilterTag`（OR）；已选 tags 区块给出逐个移除 chip 与“清除全部标签筛选”。
- 外部点击 / `Escape` 关闭。
- tags 候选为 0 时不渲染控件（空态由列表空态承载）。

## 风险与覆盖

- 语义重复→复用同一 filter，避免 code-review 中出现第二实现；用 `skill-tag-options` 单测锁定收窄/OR/空输入行为。
- 组件无状态，逻辑全在 props：UI 单测可直接断言回调与 aria 状态。
- i18n 多语语种对齐由既有“parity”测试保证。
- typecheck/lint 全绿后再交用户确认（不自动提交 / 提 PR）。

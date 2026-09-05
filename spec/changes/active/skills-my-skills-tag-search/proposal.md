# Skills: Tag Filter Search Inside My Skills

## Phase And Status

- Phase: implement
- Status: active
- Primary requirement: `FR-TAGSEARCH-001`
- User request: 希望可以用标签对不同类型的 Skill 分类,在“我的 Skill”内容区域直接按标签过滤。
- Delivery flow: 新分支实现 → 单元测试 → 用户确认 → 再提 PR(不自动提交)。

## Why

用户需要在“我的 Skill”列表/画廊里快速按标签找到一组同类型 Skill。仓库已经具备一套侧栏标签面板(sidebar `SidebarResourceTagPanel`,共享 store `filterTags`)与整体文本搜索(`searchQuery`),但主内容区本身没有一个可以直接搜索/勾选标签来收窄列表的过滤入口。用户希望将该入口放在“我的 Skill”内容区上方。

## Scope

- In scope:
  - 在 my-skills 主内容头部(`SkillManagerLibraryHeader` 的 filter bar 区域)新增一个可按文本收窄、多选、OR 语义的标签过滤控件;
  - 复用既有共享 store 状态 `filterTags` / `toggleFilterTag` / `clearFilterTags` 与 `filterVisibleSkills`,使该控件与现有侧栏标签面板双向联动、保持单一过滤数据源;
  - 补齐 7 语言 i18n 与空态文案;
  - 组件行为与纯过滤语义的单元测试。
- Out of scope:
  - 不改数据库/持久化 schema、不移除侧栏标签面板;
  - 不新增第二条重复的标签过滤字段/状态;
  - 不改动 `searchQuery` 全局文本搜索语义(其保留同时对 name/description/tags 生效);
  - 不涉及 Skill distribution(target/platform/store)行为。

## FR / Exit conditions

- `FR-TAGSEARCH-001` my-skills 内容区提供入口,可按标签过滤列表,匹配为命中任意选中标签(OR)。
- `FR-TAGSEARCH-002` 过滤只针对“我的 Skill”视图内容的可见性,不写入任何新持久化字段。
- `FR-TAGSEARCH-003` 与侧栏标签面板共用同一过滤状态:任一入口增删选中标签,另一入口状态同步变化。
- Exit condition: 上面 FR 有对应路径的单元测试且全量 desktop Vitest / lint / typecheck 通过,交付 diff 摘要给用户确认后才提 PR。

## Rollback

- 纯粹为本地 UI/设置内状态改动,无 schema/migrations;回退到 main 即可。

# Skills Spec — My-Skills 标签搜索（OR）

## Requirements

- `FR-TAGSEARCH-001`（added）在 my-skills 主内容头部提供可搜索、可多选的标签过滤控件；选中任一标签即可命中（OR 语义由 `filterVisibleSkills` 复用保证）。
- `FR-TAGSEARCH-002`（added）标签选中结果仅在 UI 视图层影响列表可见性，不改任何持久化字段与 IPC/shared 契约。
- `FR-TAGSEARCH-003`（added）该控件与侧栏标签面板共用 store `filterTags`：任一入口增删选中标签，另一入口状态同步可见（单一数据源）。
- `FR-TAGSEARCH-004`（added）控件候选默认与侧栏标签面板一致地只展示**用户标签**（复用 `buildSkillStats(...).uniqueUserTags`），两入口来自同一候选推导，不暴露来源自带标签的额外集合。
- `FR-TAGSEARCH-005`（added）提供设置开关（`settings.skillTagFilterIncludeFrontmatter`，默认关闭）控制是否把 SKILL.md frontmatter（`original_tags`）标签也并入“我的 Skill”标签过滤候选；开启后本地创建/迁移回填 `original_tags` 的标签也能被筛选，同时不丢弃平台侧用户标签。
- `FR-TAGSEARCH-000`（unchanged）既有 filterType / searchQuery / source filter 行为保持不变。

## Acceptance scenarios

- 候选为 0 且无已选标签：主内容不渲染标签控件。
- 候选非空：点击 trigger 展开列出候选标签；键入只把候选收窄为匹配项；无匹配时给空提示。
- 候选为 0 但仍有激活标签（如来源更新移除某标签但其仍在 `filterTags`）：控件仍渲染并允许用户“清除全部标签”或移除该 tag（避免无法清除的“幽灵筛选”）。
- 勾选某 tag：store `filterTags` 增加该 tag 且列表随之过滤；再次点选则移除（toggle），UI aria/计数同步。
- 已选非空：提供逐个“移除”chip 与“清除全部标签筛选”；点击后 OR 过滤清空回到全量。
- 已选过多时，已选标签列表采用有界滚动，不把面板推出视口。
- 默认（设置关闭）：候选只含用户标签；截图里因迁移被回填 `original_tags` 的本地标签不出现。
- 开启 `settings.skillTagFilterIncludeFrontmatter`：候选并集 SKILL.md frontmatter（`original_tags`）标签，使本地创建的 `prompting/workflow/dialogue/git` 等标签重新出现在过滤框并可选筛。
- 点击控件任一操作都会停留/切到 my-skills 视图（不进入详情页打断选择）。

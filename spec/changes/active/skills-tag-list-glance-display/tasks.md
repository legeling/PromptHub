# Tasks — skills-tag-list-glance-display

- [x] 定位(阶段一)：本分支迁移将 SKILL.md frontmatter(source)标签放入
      `original_tags`；列表行仅显 `skill.tags`，详情路径显式处理
      `original_tags` → 导入技能列表无 tag、点详情才见。
- [x] 定位(阶段二，数据层根因)：`buildSkillSyncUpdateFromRepo` 把
      `parsed.frontmatter.tags` 直接写入技能 `tags`，导致详情打开经
      `syncFromRepo` 后 frontmatter 标签被写进 `tags`，关闭设置仍显示。
- [x] 实现(展示层)：`SkillListView` 订阅 `skillTagFilterIncludeFrontmatter`；
      开启时 `tags ∪ original_tags`（去重、上限 3），关闭(默认)仅 `tags`。
- [x] 实现(数据层)：`skill-repo-sync.ts` 不再把 frontmatter 标签写入 `tags`，
      改为写入 `update.original_tags`（仅当与当前不同）。
- [x] 用例：`skill-repo-sync.test.ts` frontmatter tags → `original_tags`、
      且 `next.tags` 未被设置；`skill-view-tags.test.tsx` 新增关闭不显示、
      开启显示的用例。
- [x] desktop vitest：`skill-repo-sync.test.ts` 35 passed；
      `skill-view-tags.test.tsx` 17 passed；`tsc --noEmit` 通过。
- [ ] 真机核对：关闭设置时，导入 frontmatter 带 tags 的技能，列表行不显示；
      进入详情再退回仍不显示；开启设置后显示。

domain: skills
related: feat/my-skills-tag-search（同分支、独立 commit）

## 行为

SKILL.md frontmatter(source)标签存于 `original_tags`；用户/DB 标签存于 `tags`。
My Skills 列表行的标签徽标显示与 `skillTagFilterIncludeFrontmatter` 设置一致：

- 设置**关闭**（默认）：列表行**不显示** `original_tags`（frontmatter 源标签），
  仅显示用户/DB `tags`；打开技能详情再返回，列表行仍不显示这些 frontmatter 标签。
- 设置**开启**：列表行显示 `tags` 与 `original_tags` 的去重并集（上限 3 条）。

## 不变量

- `syncFromRepo`（及详情/更新触发的 repo 同步）**不得**把 SKILL.md frontmatter
  标签写入技能 `tags`（frontmatter 标签只能写入 `original_tags`），否则即使开关
  关闭，打开详情返回后这些标签仍会在列表出现、与设置不一致。
- 筛选候选（`buildSkillTagCandidates`/stats）与行徽标同受该开关约束，二者一致。

## 验收

AC1：`buildSkillSyncUpdateFromRepo` 对 frontmatter 带 tags 的 SKILL.md，
返回的更新含 `original_tags` 且不含 `tags`（不覆盖用户标签）。

AC2：设置关闭时，导入技能列表行不渲染 frontmatter 标签（tags 为空或为用户标签）；
打开详情再返回后列表行仍不渲染它们。

AC3：设置开启时，列表行渲染 `tags ∪ original_tags`（去重、上限 3）。

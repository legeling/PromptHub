# Implementation — skill tag governed by the frontmatter-filter setting

Branch: feat/my-skills-tag-search（分阶段提交；归档随各阶段实现一并提交）。

> 此 change 经历了两个阶段：先在列表行把 `original_tags` 与 `tags` 并集展示
> （commit b1153e01），随后发现关闭“包含 SKILL.md frontmatter 标签”设置时，
> `syncFromRepo` 会先把 frontmatter 标签写进技能 `tags`，导致详情返回后标签又
> 在列表出现；于是把数据层与展示层都改为受同一开关约束（本阶段修复）。

## 阶段一（b1153e01）

- `apps/desktop/src/renderer/components/skill/SkillListView.tsx`：行徽标由
  “仅 `skill.tags`”改为“`tags` ∪ `original_tags` 去重（上限 3）”。

## 阶段二（本阶段）

1. **数据层** `apps/desktop/src/main/services/skill-repo-sync.ts`
   `buildSkillSyncUpdateFromRepo`：
   - 移除 `tags: parsed?.frontmatter.tags`（原来把 SKILL.md frontmatter 标签
     直接写进技能 `tags`，正是“详情返回后列表仍显示”的根因）。
   - 新增 `sourceTags`（trim + 过滤空串），当与 `skill.original_tags` 不同时
     写入 `update.original_tags`；`update.tags` 不再因 frontmatter 而变化，
     只保留用户/DB 标签。
2. **展示层** `apps/desktop/src/renderer/components/skill/SkillListView.tsx`：
   - 读取 `skillTagFilterIncludeFrontmatter` 设置；开启时行徽标为
     `tags` ∪ `original_tags`，关闭（默认）时仅显示 `tags`，从而与筛选候选
     口径一致，杜绝“不用该方式筛选却仍显示这种标签”。

## 语义（FR/边界）

- 关闭 `skillTagFilterIncludeFrontmatter`：`original_tags`（frontmatter 源标签）
  不参与列表徽标显示；`tags` 为用户/DB 标签。
- 开启该设置：`original_tags` 才并入显示；过滤候选与行徽标同源一致。
- `syncFromRepo` 永不把 frontmatter 标签写入 `tags`，避免打开详情后改变显示。

## 验证

- desktop `apps/desktop`：`vitest run tests/unit/main/skill-repo-sync.test.ts`
  → `35 passed`（frontmatter tags → `original_tags`，且 `next.tags` 未被设置）。
- desktop `apps/desktop`：`vitest run tests/unit/components/skill-view-tags.test.tsx`
  → `17 passed`（新增默认关闭时 `original_tags` 不显示、开启时显示的用例；
  既有 act() 状态更新告警不影响断言）。
- `apps/desktop` `tsc --noEmit` → 通过（无输出）。

## 设备 / UI 验收

- 真机复核：关闭“包含 SKILL.md frontmatter 标签”，导入 frontmatter 带 tags 的
  技能后列表行不显示；进入详情再退回，列表行仍不显示这些 frontmatter 标签。
  开启设置后再复核会显示。Windows 设备复核项仍需实际运行验证。

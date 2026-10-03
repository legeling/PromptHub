# Implementation: desktop-tag-manager-usability

## 实际落地
- `prompt.store`：新增 `setFilterTags(tags)`（整体替换筛选，直达跳转用）。
- `TagManagerModal`：
  - `usageCounts` useMemo（prompt 模式按 prompts.tags 计数；skill 模式按 getUserSkillTags 计数）；
  - `sortMode`（usage-desc 默认 / usage-asc / name），filteredTags 改为过滤+排序（同值按名称稳定序）；
  - 行内用量徽标（title 为完整文案 `tagUsedCount`）；
  - prompt 模式行内"查看"按钮（EyeIcon）：`setFilterTags([tag])` + onClose；该标签已在筛选中时显示 CheckIcon 高亮（tagFilterActive）。
- i18n：7 新键 × 7 locale。

## 偏差
- 候选清单假设"已有用量显示"——实测原弹窗无用量列，本期一并补上（#145 诉求本体）。
- skill 模式仅获得排序+用量（无查看直达，列表筛选体系不同）。

## 验证
- `tag-manager-modal.test.tsx` 新增综合用例（用量徽标、默认使用量降序、切升序后顺序翻转、查看直达 filterTags=[alpha]+onClose 一次），5/5 全绿（既有 4 用例不破）。
- 排序断言修正过程记录：初版误用名称序（alpha 双序同为首位无法区分），改用 usage-asc 验证切换生效。

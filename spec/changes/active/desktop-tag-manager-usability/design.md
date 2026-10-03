# Design: 标签弹窗排序与查看

## DES-TAG-001
TagManagerModal 内新增 `sortMode` 本地 state（'usage-desc' | 'usage-asc' | 'name'），渲染前对既有条目数组排序（纯展示，不改 promptTagCatalog 存储顺序）；顶部排序下拉复用 `ui/Select`。行内"查看"按钮：`onFilterByTag(tag)` —— 优先经 props 由父层调用 store setter（保持弹窗对 store 依赖最小），关闭弹窗。

## i18n
新 key：`prompt.tagSortBy`、`prompt.tagSortUsageDesc/Asc`、`prompt.tagSortName`、`prompt.tagViewPrompts`、`prompt.tagFiltering` × 7。

## 验证（TEST-TAG-*）
- TEST-TAG-001 排序切换后行顺序断言（含中文名/大小写稳定序）。
- TEST-TAG-002 点击查看：弹窗关闭回调 + filterTags 精确设为 [tag] + 重复点击幂等。
- 既有 tag-manager 测试不破。

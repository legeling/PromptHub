# Spec Delta: 桌面 Prompt 批量操作体验（desktop-ui 域）

## 修改的需求

### FR-BAT-001 表格视图「标签」入口复原
表格视图多选批量栏重新出现「标签」按钮，点击以当前选中 id 集合打开 QuickTagModal 批量模式（与 v0.6.0 行为一致：交集展示、按条回滚）。

### FR-BAT-002 共享批量条
表格视图与 gallery 视图、card 视图使用同一批量条组件：显示「已选 n / 共 m 项」、标签、批量收藏、批量移动（文件夹菜单）、批量删除、清除选择；操作成功/发起后清除选择的时机与现有表格视图完全一致。

### FR-BAT-003 gallery 视图多选
gallery 每张卡片提供复选框（点击不触发打开详情）；支持全选当页可见项、清除；Ctrl/Shift 语义不强制（与表格视图现有交互对齐即可）。

### FR-BAT-004 card 视图批量条
card（默认）视图在 store `selectedIds` 非空时在列表面板头部显示共享批量条，actions 接现有 `handleBatchFavorite/Move/Delete` 与 `openQuickTagForIds`；不改变现有选择交互。

### FR-BAT-005 i18n 展示卫生
批量条内不得存在 `t(...) || '中文'` 形式兜底；全部使用既有 key（`prompt.selected`/`prompt.batchFavorite`/`prompt.batchMove`/`prompt.batchDelete`/`prompt.noFolder`/`prompt.batchTagTitle` 或新增 key），新增 key 同步 7 locale。

## 移除的需求
无。

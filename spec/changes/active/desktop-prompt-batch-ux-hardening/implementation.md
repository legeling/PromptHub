# Implementation: desktop-prompt-batch-ux-hardening

## 实际落地
- 新增 `components/prompt/PromptBatchActionBar.tsx`：三视图共享批量条（计数分母 selectedOfTotal、标签（可选入口）、收藏、移动文件夹菜单、删除、清除选择）。
- 新增 `components/prompt/usePromptBatchSelection.ts`：Set 选择 + prune + whenScopeSelected + toggle/clear（从 TableView 原逻辑平移）。
- `PromptTableView.tsx`：换用共享实现；删除 `t(...) || 中文兜底`（478/487/496/506/529/536）；`onBatchTags` prop 接通；文件 1046→875 行。
- `PromptViewContainers.tsx`：`PromptTableActions` 接口补 `onBatchTags`（v0.6.0 断线根因）；Gallery 接线 batch handlers。
- `PromptGalleryCard.tsx`（新，从 Gallery 拆分）：卡片复选框（hover/选中可见、选中高亮边框、stopPropagation 不误开详情）+ `aria-pressed` 同步 selection。
- `PromptGalleryView.tsx`：复选框模式 + 共享批量条；操作后清除选择与表格时序一致；文件 412→287 行。
- `PromptWorkspaceCardRoute.tsx`：store `selectedIds` 非空时渲染批量条（复用既有 handleBatch*/openQuickTagForIds）。
- 新 i18n key ×7：`prompt.selectedOfTotal`、`prompt.deselectPromptRow`。

## 行为偏差与修正
1. 批量条关闭按钮最初沿用 `common.cancel`（"Cancel"）→ 与内联编辑的 Cancel 按钮同名，`main-content-inline-edit` 集成测试捕获 getByRole 歧义 → 产品文案改为既有的 `prompt.clearSelection`（"Clear Selection"），歧义消除且语义更准确。
2. 原设计"清除选择"独立新 key → 复用已有 key，避免冗余。
3. v0.6.0 断线归因：上游 0.5.9 升级重放时将 PromptTableActions 接口重建但丢失 onBatchTags 声明与消费，`getPromptTableActions` 返回的多余字段被结构类型容忍、TS 不报错、UI 静默缺失。本次起接口与消费链一致。

## 输入输出不变承诺
所有持久化走既有 batch handlers / QuickTagModal（0.6.0 语义不变）；未选中任何项时三视图渲染零变化；表格视图行为（选中 prune、操作后清空、分页全选范围）由原有用例（更新后的分母文案断言）与新增标签用例锁定。

## 覆盖
- 新增测试：prompt-batch-action-bar.test.tsx（7）、gallery 批量 2 用例、table 标签入口 1 用例；相关定向文件 42+23 全绿；全套基线对照无新增回归文件。

## 交付后修正（2026-10-01，用户实机截图反馈）
- 现象：卡片视图窄列表面板内批量条因 `flex-wrap` + 图标文字按钮过宽被挤成 6 行竖排，占屏严重。
- 修复：`PromptBatchActionBar` 单行化（根与按钮组显式 `flex-nowrap`），5 个 32px 纯图标按钮（标签/收藏/移动/删除/清除选择），完整文案保留在 `title` tooltip 与 `aria-label`；文件夹弹出菜单 `left-0` → `right-0` 防窄面板溢出；计数文案降为 `text-xs`。
- 兼容：既有测试全部按 accessible name 断言，aria-label 未变 → 零断言改动通过；新增 2 用例锁定 tooltip 一致性与单行不换行（FR-BAT-007）。
- 验证：bar 9/9、table/gallery/inline-edit 相关 47+ 全绿；typecheck/lint/行数门禁通过。提交为 fork-v0.6.2 tag 之后、0.6.2 打包发布之前。

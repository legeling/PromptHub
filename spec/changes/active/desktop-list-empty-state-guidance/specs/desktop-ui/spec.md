# Spec Delta: 空态引导（desktop-ui 域）

### FR-EMPTY-001 筛选归因空态
当列表 0 结果且存在任一激活筛选（searchQuery 非空 / filterTags 非空 / selectedFolderId 非 null）时，显示"没有符合当前筛选的 Prompt"文案 + 〔清除全部筛选〕按钮；点击后三项筛选同时复位，列表恢复全量（与手动逐项清除结果一致）。

### FR-EMPTY-002 空库引导
无任何筛选且库为空时显示"还没有 Prompt" + 〔新建 Prompt〕按钮，点击经 `APP_QUICK_ADD_PROMPT_EVENT` 打开现有新建弹窗（与顶栏新建入口同一事件路径）。

### FR-EMPTY-003 三视图一致
card/table/gallery 三视图空态使用同一共享组件；kanban/graph 视图本期不动（非默认路径，记录为后续候选）。

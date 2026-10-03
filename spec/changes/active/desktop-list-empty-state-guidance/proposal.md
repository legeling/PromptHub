# Proposal: 列表空态归因与出路引导

## Change Key
`desktop-list-empty-state-guidance`（v0.6.3 / X1，体验）

## Why
卡片/表格/画廊三视图在"搜索词/标签筛选/文件夹限定"叠加导致 0 结果时，仍只显示"暂无 Prompt"，用户分不清库空还是筛选卡住，也没有一键清除出路（信息模糊 + 引导缺失双痛点）。

## Scope
新增共享空态组件 + 三视图空态分支替换；清除筛选与新建走既有 setter/全局事件（`searchQuery=''`、`clearFilterTags()`、`selectedFolderId=null`、`APP_QUICK_ADD_PROMPT_EVENT`）。零业务逻辑改动。

## Risks & Rollback
纯展示分支；回滚删组件与三处替换。

## Traceability
FR-EMPTY-001..003 → DES-EMPTY-001 → TEST-EMPTY-001..003

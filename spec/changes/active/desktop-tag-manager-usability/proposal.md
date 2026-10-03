# Proposal: 标签管理弹窗排序与直达筛选

## Change Key
`desktop-tag-manager-usability`（v0.6.3 / X6，体验，响应 #145）

## Why
#145"建议完善标签管理界面"（正文空模板）。现状核对：TagManagerModal 已具备搜索/改名/删除/用量显示，两个真实缺口——① 列表无排序（标签多时无法按用量定位废标签）；② 看到用量后无法一步跳到使用该标签的 prompt 列表。

## Scope
TagManagerModal：列表支持"按用量/按名称"排序切换（默认用量降序）；每行加"查看"动作 → 关闭弹窗并设置 prompt store `filterTags=[tag]`（复用既有 toggle/set 语义：若已含该标签则不重复添加）。数据源、改名/删除逻辑不动。

## Risks
弹窗内展示层 + 一次既有 setter；回滚删控件。

## Traceability
FR-TAG-001..002 → DES-TAG-001 → TEST-TAG-001..002

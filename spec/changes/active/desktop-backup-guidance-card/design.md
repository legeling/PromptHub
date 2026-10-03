# Design: 指引卡

## DES-GUIDE-001
新组件 `settings/data-settings/BackupGuidanceCard.tsx`：props 收 `onExport` / `onRestorePick`（由 BackupPanel 现有 handler 传入，直接引用不包装）；内部 CollapsibleSection + settings 新字段 `backupGuideCollapsed: boolean`（默认 false，normalizer 归一 boolean）。

## i18n
`settings.backupGuideTitle`、`settings.backupGuideStep1/2/3`、`settings.backupGuideExport`、`settings.backupGuideRestore` × 7。

## 验证（TEST-GUIDE-*）
- TEST-GUIDE-001 卡渲染 + 两按钮调用传入 handler（mock 断言恰一次）。
- TEST-GUIDE-002 折叠偏好持久化字段读写 + 坏值归一。
- 既有 data-settings/backup 测试不破。

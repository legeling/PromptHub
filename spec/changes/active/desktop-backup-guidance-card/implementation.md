# Implementation: desktop-backup-guidance-card

## 实际落地
- 新组件 `settings/data-settings/BackupGuidanceCard.tsx`：三步静态指引（导出全量备份 → 新设备/回退版本安装打开 → 拖入 .zip 或点导入），可折叠（aria-expanded + hidden 不卸载），折叠偏好持久化 `settings.backupGuideCollapsed`。
- `BackupPanel` 顶部挂载（section 首子元素）。
- settings 切片：types/defaults/actions/normalizer（`backupGuideCollapsed === true` 归一，并入既有 `normalizeStartupFolderSettings`，merge+migrate 双路径防护坏值）。
- i18n：4 键 × 7 locale。

## 偏差
- design.md 原案"按钮复用现有 handler + CollapsibleSection"——实施简化：面板下方 8px 处即导出/导入按钮，卡内不放重复按钮（避免双入口歧义）；折叠交互自实现（避免给已发布的 CollapsibleSection 加受控 API）。

## 验证
- `backup-guidance-card.test.tsx` 3/3（三步文案、折叠持久化读写、坏值归一）。
- 全套基线对照零新增回归；i18n 28 键 × 7 脚本核验通过。

# Proposal: 备份/迁移/回退自助指引卡

## Change Key
`desktop-backup-guidance-card`（v0.6.3 / X7，体验，响应 #97/#139/#71）

## Why
数据自救能力（导出备份、拖 .zip 恢复、恢复候选、版本回退）0.5.x~0.6.2 已齐备，但用户不知道其存在：#97"怎么回退到 5.1 啊？"、#139 用户自行总结"导出导入可解决大多数问题"、#71 换设备存储疑问。典型"引导缺失"——功能在、路径不可见。

## Scope
设置页数据区（DataSettings 的备份面板顶部）新增静态三步指引卡：①导出备份〔按钮→现有导出动作〕②换设备或回退版本后 ③把 .zip 拖到应用窗口任意位置或在此选择文件恢复〔按钮→现有导入选择〕。文案静态 i18n；按钮全部复用既有 action（useBackupExportActions / useBackupImportFlow 暴露的现有入口）；不新增流程、不改备份逻辑。

## Risks
纯展示卡；回滚删组件。

## Traceability
FR-GUIDE-001..002 → DES-GUIDE-001 → TEST-GUIDE-001..002

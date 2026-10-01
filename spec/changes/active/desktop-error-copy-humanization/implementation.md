# Implementation: desktop-error-copy-humanization

## 实际落地
- 新增 `components/settings/security-error-copy.ts`：`getSecurityErrorCopy(error, t)` 纯函数，5 条主进程 security.ipc 错误枚举 → i18n 键（"Current password is incorrect" 复用既有 `settings.currentPwdWrong`）；未知错误 → `settings.securityOpFailed` 且原始 message 进 `console.error`。
- `SecuritySettings.tsx` 5 处 catch 全部接入（含状态刷新路径）；原 :123 手写特判并入映射器。
- 核查结论：`PrivateFolderUnlockModal`/`FolderModal` 已是全 i18n toast（无透传），不需要改。
- i18n：4 新键 + 复用 1 键 × 7 locale。

## 契约变更（有意）
既有测试 `surfaces unexpected change-password failures`（断言原始英文 "Disk write failed" 透传 toast）与本期目标冲突，按新契约改写为断言通用本地化文案 + console 保留原始信息 + toast 无英文原文。CHANGELOG 归入 Fixes。

## 验证
- `security-error-copy.test.ts` 4/4；`security-settings.test.tsx` 9/9；全套基线对照零新增回归。

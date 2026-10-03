# Proposal: 安全密钥错误文案人话化

## Change Key
`desktop-error-copy-humanization`（v0.6.3 / X3，体验，响应 #64）

## Why
#64 原话"安全密钥设置不成功，提示一串英文报错"。现状（SecuritySettings.tsx:59/81/94/126）：`showToast(e?.message || t(fallback))` 主进程英文错误优先透传给用户；仅 :123 有一处映射先例。主进程 security.ipc 错误为固定枚举（Password too short / Master password is already configured / Current password is required / Master password is not configured / Current password is incorrect / 解密失败类）。

## Scope
新增纯函数错误映射器（security-error-copy）：已知枚举 → i18n 文案；未知 → 通用 i18n 文案，原始 message 转 `console.error` 保留排障细节。接入 SecuritySettings 四处 catch + 私密文件夹解锁失败路径（PrivateFolderUnlockModal/FolderModal，实现时核实行号）。加密/IPC 逻辑零改动。

## Risks & Rollback
纯展示层；回滚删映射器与 catch 改动。

## Traceability
FR-ERR-001..002 → DES-ERR-001 → TEST-ERR-001..003

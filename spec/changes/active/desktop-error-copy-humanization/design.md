# Design: 安全错误映射

## DES-ERR-001
`renderer/components/settings/security-error-copy.ts`：
`getSecurityErrorCopy(error: unknown, t): string` —— 取 error.message，查 `Record<string, string>`（key=主进程英文消息，value=i18n key）；命中返回 t(key)，否则返回 t('settings.securityOpFailed')；同时 console.error 原始错误。

## 接入点
SecuritySettings 4 处 catch；私密文件夹解锁失败 toast 路径（实现时核实）。新 i18n key：每条已知错误一个 + 通用兜底 1 个，× 7 locale。

## 验证（TEST-ERR-*）
- TEST-ERR-001 映射器单测：全枚举命中、未知→兜底、null/非 Error 输入、console.error 被调用。
- TEST-ERR-002 SecuritySettings 组件测试：setMasterPassword reject('Password too short') → toast 显示 zh/en 本地化文案而非英文原文。
- TEST-ERR-003 既有 settings 测试不破。

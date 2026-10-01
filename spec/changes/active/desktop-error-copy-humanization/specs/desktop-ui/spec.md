# Spec Delta: 安全错误展示（desktop-ui 域）

### FR-ERR-001 已知错误本地化
主进程 security IPC 的已知错误消息（Password too short、Master password is already configured、Current password is required/not configured、Current password is incorrect、解密/校验失败类）经映射器输出当前界面语言的文案；不得再向用户 toast 原始英文串。

### FR-ERR-002 未知错误兜底
未匹配错误显示通用失败文案（i18n），原始 message 通过 `console.error` 记录（不弹窗透传）；映射函数为纯函数，输入空/非 Error 值不抛错。

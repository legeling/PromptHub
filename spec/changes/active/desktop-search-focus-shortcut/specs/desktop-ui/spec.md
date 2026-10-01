# Spec Delta: 搜索键盘直达（desktop-ui 域）

### FR-KB-001 Ctrl/Cmd+F 聚焦搜索
应用窗口内按 Ctrl+F（mac ⌘F）：preventDefault 并聚焦顶栏搜索框、全选已有文本；若用户已在设置中为 "search" 动作配置了其它组合键，两个键位同时有效（用户配置优先注册，兜底键不互斥）。

### FR-KB-002 快捷键可见性
搜索框 placeholder 含当前平台快捷键提示（跟随界面语言）；搜索框获得焦点时有可见焦点态（现有 focus 样式若已足够则不新增）。

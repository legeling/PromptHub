# Design: 媒体区提层

## DES-MEDIA-001
- Edit/CreatePromptModal：`{promptType !== "image" && renderReferenceMediaSection()}` 从 More Settings 条件块内移到主区（user prompt 之后、CollapsibleSection 之前）。
- hint 文案新 i18n key `prompt.mediaLimitHint`（含 20/10MB 数字插值，值来自共享常量文件——主进程常量若无法跨进程 import，则 renderer 侧常量文件 + 测试断言两处一致）。
- 弹窗文件行数门禁：仅移动位置不新增行数（hint 一行）。

## 验证（TEST-MEDIA-*）
- TEST-MEDIA-001 结构测试：文本类弹窗默认渲染顺序中媒体区先于补充信息折叠组（DOM 顺序断言）。
- TEST-MEDIA-002 hint 文案含 "20MB"/"10MB"；常量一致性测试。
- 既有弹窗测试全绿。

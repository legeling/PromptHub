# Design: 编辑弹窗折叠

## DES-EDIT-001 共享件
新增 `components/ui/CollapsibleSection.tsx`：props（title/defaultOpen/children），头部 button + chevron 过渡，内容 `<div hidden={!open}>`（不卸载，保住非受控 ref/游标）。纯展示，无状态库依赖。

## DES-EDIT-002 弹窗接入
`EditPromptModal.tsx` 与 `CreatePromptModal.tsx` 的次要字段段落分别包裹：折叠状态由弹窗各持一个 `useState`（打开重置为默认）。字段 JSX 不移动位置、不改 props、不改编排顺序——仅在其外层加折叠容器。实现时先绘制两类弹窗的 section 清单入 tasks 注记（哪些进折叠组），对照截图级检查保存行为不变。

## 影响范围
2 个弹窗文件 + 1 个新 ui 组件 + i18n key（分组标题）。无服务/store/IPC/DB 触达。

## 验证（TEST-EDIT-*）
- TEST-EDIT-001 CollapsibleSection：展开/收起 aria 状态、hidden 时子内容仍在 DOM。
- TEST-EDIT-002 编辑弹窗折叠后字段值保持，提交 payload 与展开态逐字段一致（对抗性输入：含 emoji/引号/超长文本）。
- TEST-EDIT-003 新建弹窗同样行为。
- TEST-EDIT-004 弹窗现有测试全量不破。

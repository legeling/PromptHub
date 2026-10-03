# Implementation: desktop-prompt-editor-section-collapse

## 实际落地
- 新增 `components/ui/CollapsibleSection.tsx`：aria-expanded/aria-controls 折叠容器；收起时 `hidden` 仅隐藏不卸载，保内容状态。
- 新增 `components/prompt/PromptSourceNotesFields.tsx`：来源+备注字段组从 Edit/Create 双弹窗提取共享（顺带清除两处 `t(...) || "English"` 死兜底，键全 locale 已验证存在）。
- Edit/CreatePromptModal 各以 `<CollapsibleSection defaultOpen={false}>` 包裹该组；默认折叠。
- i18n：`prompt.supplementaryInfo` × 7。

## 对"行数只减不增"门禁的处理
初版把折叠 JSX 直接内联到 EditPromptModal，触发 `check-file-line-limits` 超限（1836 > baseline 1830，遗留巨型文件禁止膨胀）→ 改为提取共享子组件，EditPromptModal 净行数回落到基线以下，门禁通过。

## 行为不变承诺
字段 DOM 顺序、state、提交 payload、来源联想面板（依赖相对定位展开）均不变；折叠分组内内容始终以 `hidden` 呈现——受控组件值与 ref 不丢失（组件测试用输入往返 + emoji/尖括号样本验证）。

## 验证
- `collapsible-section.test.tsx` 4 用例；`edit-prompt-modal.test.tsx` 折叠→输入→再折叠→展开值不变 + Save payload 断言（source/notes 精确匹配，含 `keep <this> — 🎯`）。
- create/edit/prompt-modal-structure 三文件 18 用例全绿；全套基线对照零回归；`pnpm build` ×4 通过。

# Implementation

## Status

- Completed.

## Notes

- 第一版只接入 `EditPromptModal`。
- 第一版只改写主语言草稿字段，不动英文版字段。

## What Shipped

- 在 `apps/desktop/src/renderer/services/ai.ts` 新增 `rewritePromptDraft()`、`PromptRewriteInput`、`PromptRewriteResult`、`PROMPT_REWRITE_SYSTEM_PROMPT` 与 `extractJsonObject()`。
- Prompt 改写协议固定为结构化 JSON，只允许 AI 返回 `summary`、`description`、`systemPrompt`、`userPrompt`、`notes` 五类字段，并且仅应用可编辑主语言字段。
- `rewritePromptDraft()` 会按 `promptType` 注入不同 guidance：
  - `text` 聚焦指令清晰度、步骤和输出格式。
  - `image` 聚焦画面主体、构图、风格、光照和负向约束。
  - `video` 聚焦镜头、节奏、运动和时序一致性。
- 在 `apps/desktop/src/renderer/components/prompt/EditPromptModal.tsx` 接入最小 MVP UI：
  - 改写说明输入框
  - 三个快捷模板按钮
  - 生成按钮和 loading 状态
  - 单次撤销按钮
  - AI 返回摘要展示
- 在 `apps/desktop/src/renderer/components/prompt/PromptQuickRewriteDialog.tsx` 新增非编辑态快速 AI 编辑弹窗：
  - 当前 Prompt 标题和预览
  - instruction 输入与快捷模板
  - Draft Preview 区
  - `应用并保存`
  - `应用后继续编辑`
- 在以下非编辑态入口接入 `AI Quick Edit`：
  - `apps/desktop/src/renderer/components/layout/MainContent.tsx` 详情页头部 icon-only 按钮
  - `apps/desktop/src/renderer/components/prompt/PromptDetailModal.tsx` 详情弹窗头部 icon-only 按钮
  - `apps/desktop/src/renderer/components/layout/MainContent.tsx` 右键菜单项
- 新增 `apps/desktop/src/renderer/components/prompt/PromptQuickRewriteTrigger.tsx`，把快速 AI 编辑入口收敛成统一 icon-only trigger，便于后续接入其他视图。
- 改写流程复用 renderer 侧现有 `chatCompletion()`，暂时沿用 `translation` 场景模型选择，不新增新的 `AIUsageScenario`。
- 成功改写后只更新当前草稿，不自动保存；用户仍需手动点击保存。
- 新增 i18n 文案到 7 个 locale：`en`、`zh`、`zh-TW`、`ja`、`fr`、`de`、`es`。
- 清理了 Prompt AI 改写区新增逻辑里的中文 fallback，避免触发 renderer i18n hardcode 回归规则。
- 非编辑态快速编辑会先调用 `rewritePromptDraft()` 生成结构化草稿，再在用户确认后调用 `updatePrompt()`；`继续编辑` 路径会把更新后的 Prompt 实例传给 `EditPromptModal`，避免打开旧草稿。
- 根据交互评审再次收敛：
  - 入口改为 icon-only，不再在头部按钮上显示文案
  - 快速 AI 编辑不再展示或写入 `notes`
  - 弹窗操作区固定在底部，避免滚动后看不到确认按钮
  - 预览区收紧高度，避免出现大面积空白框体
  - 修复 quick rewrite 指令输入区与模板 chips 的视觉重叠：把 `mt-3` 从 `Textarea` 内层移到外层容器，确保真实边框容器与上方模板保持间距

## Verification

- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/services/ai.test.ts tests/unit/components/prompt-modal-structure.test.tsx`
- `pnpm --filter @prompthub/desktop exec eslint src/renderer/components/prompt/EditPromptModal.tsx src/renderer/services/ai.ts tests/unit/services/ai.test.ts tests/unit/components/prompt-modal-structure.test.tsx`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/services/ai.test.ts tests/unit/components/prompt-quick-rewrite-dialog.test.tsx tests/unit/components/prompt-detail-modal.test.tsx tests/unit/components/prompt-modal-structure.test.tsx`
- `pnpm --filter @prompthub/desktop exec eslint src/renderer/components/prompt/PromptQuickRewriteDialog.tsx src/renderer/components/prompt/PromptDetailModal.tsx src/renderer/components/layout/MainContent.tsx src/renderer/services/ai.ts tests/unit/components/prompt-quick-rewrite-dialog.test.tsx tests/unit/components/prompt-detail-modal.test.tsx tests/unit/components/prompt-modal-structure.test.tsx tests/unit/services/ai.test.ts`

## Test Coverage Added

- `tests/unit/services/ai.test.ts`
  - 结构化 JSON 成功解析
  - 非 JSON 响应失败
  - 无可编辑字段返回失败
  - 字段类型错误失败
- `tests/unit/components/prompt-modal-structure.test.tsx`
  - 生成 AI 改写草稿并回填 description / userPrompt / notes
  - 撤销 AI 改写恢复原草稿
  - 快捷模板可启用改写按钮
  - 非法 AI 响应时展示错误 toast
- `tests/unit/components/prompt-quick-rewrite-dialog.test.tsx`
  - 生成非编辑态 AI 草稿并预览
  - 即使 AI 返回 `notes`，快速编辑预览也不会展示它
  - `继续编辑` 路径会保存并把更新后的 Prompt 传回上层
  - 非法 AI 响应时展示错误 toast
  - 指令输入区外层容器保留与模板 chips 的可见间距，避免焦点边框视觉重叠
- `tests/unit/components/prompt-quick-rewrite-trigger.test.tsx`
  - 共享 trigger 保持 icon-only，同时具备可访问名称与 tooltip
- `tests/unit/components/prompt-detail-modal.test.tsx`
  - 详情弹窗头部展示 `AI Quick Edit` 入口
- `tests/integration/components/main-content-context-move.integration.test.tsx`
  - 右键菜单里的 `AI Quick Edit` 会打开同一套快速编辑弹窗

## Verification (Latest)

- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/prompt-quick-rewrite-trigger.test.tsx tests/integration/components/main-content-context-move.integration.test.tsx`
- `pnpm --filter @prompthub/desktop exec eslint tests/unit/components/prompt-quick-rewrite-trigger.test.tsx tests/integration/components/main-content-context-move.integration.test.tsx`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/services/ai.test.ts tests/unit/components/prompt-quick-rewrite-dialog.test.tsx tests/unit/components/prompt-quick-rewrite-trigger.test.tsx tests/unit/components/prompt-detail-modal.test.tsx tests/unit/components/prompt-modal-structure.test.tsx tests/integration/components/main-content-context-move.integration.test.tsx`
- `pnpm --filter @prompthub/desktop exec eslint src/renderer/components/prompt/PromptQuickRewriteDialog.tsx src/renderer/components/prompt/PromptQuickRewriteTrigger.tsx src/renderer/components/prompt/PromptDetailModal.tsx src/renderer/components/layout/MainContent.tsx src/renderer/services/ai.ts tests/unit/services/ai.test.ts tests/unit/components/prompt-quick-rewrite-dialog.test.tsx tests/unit/components/prompt-quick-rewrite-trigger.test.tsx tests/unit/components/prompt-detail-modal.test.tsx tests/unit/components/prompt-modal-structure.test.tsx tests/integration/components/main-content-context-move.integration.test.tsx`

## Follow-up

- 表格、看板、图库卡片等视图暂未直接提供 Prompt AI 改写快捷入口；当前只覆盖详情页和详情弹窗。
- 当前改写仍复用 `translation` 场景默认模型；如果后续要独立配置，可新增专门的 rewrite 场景。

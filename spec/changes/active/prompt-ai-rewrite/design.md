# Design

## Overview

本次继续采用 renderer 侧直接调用 `chatCompletion()` 的方式实现，不新增主进程 IPC。原因：

1. `EditPromptModal` 现有翻译能力已经在 renderer 内直接解析 AI 模型配置并调用 `chatCompletion()`。
2. Prompt 改写属于纯文本/结构化草稿处理，不依赖本地文件系统或数据库事务。
3. Prompt 改写属于纯文本/结构化草稿处理，不依赖本地文件系统或数据库事务。
4. 第二版要把 AI 改写从“仅编辑态辅助”提升为“非编辑态快速编辑能力”，但仍可复用 renderer 侧现有模型解析和调用链。

## Rewrite Contract

新增 Prompt 改写服务函数，输入当前 Prompt 草稿与用户 instruction，要求模型返回严格 JSON：

```json
{
  "summary": "...",
  "description": "...",
  "systemPrompt": "...",
  "userPrompt": "...",
  "notes": "..."
}
```

约束：

- 缺省字段表示“不改动”
- 不允许模型返回 `tags` / `folderId` / `images` / `videos` / 英文版字段
- 保留用户原始意图，不做越界功能扩写

## UI

### 编辑态

保留 `EditPromptModal` 中已有的轻量 AI 改写区，继续作为“进入编辑器后的小步辅助改写”能力。

### 非编辑态快速入口

新增一个共享的 `PromptQuickRewriteDialog`，用于在用户未进入编辑界面时快速发起 AI 编辑。

第一版入口：

- 详情页头部操作区的 icon-only trigger
- `PromptDetailModal` 头部操作区的 icon-only trigger
- 右键菜单中的同名动作项

弹窗包含：

- 当前 Prompt 摘要（标题、类型、当前字段概览）
- 文本输入：用户描述想怎么改
- 快捷建议 chips：快速填充 instruction
- 生成按钮：触发 AI 改写
- 结果摘要条：说明 AI 已生成修改稿
- 字段级预览：`description` / `systemPrompt` / `userPrompt` / `notes`
- 两个确认动作：
- `应用并保存`
- `应用后继续编辑`

第一版不做复杂 diff，不做逐字段勾选应用，先提供“原文 + 改写结果”的明确预览。

额外约束：

- 非编辑态入口统一使用同一个 icon-only trigger 组件，便于后续接入表格、看板、图库等视图。
- 右键菜单与 icon trigger 走同一个 `PromptQuickRewriteDialog`。
- 快速 AI 编辑不暴露 `notes` 字段，避免 AI 修改用户个人备注。
- 底部操作按钮固定在弹窗底部，不随内容区滚动离开视口。

## State

`EditPromptModal` 本地已有：

- `rewriteInstruction`
- `isRewritingPrompt`
- `lastRewriteSummary`
- `lastRewriteSnapshot`

其中 `lastRewriteSnapshot` 用于单次撤销最近一次 AI 改写。

`PromptQuickRewriteDialog` 本地新增：

- `rewriteInstruction`
- `isRewritingPrompt`
- `rewriteSummary`
- `rewriteDraft`
- `pendingAction` (`save` / `edit`)

其中 `rewriteDraft` 表示 AI 返回但尚未提交到数据库的改写结果。

## Data Flow

1. 用户在非编辑态点击 `AI 快速编辑`
2. 弹窗读取当前 `Prompt`，用 `rewritePromptDraft()` 生成结构化改写结果
3. 结果仅保存在弹窗本地状态，不立刻写库
4. 用户点击：
   - `应用并保存`：调用 `updatePrompt(id, draft)`，关闭弹窗
   - `应用后继续编辑`：调用 `updatePrompt(id, draft)`，关闭快速弹窗，并打开 `EditPromptModal`

为避免“保存成功但打开编辑器时还是旧对象”，第二种路径在提交成功后需要把更新后的 Prompt 实例传回上层，再作为 `editingPrompt` 的初始值。

## Verification

- 结构测试：`EditPromptModal` 中原有 AI 改写区仍存在
- 结构测试：详情页 / `PromptDetailModal` 中出现 `AI 快速编辑` 入口
- 行为测试：快速编辑弹窗生成改写结果并展示预览
- 行为测试：`应用并保存` 后调用 `updatePrompt`
- 行为测试：`应用后继续编辑` 后提交改写并打开 `EditPromptModal`
- 错误测试：AI 返回非法 JSON 时给出错误 toast

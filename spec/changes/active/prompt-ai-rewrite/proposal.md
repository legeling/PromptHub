# Proposal

## Why

当前 Prompt 编辑器已经支持 AI 测试、双语翻译和多字段编辑，但还缺少一个“让 AI 直接改写当前 Prompt 草稿”的能力。用户现在如果想优化 Prompt，需要手动复制到外部模型中修改，再贴回 PromptHub，流程割裂且容易丢失上下文。

Rules 界面已经有“Ask AI to improve”的工作流，说明产品层面允许“AI 先生成草稿，用户再决定是否保存”的模式。Prompt 编辑也适合引入类似能力，但因为 Prompt 是结构化表单而不是单一文本文件，方案需要返回结构化字段更新，而不是整段自由文本。

## Scope

- In scope:
- 为桌面端 `EditPromptModal` 增加 Prompt AI 改写能力。
- 允许用户输入改写要求，并用 AI 生成新的 Prompt 草稿。
- AI 返回结构化 JSON，至少支持更新 `description`、`systemPrompt`、`userPrompt`、`notes`。
- 提供一个轻量 UI 入口，允许用户触发改写、查看应用结果、撤销最近一次 AI 改写。
- 补齐相关 i18n 文案与测试。

- Out of scope:
- 卡片视图、详情页或列表页上的 AI 改写快捷入口。
- `CreatePromptModal` 接入 AI 改写。
- 多模型对比改写、diff 可视化、字段级选择应用。
- 自动修改 `tags`、`folderId`、媒体资源或英文版本字段。

## Risks

- AI 如果返回自由文本而不是严格 JSON，会让结构化字段回填不稳定。
- Prompt 有中英文双语字段，第一版如果同时改写主语言和英文版，用户可能难以预期结果。
- 直接覆盖草稿会让用户担心“AI 改过头”，所以需要最小撤销能力。

## Rollback Thinking

- 如果结构化字段回填稳定性不足，最低可回退方案是只改写 `userPrompt` 字段，并保留其他字段不动。

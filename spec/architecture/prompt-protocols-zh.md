# 提示词协议类型与 Multi-shot 结构方案

本文档整理了主流 AI 厂商（OpenAI, Anthropic, Google Gemini）的消息协议标准，并基于此为 PromptHub 设计了 **Multi-shot（多轮范例）** 提示词的实现方案。此方案旨在实现类似 **Anthropic Workbench** 或 **Claude Code** 的多层级调试体验（参考 Issue #44）。

## 1. 核心需求分析

用户希望在 PromptHub 中不仅仅是编辑一段文本，而是能像在 API 后台调试那样，构建一个**结构化的对话历史**。
核心场景：

- **Few-shot Learning (少样本学习)**: 通过提供 `User` -> `Assistant` 的成对范例，教会模型特定的输出格式或逻辑。
- **Context Pre-filling (语境预设)**: 预设一段对话历史，让模型“认为”之前的交互已经发生，从而延续特定的状态。
- **Prompt Chaining 模拟**: 模拟多轮交互的中间状态进行调试。

---

## 2. 主流厂商协议对比

### 2.1 Anthropic (Claude)

Anthropic 的控制台（Workbench）和 API 明确区分了 **System Prompt** 和 **Conversation History**。

- **System Prompt**: 独立字段，不包含在对话数组中。
- **Messages**: 一个交替的 `user` 和 `assistant` 数组。
- **特点**: 强制要求通过 `user` 和 `assistant` 的轮替来构建 Context。

### 2.2 OpenAI Chat Completion

- **Messages**: `system`, `user`, `assistant` 均在同一个数组中。
- **特点**: 结构相对线性，System 只是数组中的第一个角色。

---

## 3. PromptHub 协议设计方案：`Structured Chat`

为了兼容所有厂商并提供最佳编辑体验，建议引入名为 `structured-chat` 的新协议类型。

### 3.1 数据结构定义

提示词不再是一段单纯的字符串，而是一个 JSON 对象：

````json
{
  "protocol": "structured-chat",
  "system_prompt": "你是一位资深的代码审计专家...", // 对应 System Prompt
  "messages": [
    {
      "id": "msg_1",
      "role": "user",
      "content": "这是一段有漏洞的 Python 代码：\n```python\nprint(eval(input()))\n```"
    },
    {
      "id": "msg_2",
      "role": "assistant",
      "content": "这段代码存在严重的安全漏洞。`eval()` 函数可以执行任意代码..."
    },
    {
      "id": "msg_3",
      "role": "user",
      "content": "实际任务：请审计以下代码：\n{{input_code}}"
    }
  ],
  "config": {
    "temperature": 0.7
  }
}
````

### 3.2 UI/UX 交互设计 (参考 Anthropic Workbench)

编辑器不再是一个大文本框，而是**块状编辑器 (Block Editor)**：

1.  **System Block (顶部)**:
    - 独立区域，专门用于输入 System Prompt。
    - 支持变量。
2.  **Conversation Blocks (中间)**:
    - 显示一个消息列表。
    - **添加按钮**:
      - `[+ User Message]`
      - `[+ Assistant Message]`
    - 用户可以像搭积木一样，点击添加多个层级的 User/Assistant 对话。
    - 每个 Block 支持独立复制、删除、移动顺序。

3.  **变量插值**:
    - 在任何 Block (System, User, Assistant) 中都可以使用 `{{variable}}` 语法。

### 3.3 厂商适配逻辑

当用户点击“立即运行”或“复制”时，系统根据当前选择的模型自动转换格式：

- **若选择 Claude 模型**:
  - 提取 `system_prompt` 字段作为 API 的 system 参数。
  - 将 `messages` 数组直接透传给 API。
- **若选择 OpenAI 模型**:
  - 构建一个新的数组：`[ {role: "system", content: system_prompt}, ...messages ]`。

---

## 4. 开发计划

### Phase 1: 数据层支持

- 修改 `PromptVersion` 表，支持存储 JSON 格式的 `content`。
- 引入 `type` 字段区分 `text` (普通文本) 和 `structured` (结构化对话)。

### Phase 2: 编辑器重构

- 开发 `StructuredPromptEditor` 组件。
- 实现 System / User / Assistant 的块状增删改查。
- 实现拖拽排序功能。

### Phase 3: 导入/导出增强

- 支持将结构化提示词导出为 `json` (OpenAI 兼容格式) 或 `yaml`。
- 支持一键复制为 Claude Code 风格的 CLI 命令。

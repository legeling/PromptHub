# Prompt Workspace Spec

## Purpose

本规范定义 PromptHub Prompt 工作区的稳定行为边界，包括 Prompt 文件化、文件夹表达、版本快照与内容真相源。

## Stable Requirements

### 1. Prompt Content Boundary

- Prompt 内容必须有稳定的持久化表示，允许后续索引、版本、导入导出和同步围绕其工作。
- 数据库存储与文件系统存储的职责应明确，避免真相源混乱。

### 2. Folder And Versioning Behavior

- Prompt 文件夹结构和版本快照属于稳定产品能力。
- 文件夹表达、Prompt 元数据与版本目录的设计应支持后续导入导出、同步和恢复。

### 2.1 CLI Prompt Selection

- CLI 的常用 Prompt 操作应支持通过 id、标题或查询词解析 Prompt，避免用户必须复制数据库 id。
- 当查询词只匹配一个 Prompt 时，CLI 可以直接执行读取、复制、使用、更新、删除或版本相关操作。
- 当查询词匹配多个 Prompt 时：
  - 交互式终端应显示编号列表并让用户选择。
  - 非交互调用必须返回冲突和候选项，不得静默选择第一个结果。

### 3. Stable Internal Sources

- Prompt 协议设计见 `spec/knowledge/structure/prompt-protocols-zh.md`。
- 数据布局事实见 `spec/knowledge/structure/data-layout-v0.5.5-zh.md`。

## Stable Scenarios

### Scenario: Contributor changes prompt workspace behavior

When prompt file layout, metadata contract, or versioning semantics change materially:

- they create a delta spec under `spec/changes/active/<change-key>/specs/prompt-workspace/spec.md`
- they sync durable behavior back into this stable spec after implementation

### Scenario: Internal tools need prompt truth source

When another system feature relies on prompt storage semantics:

- it should treat this spec and the linked architecture docs as the current truth source

# PromptHub Spec System

`spec/` 是 PromptHub 内部 SSD / spec 系统的唯一归属。所有内部需求、稳定真相文档、delta specs、规则、发布记录、问题追踪、历史变更与模板都放在这里；`docs/` 只保留对外说明文档。

PromptHub 当前采用的是一套 **最新 `spec-init` 边界 + OpenSpec 风格变更流** 的混合体系：

- 用 `spec-init` 的文档边界来区分 `workflow / knowledge / changes / records`
- 用 `spec/changes/active/<change-key>/specs/<domain>/spec.md` 承载活跃 delta specs

这意味着：

- 项目级文档分类更清楚
- 现有 change-based workflow 不需要推翻重来
- agent 可以按 `spec-init` 的边界理解文档职责
- 工程实现仍然可以按 PromptHub 现有的 `active change -> sync to stable docs` 节奏推进

## 当前采用的双层体系

### 1. `spec-init` 文档边界

- `spec/workflow/00-intake/`
- `spec/workflow/01-requirements/`
- `spec/workflow/02-design/`
- `spec/workflow/03-implementation/`
- `spec/workflow/04-verification/`
- `spec/workflow/05-tasks/`
- `spec/knowledge/context/`
- `spec/knowledge/structure/`
- `spec/knowledge/behavior/`
- `spec/knowledge/reference/`
- `spec/rules/`
- `spec/releases/`
- `spec/archive/`
- `spec/adr/`

这些目录定义“文档应该回答什么问题”。

说明：

- `spec/workflow/*` 与 `spec/knowledge/*` 是当前主入口
- 根目录下不再保留重复的 `00-intake` ~ `05-tasks` 目录

### 2. PromptHub 当前稳定真相源与变更流

- `spec/workflow/*`：项目级背景、需求、设计、实施、验证与任务入口
- `spec/knowledge/context/`：长期稳定的背景、术语、角色、产品边界
- `spec/knowledge/structure/`：稳定架构事实与工程约束
- `spec/knowledge/behavior/`：长期有效的业务逻辑、流程与状态语义
- `spec/knowledge/reference/`：固定资产、平台矩阵、协议与参考资料
- `spec/issues/`：问题跟踪
- `spec/changes/active/`：活跃 change
- `spec/changes/archive/`：完成或放弃的 change
- `spec/changes/legacy/`：历史内部文档保留

这些目录定义“PromptHub 把文档存放在哪里、如何随变更演进”。

## 与 `spec-init` 的关系

PromptHub 项目内已内置 `spec-init` skill：

- 本地路径：`.agents/skills/spec-init/`
- 上游仓库：`git@github.com:legeling/spec-init.git`
- 当前拓扑路由：`spec-init.topology.yml`

建议在需要梳理或补齐项目文档时，优先按该 skill 的边界来判断内容该写进哪一层文档。

## 目录地图

```text
spec/
├── README.md
├── workflow/
│   ├── 00-intake/
│   ├── 01-requirements/
│   ├── 02-design/
│   ├── 03-implementation/
│   ├── 04-verification/
│   └── 05-tasks/
├── knowledge/
│   ├── context/
│   ├── structure/
│   ├── behavior/
│   └── reference/
├── rules/
├── releases/
├── archive/
├── adr/
├── issues/
│   ├── README.md
│   ├── active/
│   └── archive/
├── changes/
│   ├── _templates/
│   ├── active/
│   ├── completed/
│   ├── archive/
│   └── legacy/
```

## 目录职责

### `spec-init` 边界入口

- `spec/workflow/00-intake/`：为什么值得做、谁来用、非目标与约束
- `spec/workflow/01-requirements/`：要交付什么、FR/NFR/AC
- `spec/workflow/02-design/`：当前阶段怎么交付、架构/模块/接口/数据/权衡
- `spec/workflow/03-implementation/`：实施节奏与阶段计划
- `spec/workflow/04-verification/`：验证策略与需求到测试映射
- `spec/workflow/05-tasks/`：当前可执行任务
- `spec/knowledge/context/`：长期稳定的业务背景、术语、角色、边界
- `spec/knowledge/structure/`：长期稳定的系统结构、模块边界、集成关系
- `spec/knowledge/behavior/`：长期稳定的流程、规则、状态流转和异常路径
- `spec/knowledge/reference/`：schema、样例、协议、固定参考资料
- `spec/rules/`：项目默认规则
- `spec/releases/`：版本级交付摘要
- `spec/archive/`：项目级归档入口
- `spec/adr/`：关键架构决策入口
- `spec/rules/document-routing-rules.md`：文档语义到目录路径的显式路由规则
- `spec/rules/submission-traceability-rules.md`：提交、commit、文档编号、引用关联和 PR 说明规则

### PromptHub 当前长期真相源

- `spec/workflow/*`：项目级 source of truth，回答为什么做、要交付什么、怎么做、怎么验证、现在做什么
- `spec/knowledge/context/`：长期稳定的术语、角色、实体与产品边界
- `spec/knowledge/structure/`：长期有效的内部架构约束、设计事实与工程规则
- `spec/knowledge/behavior/`：长期稳定、需要反复查阅的业务逻辑语义、流程和规则
- `spec/knowledge/reference/`：平台矩阵、canonical 文件约定、schema、协议、资源清单等固定参考资料
- `spec/issues/active/`：尚未收敛为具体实现变更的问题、质量风险、当前 open issue 快照
- `spec/issues/archive/`：已关闭 issue 与历史问题记录归档
- `spec/changes/active/`：正在实施的提案、delta specs、设计、任务与实施记录
- `spec/changes/completed/`：对齐 `spec-init` 的 completed 语义兼容入口
- `spec/changes/archive/`：已完成或已放弃的变更归档
- `spec/changes/legacy/`：历史平铺内部文档保留区；内容已从旧 `docs/` 原文恢复
- `spec/changes/_templates/`：新变更目录的模板

## 工作流

建议的内部 SSD 闭环：

`requirements -> proposal -> spec -> design -> tasks -> implementation -> sync -> archive`

执行约束：

- 非 trivial 的功能、迁移、重构、跨模块 bug 修复，先建 `spec/changes/active/<change-key>/`
- 行为变化先写 delta spec，再实施代码
- 实施完成后，把稳定结果同步回 `spec/workflow/*`、`spec/knowledge/*`、`spec/rules/`、`spec/releases/` 或 `spec/adr/`
- 历史旧文档不删除；若不再作为当前真相源，则归入 `spec/changes/legacy/` 或 `spec/changes/archive/`

推荐写法：

- 用 `spec-init` 的边界判断“内容该写进什么类型的文档”
- 长期稳定真相优先沉淀到 `spec/workflow/*`、`spec/knowledge/*`、`spec/rules/`、`spec/releases/`、`spec/adr/`
- 用 PromptHub 当前的 `spec/changes/active/` 体系承载非 trivial 变更
- 变更落地后再同步回长期稳定真相源

## 当前稳定入口

- 系统总规范：`spec/knowledge/context/system.md`
- 桌面端边界：`spec/knowledge/behavior/desktop.md`
- Web 自部署与服务边界：`spec/knowledge/behavior/web.md`
- Skill 体系规范：`spec/knowledge/behavior/skills.md`
- Plugin 体系规范：`spec/knowledge/behavior/plugins.md`
- 同步语义：`spec/knowledge/behavior/sync.md`
- 数据恢复与迁移安全：`spec/knowledge/behavior/data-recovery.md`
- Prompt 工作区：`spec/knowledge/behavior/prompt-workspace.md`
- Rules 稳定逻辑：`spec/knowledge/behavior/rules-workspace.md`
- Agent 平台固定资产：`spec/knowledge/reference/agent-platforms.md`
- Codex 扩展面映射：`spec/knowledge/reference/codex-extension-surfaces.md`
- Plugin Agent 适配矩阵：`spec/knowledge/reference/plugin-agent-adapter-matrix.md`
- 发布与文档同步：`spec/releases/release-rules.md`
- Issue 跟踪入口：`spec/issues/README.md`
- `spec-init` 项目级入口：`spec/workflow/`、`spec/knowledge/`、`spec/rules/`、`spec/releases/`、`spec/archive/`、`spec/adr/`
- 当前这次恢复工作：`spec/changes/active/restore-spec-lowercase/`

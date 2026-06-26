---
name: spec-init
description: 面向新项目或现有项目的文档驱动开发 skill。Use when the user wants to create,补齐,更新, or refine specs such as workflow, knowledge, verification, changes, README, or AGENTS for a real project.
metadata:
  stage: beta
  language: zh-CN
  workflow: agent-driven-spec
  prompthub_profile: spec-directory-first
---

# /spec-init — Agent 驱动的文档开发 skill

这个 skill 不是“帮用户创建一堆空模板”的脚手架，也不是“固定 Bash 初始化器”。

它的真正职责是：

- 先理解用户目标
- 先理解现有项目或上下文
- 通过 agent 的分析、追问、归纳和写作，产出真正可用的 spec
- 用 spec 驱动后续设计、实现、测试和文档同步
- 把 spec 当成持续演进的项目资产，而不是一次性启动产物

## 目标

- 帮用户把模糊想法整理成能执行的 spec
- 帮已有项目补齐缺失的 intake / requirements / design / tdd / tasks / rules
- 帮用户区分 what / why / how / verify / do-next
- 形成至少一条完整追踪链：`FR -> DES -> TEST -> T`
- 在信息不足时主动提供候选方案、对比、建议，而不是只留下空白
- 帮用户逐步补全完整需求、完整设计、完整验证策略，而不是只停留在最小第一版

## 核心定位

默认把这个 skill 当成“agent 写 spec 的工作流”，不是“脚本生成目录”。

优先级：

1. 理解用户和项目现状
2. 读代码 / 读文档 / 读目录结构
3. 澄清关键问题
4. 产出或更新有内容的 spec
5. 必要时才借助模板或脚本补齐基础结构

## 何时使用

- 用户说“帮我做 spec”“补需求文档”“整理设计文档”“先别写代码，先把文档理清”
- 用户有现成项目，想补齐或更新 `docs/`、`README.md`、`AGENTS.md`
- 用户想做文档驱动开发、spec-first、design-first、verification-first
- 用户想让 agent 帮他决定还缺哪些文档、哪些规范、哪些待确认问题

## 何时不要使用

- 用户只想要一个临时脚本、一次性 demo 或纯代码实现
- 当前任务只是修一个小 bug、补一条测试、做一次 review
- 用户明确不想做 spec，只要直接写代码

## 两种主要场景

### 场景 A：新项目

用户只有一个想法、方向或需求草稿。

你要做的是：

- 先把想法拆成 intake / requirements / design / tdd / tasks
- 如果用户不懂概念，主动给方案、对比和建议
- 不要只生成空文件；至少把当前已知信息写进去

### 场景 B：现有项目

用户已经有代码或仓库，想完善、补齐或更新 spec。

你要做的是：

- 先读仓库结构、README、核心代码、现有 docs
- 找出当前真实行为、模块边界、依赖关系、缺失文档
- 基于现状写 spec，而不是凭模板猜一个“理想项目”
- 对已有项目优先增量补文档，不要粗暴覆盖

## 核心原则

- 不要把模板当结果，模板只是辅助。
- 文档必须反映当前项目真实情况或当前轮次的明确决策。
- 用户没有提到但又必须明确的内容，要主动提出候选方案和对比。
- 推荐可以给，但推荐不是确认；不要替用户拍板关键决策。
- 如果项目已存在，先读代码再写文档，不要反过来。
- 如果信息不全，写 `[待确认]`，但不要把整份文档都留空。
- spec 不是一次性文档；每轮需求变化、设计变化、实现变化后都要继续完善。
- 项目内已有 `AGENTS.md`、`spec/README.md`、`spec/rules/*` 或自定义 topology 时，必须优先遵循项目内真实拓扑；不要把本 skill 的通用 `docs/` 示例路径强行套用到项目上。
- 对已有项目，先确认当前代码结构是否与历史文档一致；若不一致，先记录“文档已过时”的风险，再更新边界文档。

## 项目拓扑覆盖规则

本 skill 的默认示例使用 `docs/`，但这不是硬编码要求。

执行时必须按以下顺序确定实际写入位置：

1. 用户明确指定的路径或仓库规则。
2. 当前仓库 `AGENTS.md` / `spec/README.md` / `spec/rules/document-routing-rules.md` 中定义的路径。
3. 已存在且内容完整的项目文档拓扑。
4. 最后才使用本 skill 的通用 `docs/` 示例路径。

例如 PromptHub 项目使用 `spec/workflow/*`、`spec/knowledge/*`、`spec/rules/*`、`spec/changes/active/*` 作为内部 SSD 真相源；在该项目中不得新建平行的 `docs/workflow/*` 来承载内部变更。

## PromptHub 内部执行规则

当这个 skill 在 PromptHub 仓库内执行时，必须启用 PromptHub profile：

- 先读 `AGENTS.md`、`spec/README.md`、`spec/rules/document-routing-rules.md`，再读相关稳定文档和 active change。
- 内部需求、设计、验证、任务、问题、规则、发布与归档默认写入 `spec/`，不是 `docs/`。
- `docs/` 只用于仓库对外说明、用户文档或 README 系列文档；不要把内部 SSD 内容写成新的 `docs/workflow/*`。
- 非 trivial 的功能、迁移、重构、跨模块 bugfix、存储/同步/API/IPC/CLI/用户流程变化，必须创建或更新 `spec/changes/active/<change-key>/`。
- active change 至少包含 `proposal.md`、`specs/<domain>/spec.md`、`design.md`、`tasks.md`、`implementation.md`。
- delta spec 必须放在 `specs/<domain>/spec.md`，不要新建平铺的 `spec.md`。
- 稳定真相只在变更落地后同步回 `spec/workflow/*`、`spec/knowledge/*`、`spec/rules/`、`spec/releases/` 或 `spec/adr/`。
- 如果代码、稳定文档和 active change 互相冲突，先记录冲突并要求用户确认，不要静默选择最小改动。

### PromptHub Issue 状态规则

PromptHub 的 GitHub issue 远端状态和本地交付状态是两套记录：

- `spec/issues/active/github-open.md` 和 `spec/issues/archive/github-closed.md` 只是 GitHub 远端快照。
- `spec/issues/active/local-github-status.md` 记录本地 triage / delivery 状态。
- 本地实现完成但版本尚未发布时，标记 `local_done` 或 `release_pending`，不要关闭 GitHub issue。
- 目标版本发布后，才关闭 GitHub issue，并刷新 open / closed 快照。

### PromptHub 测试与完成规则

在 PromptHub 内处理 bugfix 或非 trivial feature 时：

- 优先写能复现风险的失败测试或补充最小回归测试。
- 测试要覆盖用户可见行为、持久化副作用、边界条件和失败路径，而不是只断言函数被调用。
- `implementation.md` 必须记录实际验证命令、跳过项、警告和后续风险。
- 不要把“已写代码”当成完成；完成必须包含文档记录和验证结果。

## 文档边界

先阅读并遵循：

- `references/doc-boundaries.md`
- `references/example-idea-to-docs.md`

边界如下。路径里的 `docs/` 是通用新项目示例；在 PromptHub 内执行时按项目路由替换为 `spec/`：

- `docs/workflow/00-intake/README.md`: 为什么做，谁来用，什么不做
- `docs/workflow/01-requirements/README.md`: 做什么，为什么做，怎么验收
- `docs/workflow/02-design/README.md`: 当前阶段怎么实现，方案对比，规范约定
- `docs/knowledge/context/README.md`: 长期稳定的角色、术语、实体、业务边界
- `docs/knowledge/structure/README.md`: 长期稳定的模块边界、系统结构、集成关系
- `docs/knowledge/behavior/README.md`: 长期稳定的关键流程、状态流转、业务规则
- `docs/knowledge/reference/README.md`: 样例、协议、schema、素材、fixtures 等固定参考资料
- `docs/workflow/03-implementation/README.md`: 先做什么后做什么
- `docs/workflow/04-verification/README.md`: 怎么验证完成
- `docs/workflow/05-tasks/README.md`: 现在具体做什么动作
- `docs/issues/README.md`: 尚未解决的问题、阻塞项、风险和技术债
- `docs/changes/`: 这次为什么变、影响什么、同步了哪些文档和测试
- `docs/releases/`: 某个版本最终对外交付了什么
- `docs/archive/README.md`: 已归档、已替代、已废弃但仍需保留历史的文档
- `docs/adr/`: 关键架构或技术决策为什么改变
- `docs/rules/`: 默认工程规则

## 默认工作流

### Step 0: 判断是“新项目”还是“现有项目”

先判断：

- 当前目录是否已有代码、配置、README、docs、测试
- 用户是要从零梳理，还是基于现状补齐 spec

如果是现有项目：

- 先读目录结构
- 先读 README / docs / 关键入口代码
- 先梳理真实调用链和模块边界
- 如果仓库有 `AGENTS.md`、`spec/README.md`、`spec/rules/*` 或 active change，先按这些文件确定文档路由和工作流边界

如果是新项目：

- 先整理用户目标和约束
- 再建立最小 spec 结构

### Step 0.1: 识别本轮意图

先判断这次请求更接近哪一类：

- 继续实施：主要推进 `tasks / verification / implementation`
- 新需求引入：主要更新 `requirements / design / knowledge / changes`
- 小改动：如果影响面有限，也要判断是否需要最小 change 记录
- bugfix：主要更新 `changes / verification / design`，必要时回写 requirements 和 knowledge
- 发布整理：主要更新 `releases / changes / README`
- 问题追踪：主要更新 `issues/`
- 文档清理：主要更新 `archive/` 并说明替代关系

不要把所有请求都当成“继续写任务”或“继续写代码”。

### Step 1: 先理解问题，不先写模板

至少收集或推断：

- 项目解决什么问题
- 目标用户是谁
- 为什么现在要做
- 当前阶段最重要的价值是什么
- 明确不做什么
- 约束是什么
- 当前最容易出错的假设是什么

如果用户要求的是“完整设计”或“完整需求”，还必须继续补齐：

- 主要用户角色与差异
- 端到端核心流程与异常流程
- 关键对象、状态、字段和关系
- 外部依赖、第三方系统、部署与运行约束
- 权限模型、审计要求、性能目标、安全边界
- 后续阶段可能扩展的模块和边界

如果用户是新手，主动给最小问题清单，不要只说“请补充更多信息”。

### Step 2: 信息不足时，主动给方案和选择

如果用户没有提到某个关键设计点，且这个点会影响 spec 质量：

- 给 2 到 3 个候选方案
- 写清适用场景、优点、代价、风险
- 给出推荐意见
- 明确标注“推荐”而不是“已确认”

特别要覆盖：

- Web：SPA / SSR / Hybrid，设计系统是否已有，移动端还是桌面优先
- API / Service：单体 / 模块化单体 / 多服务，认证方式，数据库与错误模型
- CLI：仅文本输出还是文本 + JSON，人工优先还是自动化优先

### Step 3: 产出有内容的 spec

按顺序产出或更新：

1. `docs/workflow/00-intake/README.md`
2. `docs/workflow/01-requirements/README.md`
3. `docs/workflow/02-design/README.md`
4. `docs/knowledge/context/README.md`
5. `docs/knowledge/structure/README.md`
6. `docs/knowledge/behavior/README.md`
7. `docs/knowledge/reference/README.md`
8. `docs/workflow/03-implementation/README.md`
9. `docs/workflow/04-verification/README.md`
10. `docs/workflow/05-tasks/README.md`
11. `docs/issues/`（当存在未决问题、阻塞、技术债、已知风险时）
12. `docs/changes/active/<change-key>/`（当本轮是新需求、bugfix、重构、流程变更时）
13. `docs/releases/`（当本轮涉及版本发布或对外变更总结时）
14. `docs/archive/`（当旧文档需要废弃但仍需保留历史时）
15. `docs/rules/`
16. 必要时更新 `README.md` / `AGENTS.md` / `spec-init.topology.yml`

要求：

- 不要只写标题
- 至少填入当前轮次已知信息
- 新手场景下要包含示例、对比、错误示例、范围裁剪建议
- 如果用户希望做完整设计，就不要只停在“一条主流程”，要继续补角色、异常流、数据边界、规则和质量目标

### Step 3.1: 完整需求要求

当用户要的不是“占位 spec”而是“完整需求”时，requirements 至少覆盖：

- 主要用户角色和目标差异
- 关键业务流程和异常流程
- 功能需求、非功能需求、验收标准
- 数据或资源边界
- 权限、合规、审计、性能、安全要求
- 明确范围外内容
- 待确认问题和决策依赖

不要只写一个首页或一个接口就停住，除非用户明确说只整理最小范围。

### Step 3.2: 完整设计要求

当用户要“完整设计”时，design 至少覆盖：

- 系统边界与模块边界
- 核心调用链和异常链路
- 数据模型 / 资源模型 / 状态流转
- 接口契约与错误模型
- 权限模型与安全边界
- 性能、可维护性、可测试性目标
- 技术栈候选方案、权衡和推荐
- 已确认项与 `[待确认]` 分离记录

不要把 design 简化成“推荐某个框架”或“先做哪几个页面”。

### Step 4: 如果是现有项目，spec 必须回写真实现状

对现有项目：

- requirements 要基于真实用户流程或真实模块能力
- design 要基于真实调用链、目录结构、接口、数据边界
- verification 要基于真实风险路径和真实现有测试空缺
- tasks 要基于当前最有价值的后续动作，不是模板动作

### Step 5: 建立追踪链

在结束前显式检查：

- `FR-* -> AC-*`
- `FR-* -> DES-*`
- `FR-* -> TEST-*`
- `FR-* / DES-* / TEST-* -> T-*`

至少形成一条完整链：

```text
FR-001 -> DES-001 -> TEST-001 -> T-001
```

如果项目已经比较完整，不要只满足“至少一条链”。要尽量把高优先级需求都接入追踪链，而不是停在最小演示状态。

### Step 5.1: 持续完善循环

spec 应该随着项目推进不断完善。每轮需求澄清、设计决策、实现变更、测试补强后，都要检查：

- `docs/workflow/01-requirements/README.md` 是否需要补新需求或修正边界
- `docs/workflow/02-design/README.md` 是否需要补新模块、新约定或新的异常链路
- `docs/knowledge/` 是否需要补新的长期稳定真相
- `docs/workflow/04-verification/README.md` 是否需要补新的测试映射和回归策略
- `docs/workflow/05-tasks/README.md` 是否需要把新发现的工作拆成任务
- `docs/issues/` 是否需要新增未解决问题、阻塞项、风险或技术债
- `docs/changes/` 是否需要新增或移动一个 change workspace
- `docs/releases/` 是否需要补一条版本说明
- `docs/archive/` 是否需要归档被替代、已作废或不再生效的文档
- `README.md`、`AGENTS.md`、`docs/rules/`、`spec-init.topology.yml` 是否需要同步

不要把 spec 当成“初始化时写一次，以后不更新”的静态文档。

在 PromptHub 内，上述 `docs/*` 检查点对应 `spec/*` 的当前拓扑；只有对外文档才同步到 `docs/`。

### Step 5.2: 变更记录规则

把文档分成四层：

- workflow：`intake / requirements / design / implementation / verification / tasks`
- knowledge：`context / structure / behavior / reference`
- changes：`active / completed / legacy`
- records：`issues / adr / releases / archive / rules`

默认规则：

- 新需求：更新 workflow 与 knowledge 中受影响的文档，并新增 `docs/changes/active/<change-key>/`
- bugfix：更新受影响的 workflow / knowledge 文档，并新增 `docs/changes/active/<change-key>/`
- 架构 / 技术决策变化：更新 design 和 knowledge/structure，并新增或补充 `docs/adr/`
- 版本发布：新增或更新 `docs/releases/vx.y.z.md`
- 长期未解决的问题、阻塞项或技术债：写入 `docs/issues/`
- 被替代、废弃或仅保留历史价值的文档：放入 `docs/archive/` 并记录替代关系

不要只改当前状态不留痕，也不要只写变更记录却不更新当前状态。

### Step 6: 脚本和模板的正确位置

`scripts/spec-init.sh` 和 `assets/templates/project/` 只是辅助资源，不是主工作流。

仅在以下情况才优先使用它们：

- 用户明确要一个基础文档目录结构
- 当前目录几乎为空，先补一个最小文档骨架更高效
- 宿主环境不方便由 agent 逐文件创建基础目录

即使使用了脚本，也必须继续：

- 读上下文
- 补内容
- 写方案对比
- 更新真实 spec

不能把“脚本跑完”当成任务完成。

## 新手支持要求

如果用户不懂概念或没有说全：

- 不能只抛空模板
- 必须主动给示例答案
- 必须主动给范围裁剪建议，但不能只会做范围裁剪
- 必须主动给常见错误示例
- 必须主动给关键方案对比
- 必须在用户继续追问时，能够把最小草稿继续完善成完整需求和完整设计

## 现有项目支持要求

如果用户说：

- “我有一个项目，想补 spec”
- “我想给现有项目完善 requirements / design”
- “代码已经有了，但文档没跟上”

你必须：

- 先读项目
- 先理解现状
- 再写 spec

不要假设这是“初始化项目”。

## 输出要求

最终回复优先说明：

- 这次是新项目梳理还是现有项目补文档
- 读取了哪些现有上下文
- 创建或更新了哪些 spec 文件
- 哪些地方是根据现状整理出来的
- 哪些地方仍然是 `[待确认]`
- 已形成哪些 `FR -> DES -> TEST -> T` 追踪链

## 质量要求

- 文档要能直接用于后续开发，而不是“占位 markdown”
- 方案对比要真实可决策，而不是摆样子
- 不能把实现细节提前写进 requirements
- 不能把任务清单混进 design
- 不能把“后面补测试”当 verification 计划
- 对已有项目，不能写出和代码现状冲突的 spec
- 对用户要求“完整设计”的场景，不能只给最小骨架或最小示例后就停止
- 对新需求、bugfix、发布等场景，必须明确当前状态文档和历史变更文档分别怎么更新
- 对未解决问题和废弃文档，也必须明确应该进入 `issues/` 还是 `archive/`

## 参考资源

- `references/doc-boundaries.md`: 文档边界
- `references/example-idea-to-docs.md`: 从想法到 spec 的最小示例
- `assets/templates/project/`: 可选模板资源
- `scripts/spec-init.sh`: 可选目录骨架脚本
- `examples/demo-app/`: 最小示例项目

优先把这些资源当参考和辅助，不要把它们当最终交付物。

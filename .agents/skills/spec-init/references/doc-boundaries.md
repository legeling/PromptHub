# 文档边界速查

这个文件用来帮开发者区分“需求”“设计”“实现计划”“测试计划”“任务拆解”和“项目规则”。

## 路径拓扑适配

本文档里的 `docs/` 路径是通用新项目示例，不是固定要求。执行前必须先看项目自己的拓扑规则。

在 PromptHub 仓库内，内部 SSD 文档使用：

- `spec/workflow/*` 替代 `docs/workflow/*`
- `spec/knowledge/*` 替代 `docs/knowledge/*`
- `spec/changes/active/<change-key>/` 替代 `docs/changes/active/<change-key>/`
- `spec/issues/` 替代 `docs/issues/`
- `spec/rules/`、`spec/releases/`、`spec/archive/`、`spec/adr/` 承载内部 records

`docs/` 在 PromptHub 中主要保留对外文档，不承载内部 active change 或稳定 SSD 真相。

PromptHub 的非 trivial 工作还要求 active change 目录包含：

- `proposal.md`
- `specs/<domain>/spec.md`
- `design.md`
- `tasks.md`
- `implementation.md`

## 一句话区分

- project intake: 这个问题值不值得做
- requirements: 要做成什么
- design: 打算怎么做
- implementation plan: 先做什么后做什么
- verification plan: 如何证明做对了
- tasks: 现在具体做哪一步
- rules: 项目默认遵循什么工程规范

## 速查表

| 文档 | 回答的问题 | 应该写 | 不该写 | 完成标志 |
|---|---|---|---|---|
| `docs/workflow/00-intake/README.md` | 这件事为什么值得做 | 背景、用户、场景、目标、非目标、约束 | 具体技术选型、数据库表、接口实现 | 团队能说清项目边界 |
| `docs/workflow/01-requirements/README.md` | 我们要交付什么 | 用户故事、FR、NFR、AC、范围外 | React/Next.js/Postgres、类名、表名、接口细节 | 别人不看代码也知道最终要交付什么 |
| `docs/workflow/02-design/README.md` | 当前阶段怎么交付 | 架构、模块、数据、接口、权衡、风险 | 再重复背景、列很碎的执行任务 | 工程师知道该怎么搭当前结构 |
| `docs/knowledge/context/README.md` | 长期稳定的业务真相是什么 | 术语、角色、实体、业务边界 | 当前版本任务安排 | 长期背景不会只靠聊天留存 |
| `docs/knowledge/structure/README.md` | 长期稳定的系统结构是什么 | 模块边界、集成关系、数据边界 | 短期排期 | 后来人知道系统骨架 |
| `docs/knowledge/behavior/README.md` | 长期稳定的关键行为是什么 | 流程、状态流转、规则、异常路径 | 临时 patch 说明 | 关键逻辑不会反复口述 |
| `docs/knowledge/reference/README.md` | 有哪些固定参考资料 | 协议、schema、样例、素材、fixtures | 临时讨论 | 常用参考资料有固定落点 |
| `docs/workflow/03-implementation/README.md` | 先做什么 | 里程碑、依赖、风险优先级、交付顺序 | 太细的函数名、临时思考记录 | 团队知道实施节奏 |
| `docs/workflow/04-verification/README.md` | 怎么证明完成 | 测试层次、需求到测试映射、首批失败测试、回归策略 | 技术选型争论、产品背景 | 团队知道如何验证 |
| `docs/workflow/05-tasks/README.md` | 现在做什么 | 可执行任务、依赖、关联文档 ID | 抽象口号、无法验收的描述 | 任务可以被直接执行 |
| `docs/changes/active/<change-key>/` | 这次为什么变、影响什么 | 变更背景、设计调整、验证、任务、影响范围 | 项目长期真相 | 单次 change 可被完整追踪 |
| `docs/rules/` | 默认如何工作 | 编码、测试、文档同步、完成定义规则 | 具体业务需求细节 | 团队默认规则已沉淀到项目内 |

## 常见混淆

### 1. 需求不是设计

错误写法：

- “系统使用 Next.js + PostgreSQL + Prisma 实现用户登录。”

为什么错：

- 这已经在说“怎么做”，不是“要做什么”。

正确拆分：

- requirements 里写：“用户可以使用邮箱和密码完成注册、登录、退出，并在忘记密码时重置账户访问权。”
- design 里写：“鉴权服务采用 [待定方案]；用户实体包含 [字段]；密码使用单向哈希存储。”

### 2. 设计不是任务清单

错误写法：

- “先创建 `auth.service.ts`，再写 `loginController`，再接数据库。”

为什么错：

- 这是执行顺序，不是设计。

正确拆分：

- design 里写：“认证模块负责身份校验、令牌签发与会话失效。”
- implementation plan 里写：“里程碑 1 完成鉴权领域模型与接口；里程碑 2 接入持久化。”
- tasks 里写：“T-003 实现邮箱密码登录接口并补充失败路径测试。”

### 3. verification 计划不是测试代码

错误写法：

- “后面补 pytest。”

为什么错：

- 这不是计划，只是拖延。

正确写法：

- “FR-003 对应单元测试：密码校验规则；集成测试：登录接口成功 / 失败路径；回归测试：密码重置后旧令牌失效。”

### 4. rules 不是聊天约定

错误写法：

- “这个项目以后都要先补测试，大家记一下。”

为什么错：

- 规则只在聊天里，后续成员和 agent 都看不到。

正确写法：

- 把默认规则写进 `docs/rules/testing-standards.md` 或 `docs/rules/doc-sync-rules.md`。

## 推荐写作顺序

1. 先写 `docs/workflow/00-intake/README.md`
2. 再写 `docs/workflow/01-requirements/README.md`
3. 再写 `docs/workflow/02-design/README.md`
4. 把长期稳定真相写进 `docs/knowledge/`
5. 设计稳定后写 `docs/workflow/03-implementation/README.md`
6. 开工前写 `docs/workflow/04-verification/README.md`
7. 最后拆 `docs/workflow/05-tasks/README.md`
8. 为当前工作建立 `docs/changes/active/<change-key>/`
9. 再把长期有效的工程规则沉淀进 `docs/rules/`

## 一个简单判断法

当你不确定内容该写进哪份文档时，问自己：

- 这是在定义目标吗？放 workflow 的 intake 或 requirements。
- 这是在解释当前阶段方案吗？放 workflow 的 design。
- 这是长期稳定事实吗？放 knowledge。
- 这是在安排节奏吗？放 implementation plan。
- 这是在定义验证方式吗？放 verification plan。
- 这是在描述具体动作吗？放 tasks。
- 这是某一次具体变更吗？放 changes。
- 这是在定义项目默认做法吗？放 rules。

## 好的文档应该怎样衔接

- `FR-001` 出现在 `docs/workflow/01-requirements/README.md`
- `DES-001` 在 `docs/workflow/02-design/README.md` 说明如何满足 `FR-001`
- `TEST-001` 在 `docs/workflow/04-verification/README.md` 说明如何验证 `FR-001`
- `T-001` 在 `docs/workflow/05-tasks/README.md` 关联 `FR-001`、`DES-001`、`TEST-001`
- 长期稳定的角色、结构或规则继续沉淀到 `docs/knowledge/`
- 项目默认约束写进 `docs/rules/`

这样文档不是一堆孤立文件，而是一条可追踪的链路和一套可执行的工作规则。

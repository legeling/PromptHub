# PromptHub Testing Standards

## 基本原则

- bugfix 和非平凡新功能默认先写失败测试，再实现。
- 高优先级需求必须有自动化验证。
- bug 修复必须补回归测试。
- 测试必须服务真实风险，而不是为了制造覆盖率数字。
- 测试应验证行为，不应过度绑定内部实现。
- 新增或修改的生产代码必须以 100% 行覆盖、函数覆盖、分支覆盖、条件覆盖为门禁目标。
- 数据库、文件系统持久化、同步、IPC/preload、安装/导入/导出、安全、发布 harness 等关键边界模块，变更行为必须做到 100% 分支和条件覆盖。
- 如果历史文件整体暂时达不到 100%，active change 必须记录遗留未覆盖分支；本次新增和修改的分支/条件仍必须 100% 覆盖。
- 覆盖率不能替代测试质量。即使覆盖率达到 100%，缺少边界、异常、回滚、fuzz、安全或性能验证时，也不能视为完成。

## 测试方法矩阵

非平凡变更不能只看覆盖率数字，必须按风险选择并记录测试方法：

- 黑盒行为测试：只看用户可见行为、持久化结果、文件系统结果、API/IPC 返回，不依赖内部实现。
- 白盒分支测试：覆盖新增或修改的判断、guard、fallback、错误路径、条件组合。
- 边界与 fuzz 测试：覆盖空值、非法类型、路径穿越、Unicode/特殊字符、大 payload、重复身份、奇怪文件名、缺失字段等。
- 安全测试：覆盖注入、路径穿越、SSRF/内网源、软链接、权限边界、敏感信息、篡改检测等相关风险。
- 性能/压力测试：覆盖大批量数据、大文件/多文件、重复快速操作、并发式调用、时间和内存预算。
- 集成/契约测试：覆盖真实 DB、文件系统、IPC/preload、CLI/API、同步、平台目录等边界；mock 会隐藏 bug 时必须用真实或等价 fixture。
- 失败/回滚测试：覆盖 clone/copy/sync/DB/API 任一外部边界失败后的状态，不允许留下半成品。

## UI 操作验证

UI 可见变更必须在运行中的界面里被实际操作。单元测试和静态截图不能替代这个门槛。

- 桌面端变更应优先运行 Electron/Vite 开发环境或可替代页面，操作入口、按钮、菜单、弹窗、拖拽、筛选、排序、安装、删除、更新、同步等关键行为。
- Web 变更应优先使用 Playwright 或 in-app browser 执行主流程，并在关键 viewport / 状态下截图或记录观察结果。
- 不能自动化时，必须在 active change 的 `implementation.md` 记录手动步骤、观察结果和自动化阻塞原因。
- UI 验收必须检查主流程可用性、控件可点击、文本不重叠、不截断关键内容、状态提示位置合理、loading/empty/error 状态不破坏布局。
- 对已经被用户指出的问题，回归验证必须操作同一个入口和同一类数据，而不能只检查代码路径。

## 单元测试与白盒审计

UI 流程背后的业务逻辑不能只靠端到端操作兜底。以下逻辑变更必须优先补最低有效层测试：

- prompt 排序、筛选、关系统计、复制、语言模式和派生状态。
- Skill / Plugin / MCP 的安装、删除、分发、更新检测、来源比较、软链接/复制策略、路径过滤和回滚。
- 网络代理、镜像源、同步范围、备份/恢复、远端差异比较和版本检测。
- 设置项迁移、配置卸载、残留清理、权限判断和默认值合并。

白盒测试必须覆盖新增或修改的判断、guard、fallback、错误路径和条件组合。只验证 happy path 或只断言 mock 被调用，不能作为完成依据。

## 静态扫描与复用审计

非平凡变更必须记录一次有针对性的静态扫描或人工白盒审计。扫描命令应服务具体风险，而不是机械执行固定命令。

常见扫描方向：

- 重复 UI / 重复逻辑：同类 card、badge、delete confirmation、store selector、service helper 是否已有实现。
- 网络路径：是否存在绕过代理或镜像源配置的 `fetch`、`axios`、`git clone`、下载逻辑。
- 文件系统风险：硬编码用户目录、路径穿越、隐藏文件误对比、元数据误同步、软链接处理、删除无确认。
- 数据完整性：内容截断、语言字段串用、系统/用户提示词混复制、排序比较器未接入 UI state。
- 安全风险：raw HTML、命令注入、SSRF-like 源、敏感信息落日志、空 catch 或吞错。
- 临时代码：TODO 占位、假数据、硬编码 mock、只为本机路径工作的分支。

扫描结果必须写入 active change；如果发现重复实现，应优先复用或记录为什么暂不抽象。

## 当前测试层次

- White-box Unit：验证纯逻辑、边界条件、规则与数据转换
- Integration：验证模块协作、数据库、IPC、服务编排
- E2E：验证最关键的用户流程
- Performance：验证关键路径与长列表 / 大数据量场景
- Security：验证鉴权、权限、输入校验与敏感信息处理

## PromptHub 项目要求

- 修改需求或行为前，先检查 `spec/workflow/04-verification/README.md` 是否需要同步。
- 引入新风险路径时，要把回归策略写进 verification 或当前 change 工作区。
- 非文档/非机械改动必须遵循 `spec/rules/tdd-design-gate.md`：先理解设计边界，先写能失败的测试，再实现。
- TDD 不能只写 happy path；每个非平凡变更至少覆盖黑盒行为、白盒分支、边界输入、失败/回滚路径。关键持久化和安全路径还必须覆盖 fuzz/adversarial 和压力场景。
- 如果当前设计、稳定文档、active change 或用户需求之间存在冲突，必须暂停并向用户确认，不允许用最小代码改动自行拍板。
- 发布准入必须走根级 release harness；不要把 desktop-only、web-only 或重复嵌套的聚合脚本当成完整发布验证。
- 用户报告的线上 bug 修复时，必须补一条能复现原失败条件的回归测试，并记录它属于哪个 harness 层。优先选择最低有效层，只有跨模块、跨进程或真实 UI 流程风险才升级到 integration / E2E。
- Skill 系统 bugfix 必须先检查 `spec/knowledge/reference/skill-defect-taxonomy.md` 给 bug 定性，再检查 `spec/knowledge/reference/skill-regression-test-matrix.md` 选择代表性回归测试。先补失败测试，再修代码。
- Skill 安装、删除、分发、扫描、商店状态测试不能只断言 mock 被调用；必须断言用户依赖的持久化结果、文件系统结果或 UI 可见状态。
- 自定义 Git/Gitea、软链接、复制安装、同名不同源、嵌套目录文件浏览必须作为 Skill 回归测试的标准 fixture 组合，不得只用单个 `SKILL.md` happy path。
- Skill package 边界测试必须覆盖：真实或等价本地 Git fixture、完整目录 inventory、`.git`/`.prompthub` 过滤、软链接过滤、路径穿越、缺失 `SKILL.md`、多 Skill 歧义、同 slug 不同 source、安装失败回滚、大量文件压力、文件树/安全扫描下游消费。
- UI 可见变更必须记录真实操作步骤和观察结果；涉及桌面界面时，不能只用 `git diff --check` 或单元测试代替验收。
- 复用是验收项：同一类 Skill / Plugin / MCP / Agent / Store / Settings UI 不能随意重复造一套样式或逻辑。
- PromptHub 已有的长期测试标准以 `AGENTS.md` 为主，本文件作为项目内规则入口补充。

## 当前主要真相源

- `AGENTS.md`
- `spec/workflow/04-verification/README.md`

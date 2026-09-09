# PromptHub Testing Standards

## 基本原则

- bugfix 和非平凡新功能默认先写失败测试，再实现。
- 高优先级需求必须有自动化验证。
- bug 修复必须补回归测试。
- 测试必须服务真实风险，而不是为了制造覆盖率数字。
- 测试应验证行为，不应过度绑定内部实现。
- 新增或修改的生产代码必须以 100% 行覆盖、函数覆盖、分支覆盖、条件覆盖为门禁目标。
- 数据库、文件系统持久化、同步、IPC/preload、安装/导入/导出、安全、发布 harness 等关键边界模块，变更行为必须做到 100% 分支和条件覆盖。
- 如果历史文件整体暂时达不到 100%，相关主题或已有计划必须记录遗留未覆盖分支；本次新增和修改的分支/条件仍必须 100% 覆盖。
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

UI 可见变更必须有实际操作证据。执行 GUI 控制前仍需用户明确授权；未获授权时完成允许的检查并如实标注 UI 验收未执行，不能以此规则推定授权。单元测试和静态截图不能替代实际操作。

- 桌面端变更应优先运行 Electron/Vite 开发环境或可替代页面，操作入口、按钮、菜单、弹窗、拖拽、筛选、排序、安装、删除、更新、同步等关键行为。
- Web 变更应优先使用 Playwright 或 in-app browser 执行主流程，并在关键 viewport / 状态下截图或记录观察结果。
- 不能自动化时，必须在已有计划或验收记录中 记录手动步骤、观察结果和自动化阻塞原因。
- UI 验收必须检查主流程可用性、控件可点击、文本不重叠、不截断关键内容、状态提示位置合理、loading/empty/error 状态不破坏布局。
- 对已经被用户指出的问题，回归验证必须操作同一个入口和同一类数据，而不能只检查代码路径。

## Agent 辅助测试边界

- 用户可见多步骤流程、Electron 跨进程行为、持久化/重启、安装/删除、同步/恢复和真实 UI 回归，应该优先使用仓库级 Playwright Test Agents 辅助制定 E2E 计划和生成测试；纯逻辑或单一数据边界仍优先使用最低有效层测试。
- 已有确定性 E2E 只需重复执行时，直接运行聚焦 Playwright 测试，不得为了形式完整重复调用 Planner 或 Generator。
- 仓库级 Playwright Test Agents 只负责测试计划、E2E 测试生成和失败诊断；它们不是发布门禁本身。
- Agent 定义必须保存在 `.codex/agents/`，使用仓库锁定的 Playwright 版本和桌面配置，不得依赖或修改用户全局 Codex 配置。
- 测试计划复用匹配的活动计划，不得创建根目录 `specs/` 或其它平行文档真相源。
- Generator 只允许写入桌面 E2E 测试范围；Healer 不得修改生产代码、降低既定断言、删除失败步骤或用 `skip` 掩盖产品缺陷。
- Agent 生成或修改的测试必须能脱离 Agent 通过普通 `playwright test` 重复执行，才可作为自动化证据。
- Electron Agent seed 必须使用隔离用户目录，关闭任务创建的应用进程并清理临时 profile；不得读取或写入真实用户数据。
- 贡献者操作流程与标准提示词见 `docs/testing-playwright-agents.md`。

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

扫描结果必须记录在已有计划或交付说明中；如果发现重复实现，应优先复用或记录为什么暂不抽象。

## 当前测试层次

- White-box Unit：验证纯逻辑、边界条件、规则与数据转换
- Integration：验证模块协作、数据库、IPC、服务编排
- E2E：验证最关键的用户流程
- Performance：验证关键路径与长列表 / 大数据量场景
- Security：验证鉴权、权限、输入校验与敏感信息处理

## PromptHub 项目要求

- 修改需求或行为前，先检查 `spec/workflow/04-verification/README.md` 是否需要同步。
- 引入新风险路径时，要把回归策略写进 verification 或当前 change 工作区。
- 非文档/非机械改动必须遵循本文件的测试先行约定：先理解设计边界，先写能失败的测试，再实现。
- TDD 不能只写 happy path；每个非平凡变更至少覆盖黑盒行为、白盒分支、边界输入、失败/回滚路径。关键持久化和安全路径还必须覆盖 fuzz/adversarial 和压力场景。
- 关键设计冲突按文档规则处理；已确认需求直接更新，未解决的数据、安全、范围或兼容选择才需澄清。
- 发布准入必须走根级 release harness；不要把 desktop-only、web-only 或重复嵌套的聚合脚本当成完整发布验证。
- 本地和 CI 的 package 命令清单必须来自
  `scripts/verification/checks.mts`；workflow 只允许选择 profile、surface 和
  risk layer，不得复制一份会漂移的 lint/typecheck/test/build 列表。
- 正常路径数据库测试允许复制已关闭的当前 schema 模板提升速度；迁移、锁、
  恢复、损坏和并发打开测试禁止使用模板，且模板与测试副本必须在 teardown
  关闭并清理。
- 用户报告的线上 bug 修复时，必须补一条能复现原失败条件的回归测试，并记录它属于哪个 harness 层。优先选择最低有效层，只有跨模块、跨进程或真实 UI 流程风险才升级到 integration / E2E。
- Skill 系统 bugfix 必须先检查 `spec/knowledge/reference/skill-defect-taxonomy.md` 给 bug 定性，再检查 `spec/knowledge/reference/skill-regression-test-matrix.md` 选择代表性回归测试。先补失败测试，再修代码。
- Skill 安装、删除、分发、扫描、商店状态测试不能只断言 mock 被调用；必须断言用户依赖的持久化结果、文件系统结果或 UI 可见状态。
- 自定义 Git/Gitea、软链接、复制安装、同名不同源、嵌套目录文件浏览必须作为 Skill 回归测试的标准 fixture 组合，不得只用单个 `SKILL.md` happy path。
- Skill package 边界测试必须覆盖：真实或等价本地 Git fixture、完整目录 inventory、`.git`/`.prompthub` 过滤、软链接过滤、路径穿越、缺失 `SKILL.md`、多 Skill 歧义、同 slug 不同 source、安装失败回滚、大量文件压力、文件树/安全扫描下游消费。
- UI 可见变更必须记录真实操作步骤和观察结果；涉及桌面界面时，不能只用 `git diff --check` 或单元测试代替验收。
- 复用是验收项：同一类 Skill / Plugin / MCP / Agent / Store / Settings UI 不能随意重复造一套样式或逻辑。
- PromptHub 已有的长期测试标准以本文件为唯一规则源，AGENTS 和 verification 入口只引用本文件。

## 当前主要真相源

- `AGENTS.md`
- `spec/workflow/04-verification/README.md`

## 缺陷与测试先行

修复前确认症状、触发入口、调用链、根因和数据权威；无法复现时说明已知证据。先写能复现原失败条件的测试，再实现；文档或机械调整可不写测试，其他无法先写测试的情况须说明具体原因及替代验证。不得用默认值、空 catch、假数据或跳过校验掩盖错误。测试覆盖 reopen/rescan/reload、失败后 durable state 及适用的幂等恢复。

## 详细测试约束

### 1 Core Principles

> Tests exist to **find bugs**, not to inflate coverage numbers. Every test must have a clear reason to exist — if a test can never fail, it is worthless. If a test only verifies the happy path with obvious inputs, it is insufficient.

| Principle                             | Description                                                                                                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Real bugs, not rubber stamps**      | Every test must target a scenario that could realistically fail in production. Avoid trivially-passing tests that merely confirm a function returns the same hardcoded value it was given. |
| **Test behavior, not implementation** | Assert on observable outcomes (return values, DB state, side effects), not internal private methods or call counts. Tests that break on harmless refactors are fragile.                    |
| **Root cause verification**           | After fixing a bug, the regression test must reproduce the original failure condition — not merely call the fixed code path.                                                               |
| **No fake implementations**           | Prohibited: `setTimeout` to simulate async, hardcoded mock return values that bypass real logic, `jest.fn().mockReturnValue(expectedResult)` that makes the test a tautology.              |
| **No lazy assertions**                | Prohibited: `expect(result).toBeDefined()` when the actual value matters; `expect(fn).not.toThrow()` without checking the return value; `.toMatchSnapshot()` for dynamic data.             |

### 2 Test Categories (All Required for New Modules)

#### 2.1 Functional Tests

| Aspect                  | Requirements                                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Happy path**          | Cover the primary use case with realistic inputs.                                                                                  |
| **Boundary conditions** | Empty string, null, undefined, zero, negative numbers, MAX_SAFE_INTEGER, empty arrays, single-element arrays.                      |
| **Error paths**         | Invalid inputs must produce correct errors, not silent failures. Verify error messages/types, not just that an error was thrown.   |
| **State transitions**   | For stateful modules (stores, DB, auth): test the full lifecycle (create → read → update → delete) and verify intermediate states. |

#### 2.2 Adversarial / Fuzz Tests

| Aspect                    | Requirements                                                                                                                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SQL injection**         | All user-facing string inputs (title, description, tags, search keywords) must be tested with SQL injection payloads: `'; DROP TABLE x; --`, `" OR 1=1 --`, `UNION SELECT`. Verify the table is intact after each attempt. |
| **XSS-like content**      | Store and retrieve `<script>alert(1)</script>`, HTML entities, and JS event handlers in all text fields.                                                                                                                   |
| **Unicode / CJK / Emoji** | Full round-trip (write → read) with CJK characters, emoji (including multi-codepoint like 🏳️‍🌈), RTL text (Arabic/Hebrew), zero-width characters.                                                                            |
| **Null bytes**            | Test `\x00` in string fields because SQLite adapter behavior can cause silent data loss. Document the observed behavior in tests.                                                                                          |
| **Extreme sizes**         | 10KB+ strings, 100+ element arrays, 1MB payloads for encryption. Verify no crashes and data integrity.                                                                                                                     |
| **Special characters**    | Backslashes, quotes (single/double), newlines, tabs, CRLF, Unicode BOM, control characters (0x01–0x1F).                                                                                                                    |

#### 2.3 Security Tests

| Aspect                             | Requirements                                                                                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cryptographic tamper detection** | For encrypted data: test bit-flips in IV, auth tag, and ciphertext independently. Verify all produce rejection (null/error), not silent decryption to garbage. |
| **Key/password boundaries**        | Empty password, 10KB password, unicode password, password with null bytes. Verify old password fails after reset.                                              |
| **Timing safety**                  | Where `timingSafeEqual` is used, verify that wrong-length inputs don't crash (Node.js throws if buffers differ in length).                                     |
| **Input validation**               | All IPC handlers must reject malformed inputs. Test with wrong types, missing required fields, extra unknown fields.                                           |
| **Path traversal**                 | File path inputs must be tested with `../`, absolute paths, symlinks, and null bytes.                                                                          |

#### 2.4 Performance / Stress Tests

| Aspect                         | Requirements                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| **Batch operations**           | 100+ creates followed by bulk delete. Verify count accuracy and no orphaned records.                                |
| **Rapid sequential mutations** | 50+ updates to same record in tight loop. Verify final state is deterministic and no version/counter drift.         |
| **Concurrent-like access**     | Multiple operations in same transaction/tick. Verify data consistency (especially for version numbers, sort_order). |
| **State cycling**              | 10+ cycles of set→lock→unlock, create→delete, enable→disable. Verify no state leaks across cycles.                  |

#### 2.5 Integration Tests (Database)

| Aspect                    | Requirements                                                                                                                                                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Use real SQLite**       | Database tests MUST use `new DatabaseAdapter(":memory:")` with the real schema (`SCHEMA_TABLES` + `SCHEMA_INDEXES`), NOT mocks. Mocked databases cannot catch SQL syntax errors, constraint violations, or trigger behavior. |
| **Foreign key behavior**  | Test CASCADE deletes, SET NULL behavior, and constraint violations explicitly.                                                                                                                                               |
| **Transaction atomicity** | For operations wrapped in `db.transaction()`: verify that partial failures roll back completely.                                                                                                                             |
| **FTS correctness**       | Full-text search tests must include special FTS5 operators (`AND`, `OR`, `NOT`, `NEAR`, `*`, `^`, `"phrase"`, `column:`) and verify they don't cause SQL errors.                                                             |

### 3 Prohibited Anti-Patterns

| Anti-Pattern                                      | Why It's Harmful                           | Correct Approach                                                       |
| ------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------- |
| `expect(result).toBeDefined()` alone              | Passes for any value including wrong ones  | Assert the specific expected value                                     |
| `expect(fn).not.toThrow()` without value check    | Confirms no crash but not correctness      | Assert both no-throw AND correct return value                          |
| Mock that returns the expected value              | Test becomes a tautology (always passes)   | Mock dependencies, assert on SUT behavior                              |
| `as any` / `@ts-ignore` in test code              | Hides type errors that are real bugs       | Fix the types; if testing JS interop, use explicit casts with comments |
| Testing private methods directly                  | Couples test to implementation             | Test through public API                                                |
| `toMatchSnapshot()` for dynamic data              | Snapshot bloat, meaningless diffs          | Use specific assertions                                                |
| Copy-paste test blocks with minor variations      | Hard to maintain, masks missing edge cases | Use `it.each()` or parameterized tests                                 |
| `beforeEach` that creates unnecessary fixtures    | Slow tests, hidden dependencies            | Create fixtures in the specific test that needs them                   |
| Catching errors just to assert `instanceof Error` | Doesn't verify the error message or cause  | Assert `error.message` contains specific text                          |

### 4 Test File Organization

```
tests/
├── unit/
│   ├── main/               # Main process tests (DB, services, security)
│   ├── components/          # React component tests (render, interaction)
│   ├── services/            # Frontend service tests (AI clients, etc.)
│   ├── stores/              # Zustand store tests
│   ├── hooks/               # Hook tests
│   └── cli/                 # CLI tests
├── integration/             # Integration tests
├── e2e/                     # Playwright end-to-end tests
├── fixtures/                # Shared test fixtures
├── helpers/                 # Shared test helpers
└── setup.ts                 # Global test setup
```

**Naming convention:** `<module-name>.test.ts` — matches the source file it tests.

**Structure within test files:**

```typescript
describe("ModuleName", () => {
  describe("methodName", () => {
    it("does X when given Y", () => { ... });         // Happy path
    it("returns null for non-existent id", () => { ... }); // Error path
  });
  describe("adversarial inputs", () => {
    // Fuzz / boundary / injection tests grouped together
  });
});
```

### 5 Running Tests

| Command                                 | Purpose                        |
| --------------------------------------- | ------------------------------ |
| `pnpm test -- --run`                    | Full test suite (all files)    |
| `pnpm test -- <path> --run`             | Single file                    |
| `pnpm test -- --run --reporter=verbose` | Verbose output with test names |
| `pnpm test -- --run --coverage`         | With coverage report           |

Choose the smallest effective checks after the complete implementation batch, then broaden for cross-package or release risk. Every PR must have no unresolved test failures or lint errors.

### 6 Coverage Targets

| Layer                                                                                                                              | Minimum                                                 | Priority                                |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------- |
| New/changed production code                                                                                                        | 100% lines, functions, branches, and conditions         | **Required** — no untested new behavior |
| Critical boundary modules: database, filesystem persistence, sync, IPC/preload, installer/import/export, security, release harness | 100% branch and condition coverage for touched behavior | **Required** — data/user trust boundary |
| `packages/db/src/`                                                                                                                 | 100% for changed files; legacy gaps must be recorded    | **Critical** — data integrity           |
| `apps/desktop/src/main/security.ts`                                                                                                | 100% for changed files; legacy gaps must be recorded    | **Critical** — encryption correctness   |
| `packages/core/src/` and app services                                                                                              | 100% for changed files; legacy gaps must be recorded    | High — business logic                   |
| `apps/desktop/src/main/ipc/`                                                                                                       | 100% for changed handlers and validation branches       | High — input validation                 |
| `apps/desktop/src/renderer/stores/`                                                                                                | 100% for changed actions and state branches             | High — state management                 |
| `apps/desktop/src/renderer/services/`                                                                                              | 100% for changed services and error paths               | High — client correctness               |
| `apps/desktop/src/renderer/components/`                                                                                            | 100% for changed user-visible states and interactions   | Medium — UI behavior                    |

Coverage acceptance must include branch and condition review, not only line coverage. Any uncovered branch in touched code must be either tested or explicitly documented in the existing topic or plan with a reason and a follow-up task.

### 7 What Makes a Test "Good"

A good test:

1. **Fails when the code is broken** — If you comment out the implementation, the test must fail.
2. **Passes when the code is correct** — No flaky behavior, no timing dependencies.
3. **Documents the expected behavior** — The test name and assertions serve as living documentation.
4. **Catches regressions** — A future developer changing the code incorrectly will be stopped by this test.
5. **Is independent** — Can run in any order, doesn't depend on other tests' side effects.
6. **Is fast** — Unit tests should complete in milliseconds, not seconds.

A bad test:

1. Always passes regardless of implementation.
2. Tests implementation details that change on refactor.
3. Has vague assertions (`toBeDefined`, `toBeTruthy`) when specific values are known.
4. Requires network, filesystem, or timing to pass.
5. Is a copy-paste of another test with one variable changed.

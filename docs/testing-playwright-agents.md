# Playwright Test Agents 使用指南

PromptHub 在仓库内提供三个 Playwright Test Agents，用于规划、生成和诊断桌面端 Electron E2E 测试：

| Agent                       | 用途                             | 允许的输出                                 |
| --------------------------- | -------------------------------- | ------------------------------------------ |
| `playwright_test_planner`   | 操作真实界面并形成测试计划       | 匹配的 `spec/changes/active/<change-key>/` |
| `playwright_test_generator` | 根据已审核计划生成测试           | `apps/desktop/tests/e2e/`                  |
| `playwright_test_healer`    | 判断失败来自测试漂移还是产品缺陷 | 仅修复已证明过期的 E2E 测试或 helper       |

Agent 定义位于 `.codex/agents/`，只影响 PromptHub 仓库，不修改用户全局 Codex 配置。首次安装或更新 Agent 定义后，应重新打开仓库或新建 Codex 会话。

## 什么时候优先使用

以下桌面端风险必须优先考虑由 Test Agents 辅助设计或补齐 E2E：

- 新增或修改用户可见的多步骤工作流；
- Renderer、preload、IPC、Main Process 之间的跨进程行为；
- 设置保存、重启恢复、数据库或文件持久化；
- Skill、Plugin、MCP、Agent 的安装、删除、更新与分发；
- 备份、恢复、同步、迁移和部分失败后的用户可见结果；
- 用户报告且只能通过真实界面稳定复现的问题。

Test Agents 不是所有测试的第一层。纯函数、解析、规则、数据库 primitive 和错误分支仍应先写最低有效层的 unit 或 integration 测试。已有稳定 E2E 只需重复执行时，也不必重新调用 Planner 或 Generator。

Agent 生成或修改的测试只是待审查源码。最终证据必须是不依赖 Agent、可由普通 `playwright test` 重复执行的测试结果；发布准入仍由根级 verification harness 决定。

## 准备 Electron 构建

默认 Seed 启动 `apps/desktop/out/main/index.js`。运行 Agent 或聚焦 E2E 前先完成桌面构建：

```bash
pnpm --filter @prompthub/desktop build
```

默认 Seed 是：

```text
apps/desktop/tests/e2e/playwright-agent-seed.spec.ts
```

它复用现有 Electron E2E launcher，创建隔离的临时用户目录，并在结束时关闭应用和清理 profile。不得把真实 PromptHub 用户目录交给 Test Agent。

## 1. 使用 Planner

先定位权威主题和可复用的测试计划，再在 Codex 对话中明确点名 Agent、授权测试窗口操作并指定计划路径：

```text
请显式使用 playwright_test_planner 子 Agent。

为“关闭窗口选择记住后，重启仍保持”制定真实 Electron E2E 测试计划。
允许启动和控制 PromptHub Electron 测试窗口。
使用 apps/desktop/tests/e2e/playwright-agent-seed.spec.ts。
计划写入 spec/changes/active/desktop-close-choice-persistence/test-plan.md。
覆盖保存、退出、重新启动和失败提示，只制定计划，不修改产品代码。
```

计划必须先由主 Agent 或维护者审核，确认预期结果代表产品需求，而不是当前实现的偶然表现。

## 2. 使用 Generator

计划通过审核后，再让 Generator 把其中一个或一组相关场景写成普通 Playwright 测试：

```text
请显式使用 playwright_test_generator 子 Agent。

根据 spec/changes/active/desktop-close-choice-persistence/test-plan.md
生成关闭选择持久化的 Electron E2E 测试。
允许启动和控制 PromptHub Electron 测试窗口。
测试写入 apps/desktop/tests/e2e/close-choice-persistence.spec.ts。
不得修改产品代码，也不得降低计划中的断言。
```

生成后必须审查测试是否使用稳定的 role、label、可见文本或 test id，是否断言了持久化结果、重启结果及清理行为，并拒绝任意 sleep、真实用户目录和只验证 mock 调用的实现。

## 3. 独立运行生成的测试

聚焦运行单个测试：

```bash
pnpm --dir apps/desktop exec playwright test tests/e2e/close-choice-persistence.spec.ts
```

运行全部桌面 E2E：

```bash
pnpm test:e2e
```

测试结果、实际操作步骤和残留风险应记录到已有计划的执行记录。Agent 报告“计划已保存”或“测试已生成”不代表测试通过。

## 4. 使用 Healer

只有失败证据表明测试代码、locator 或测试准备已经过期时才使用 Healer：

```text
请显式使用 playwright_test_healer 子 Agent。

诊断 apps/desktop/tests/e2e/close-choice-persistence.spec.ts。
允许启动和控制 PromptHub Electron 测试窗口。
只能修复已证明过期的 E2E 测试代码。
不得修改产品代码、删除步骤、降低断言或添加 skip。
如果属于真实产品缺陷，停止修改并报告根因与复现证据。
```

Healer 不得用 `skip`、`fixme`、删除断言、放宽期望值、任意等待或修改生产代码制造通过。正确测试暴露的失败必须回到产品修复流程，并补齐最低有效层回归测试。

## 推荐工作流

```text
权威主题与失败风险
  -> 最低有效层失败测试
  -> Planner 探索并保存 E2E 计划（适用时）
  -> 审核产品预期
  -> Generator 生成 E2E
  -> 普通 Playwright 独立执行
  -> 产品缺陷则修产品；仅测试漂移才用 Healer
  -> verification harness
  -> 已有计划记录证据
```

不要把三个 Agent 无审核地串成自动改写循环。Planner、Generator 和 Healer 分工不同，前一步产物必须在进入下一步前确认没有偏离需求。

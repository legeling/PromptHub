# Playwright Test Agents 使用指南

测试设计、mock 边界与验收结论统一遵循 [测试标准](../spec/rules/testing-standards.md)，命令选择和当前工具缺口见 [验证入口](../spec/workflow/04-verification/README.md)。本文只说明可选测试 Agent 的使用方式。

PromptHub 在仓库内提供三个 Playwright Test Agents，用于规划、生成和诊断桌面端 Electron E2E 测试：

| Agent                       | 用途                             | 允许的输出                                 |
| --------------------------- | -------------------------------- | ------------------------------------------ |
| `playwright_test_planner`   | 操作真实界面并形成测试计划       | 已有主题或匹配的活动计划 |
| `playwright_test_generator` | 根据已审核计划生成测试           | `apps/desktop/tests/e2e/`                  |
| `playwright_test_healer`    | 判断失败来自测试漂移还是产品缺陷 | 仅修复已证明过期的 E2E 测试或 helper       |

Agent 定义位于 `.codex/agents/`，只影响 PromptHub 仓库，不修改用户全局 Codex 配置。首次安装或更新 Agent 定义后，应重新打开仓库或新建 Codex 会话。

## 什么时候适用

以下风险适合通过真实 Electron E2E 验证；需要辅助规划、生成或诊断时，可按 AGENTS 的委派条件使用 Test Agents：

- 新增或修改用户可见的多步骤工作流；
- Renderer、preload、IPC、Main Process 之间的跨进程行为；
- 设置保存、重启恢复、数据库或文件持久化；
- Skill、Plugin、MCP、Agent 的安装、删除、更新与分发；
- 备份、恢复、同步、迁移和部分失败后的用户可见结果；
- 用户报告且只能通过真实界面稳定复现的问题。

默认由任务负责人完成测试。使用 Agent 和操作 GUI 分别遵守相应授权，复杂场景本身不构成授权。先建立正常功能基线，再补同入口黑盒输入与风险场景；纯函数或局部数据边界使用最低有效层，已有稳定 E2E 直接运行即可。

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
先设计正常保存、退出、重新启动后读回选择的完整流程。
再设计异常输入或保存失败的场景，断言具体提示和原设置保持不变。
每个场景写明前置数据、真实入口、操作步骤、预期结果及后置状态。
只制定计划，不修改产品代码。
```

计划必须由任务负责人或维护者审核，确认预期来自产品需求。正常场景是基线，失败恢复场景按风险补齐；旧数据、已安装或故障中间态必须明确准备，不能一律假设空白 profile。复用已有主题或计划，没有匹配活动变更时不为使用 Agent 机械创建变更目录。

## 2. 使用 Generator

计划通过审核后，再让 Generator 把其中一个或一组相关场景写成普通 Playwright 测试：

```text
请显式使用 playwright_test_generator 子 Agent。

根据 spec/changes/active/desktop-close-choice-persistence/test-plan.md
生成关闭选择持久化的 Electron E2E 测试。
允许启动和控制 PromptHub Electron 测试窗口。
测试写入 apps/desktop/tests/e2e/close-choice-persistence.spec.ts。
实际操作保存与重启，断言重新打开后的选择；不能预置保存结果。
不得 mock 被测保存逻辑，也不得修改产品代码或降低计划中的断言。
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

按 [测试标准](../spec/rules/testing-standards.md) 在已有计划或交付说明记录场景、预期、命令、替换边界、实际结果与未验收项。确认新增核心流程被 package/harness 选择。生成源码、仅列出测试、全 skip 或重试后偶然成功均不能记为功能验收通过。

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
权威预期与正常主流程
  -> 真实入口、输入、预期结果和后置状态
  -> 正常基线 + 同入口黑盒输入 + 风险恢复用例
  -> 测试先行，完成实现批次
  -> 聚焦验证，再执行适用的 integration/E2E/harness
  -> 产品缺陷则修产品；仅测试漂移才修测试
  -> 已有计划或交付说明记录实际结果与未验收边界
```

Planner、Generator 和 Healer 按需用于相应步骤，不是必须串行执行的流水线。不得把它们无审核地串成自动改写循环，前一步产物须确认没有偏离需求。

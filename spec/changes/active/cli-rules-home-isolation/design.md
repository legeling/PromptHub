# Design

## Overview

在 `apps/cli/tests/run.test.ts` 中为 Rules 相关用例引入统一的临时 Home 隔离辅助。测试执行前将 `process.env.HOME` 指向当前测试的临时目录，测试结束后恢复原值。回归断言会直接检查 `claude-global` 的目标文件写入到了测试 Home 下的 `.claude/CLAUDE.md`。

## Affected Areas

- Data model:
  - 无
- IPC / API:
  - 无
- Filesystem / sync:
  - 仅测试环境；防止写入真实 `~/.claude/CLAUDE.md`
- UI / UX:
  - 无

## Tradeoffs

- 选择在测试层隔离 Home，而不是修改 CLI 产品逻辑。这样可以修复真实副作用，同时不改变 CLI 对全局规则文件的既有契约。

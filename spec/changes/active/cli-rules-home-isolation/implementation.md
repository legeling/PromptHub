# Implementation

## Shipped

- 在 [apps/cli/tests/run.test.ts](/Users/lingxiaotian/Programs/personal/PromptHub/apps/cli/tests/run.test.ts) 新增 `withTempHome()` 测试辅助，统一把 CLI 规则测试的 `HOME` 指向临时目录。
- 更新 `lists, reads, restores, and deletes rule versions` 与 `rewrites a rule through explicit AI config` 两个 `claude-global` 用例，确保外部规则文件写入测试专用 `home/.claude/CLAUDE.md`。
- 新增回归断言，直接验证测试写入的是隔离 Home 下的 Claude 全局规则文件，而不是真实用户 Home。

## Verification

- `pnpm --filter @prompthub/cli test -- run.test.ts`

## Synced Docs

- 无；该修复仅影响测试隔离边界，不改变稳定产品契约。

## Follow-ups

- 评估是否需要把相同的 Home 隔离辅助推广到其他会触碰平台全局目录的 CLI 集成测试。

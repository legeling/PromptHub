# Proposal

## Why

CLI 的 `rules` 集成测试当前只隔离了 PromptHub 的 `--data-dir`，但没有隔离平台全局规则文件所在的 Home 目录。运行这组测试时，`claude-global` 会直接写入真实的 `~/.claude/CLAUDE.md`，进而污染开发者本机环境，并让桌面端 Rules 在启动后把真实外部文件误判为“外部规则文件已变更”。

## Scope

- In scope:
  - 为 CLI `rules` 测试补上 Home 目录隔离
  - 增加回归测试，证明规则读写落在测试专用 Home，而不是真实用户 Home
  - 保持现有 CLI 规则行为不变，仅修复测试副作用
- Out of scope:
  - 修改桌面端 Rules 冲突检测逻辑
  - 修改真实产品环境下 `claude-global` 的目标路径语义

## Risks

- 如果测试隔离范围不完整，仍可能有个别规则测试写入真实 Home。
- 如果错误地改变 CLI 运行时路径行为，可能掩盖真实产品集成问题。

## Rollback Thinking

- 本次变更仅影响测试代码与测试辅助；回滚时可直接恢复测试文件，不涉及数据迁移或运行时存储格式。

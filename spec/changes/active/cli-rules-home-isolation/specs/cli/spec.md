# Delta Spec

## Modified

- CLI `rules` 集成测试在读写 `claude-global` 等全局规则文件时，必须使用测试专用的 Home 目录，不能触碰开发机真实的 `~/.claude/CLAUDE.md` 等平台配置文件。

## Scenarios

- 当测试执行 `prompthub --data-dir <tmp> rules save claude-global --content ...` 时，规则目标文件应写入 `<tmp>/home/.claude/CLAUDE.md`，而不是真实用户 Home。
- 当测试执行 `rules read`、`rules versions`、`rules rewrite`、`rules export/import` 等全局规则命令时，所有外部平台文件读写都应落在该测试专用 Home。

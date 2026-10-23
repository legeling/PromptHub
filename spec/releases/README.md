# PromptHub Releases

`spec/releases/` 对齐 `spec-init` 的 releases 边界，用来记录版本级对外交付摘要。

版本记录区分当前可下载发行版、待发布的候选和历史发布证据；构建版本不代表已发布。

当前 PromptHub 对外版本说明的主入口仍然是：

- `CHANGELOG.md`
- `docs/README.*`
- `website/src/content/docs/changelog.md`

2026-10-21 发布核对：GitHub latest 为 `v0.6.1`；同版本替换包已公开。
已安装旧 0.6.1 的用户需手动覆盖安装并保留应用数据目录。

当前开发版本为 `0.6.2`（尚未发布），见 [0.6.2 开发记录](0.6.2.md)。

## Release Index

| Version        | Status                                            | Path                            | Updated    |
| -------------- | ------------------------------------------------- | ------------------------------- | ---------- |
| `0.6.2` | in development | `spec/releases/0.6.2.md` | 2026-10-22 |
| `0.6.1` | stable record | `spec/releases/0.6.1.md` | 2026-10-21 |
| `0.6.0-beta.2` | published prerelease                              | `spec/releases/0.6.0-beta.2.md` | 2026-09-03 |
| `0.6.0-beta.1` | published prerelease; Skill mutation fix replaced | `spec/releases/0.6.0-beta.1.md` | 2026-08-21 |
| `0.6.0`        | stable record                                     | `spec/releases/0.6.0.md`        | 2026-10-18 |
| `0.5.9`        | stable record                                     | `spec/releases/0.5.9.md`        | 2026-08-19 |
| `0.5.9-beta.2` | published beta                                    | `spec/releases/0.5.9-beta.2.md` | 2026-07-10 |
| `0.5.9-beta.1` | published beta                                    | `spec/releases/0.5.9-beta.1.md` | 2026-07-10 |

## Routing Rule

- 版本级交付摘要、发布说明、版本归档 -> `spec/releases/`
- 对外发布详情仍需同步 `CHANGELOG.md`、`docs/README.*` 与 website changelog

# PromptHub Releases

`spec/releases/` 对齐 `spec-init` 的 releases 边界，用来记录版本级对外交付摘要。

在锁定的 `spec-init` 基线（`f83def1`）中，这一层属于 `records.releases`。

当前 PromptHub 对外版本说明的主入口仍然是：

- `CHANGELOG.md`
- `docs/README.*`
- `website/src/content/docs/changelog.md`

如果后续需要增加更结构化的版本发布归档，可以在这里扩展。

## Release Index

| Version        | Status                                            | Path                            | Updated    |
| -------------- | ------------------------------------------------- | ------------------------------- | ---------- |
| `0.6.0-beta.2` | published prerelease                              | `spec/releases/0.6.0-beta.2.md` | 2026-09-03 |
| `0.6.0-beta.1` | published prerelease; Skill mutation fix replaced | `spec/releases/0.6.0-beta.1.md` | 2026-08-21 |
| `0.6.0`        | draft; Intel CI network workaround verification pending | `spec/releases/0.6.0.md`        | 2026-10-18 |
| `0.5.9`        | stable record                                     | `spec/releases/0.5.9.md`        | 2026-08-19 |
| `0.5.9-beta.2` | published beta                                    | `spec/releases/0.5.9-beta.2.md` | 2026-07-10 |
| `0.5.9-beta.1` | published beta                                    | `spec/releases/0.5.9-beta.1.md` | 2026-07-10 |

## Routing Rule

- 版本级交付摘要、发布说明、版本归档 -> `spec/releases/`
- 对外发布详情仍需同步 `CHANGELOG.md`、`docs/README.*` 与 website changelog

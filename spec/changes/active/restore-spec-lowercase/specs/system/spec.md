# Delta Spec

## Added

- 顶层小写 `spec/` 被恢复为内部 SSD/spec 唯一归属
- 新增稳定层 `spec/specs/`
- 新增历史层 `spec/changes/legacy/`
- 新增归档层 `spec/changes/archive/`
- 新增模板层 `spec/changes/_templates/`

## Modified

- 仓库关键入口统一改为引用小写 `spec/`
- `docs/` 的职责被收缩为仅保留对外说明文档

## Removed

- 内部文档再放入 `docs/` 的旧归属方式
- 对旧大写目录的 canonical 引用

## Scenarios

- 当贡献者寻找当前稳定内部真相时，应首先查看 `spec/README.md` 和 `spec/specs/`
- 当贡献者恢复历史内部文档时，应从 git 历史恢复原文，再迁入 `spec/`

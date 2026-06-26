# Delta Spec

## Added

- `spec/issues/` 必须同时支持 active 与 archive 两层，用于区分仍在跟踪的问题和已关闭归档的问题记录。
- 仓库当前 GitHub issue 状态应有一个可从 `spec/` 内直接访问的记录入口，而不是完全依赖外部 GitHub 页面临时查看。
- GitHub issue 远端状态与 PromptHub 本地 delivery 状态必须分离记录。
- 本地完成但尚未发布的问题必须能标记为 `local_done` 或 `release_pending`，且不得因此提前关闭 GitHub issue。

## Modified

- `spec/issues/active/` 的职责从“内部质量问题”扩展为“仍在跟踪的问题”，包括内部问题文档和当前 open GitHub issue 快照。
- `spec/issues/active/` 还必须包含本地 GitHub issue 状态覆盖层，用于记录 triage、实现、待发布和发布后关闭状态。
- `spec/issues/archive/` 的职责定义为“已关闭或仅保留历史参考价值的问题记录”。

## Removed

- 无。

## Scenarios

- 当贡献者需要查看当前仍在处理的仓库问题时，应能从 `spec/issues/README.md` 进入 `spec/issues/active/github-open.md`。
- 当贡献者需要查看仓库已关闭问题的历史上下文时，应能从 `spec/issues/README.md` 进入 `spec/issues/archive/github-closed.md`。
- 当内部仍有未收敛的质量风险时，这些内容仍可继续保留在 `spec/issues/active/quality.md`，不与 GitHub issue 快照混淆。
- 当某个 GitHub issue 已经在本地完成但尚未发布时，应在 `spec/issues/active/local-github-status.md` 标记为 `local_done` 或 `release_pending`，GitHub issue 仍保持 open。
- 当目标版本发布后，应把对应本地状态更新为 `released`，公开关闭 GitHub issue，并刷新 open/closed 快照。

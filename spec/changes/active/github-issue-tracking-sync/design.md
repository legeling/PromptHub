# Design

## Overview

把 `spec/issues/` 明确拆成三层：

- `spec/issues/README.md`：总入口与同步说明。
- `spec/issues/active/`：仍在跟踪的问题，包括当前 open GitHub issues 快照、内部质量跟踪和本地 GitHub issue delivery 覆盖层。
- `spec/issues/archive/`：已关闭 GitHub issues 快照与未来可归档的问题文档。

这次只做文档级同步，不引入脚本，不改变 GitHub issue workflow。
GitHub 远端状态和本地 delivery 状态分离：远端快照只记录
`open` / `closed`，本地覆盖层记录 `untriaged`、`accepted`、
`in_progress`、`local_done`、`release_pending`、`released`、
`wontfix` 和 `duplicate`。

只有目标版本发布后，才把本地 `release_pending` / `released` 的 issue
同步关闭到 GitHub；本地完成但未发布的 issue 必须继续保持 GitHub open。

## Affected Areas

- Data model:
- 无运行时数据模型变更，仅新增 spec 文档结构。

- IPC / API:
- 无。

- Filesystem / sync:
- 无产品同步逻辑变更；仅同步 GitHub issue 元数据与本地 delivery 覆盖状态到仓库内文档。

- UI / UX:
- 无产品 UI 变更。

## Tradeoffs

- 静态 Markdown 快照简单直接、容易审阅，但需要后续人工刷新。
- 先把 active/archive 结构和当前 issue 状态落地，比直接做自动化更小、更稳，也更符合这次“先记录下来”的目标。
- 本地状态覆盖层会多维护一份表，但能避免“本地已修完”和“用户已拿到发布版本”被混为一谈。

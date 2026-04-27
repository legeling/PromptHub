# Design

## Overview

采用“恢复原文 + 补齐结构 + 更新入口”三步法：

1. 从 `HEAD` 恢复已删除内部文档原文，而不是重写摘要版
2. 把内容映射到新的小写 `spec/` 结构
3. 更新仓库关键入口，使 `spec/` 成为唯一内部归属

## Mapping

- `docs/architecture/*` -> `spec/architecture/*`
- `docs/08-TODO/*` -> `spec/changes/legacy/docs-08-todo/*`
- `docs/09-问题追踪/active/*` -> `spec/issues/active/*`

## OpenSpec Alignment

本次补齐以下 OpenSpec 核心结构：

- stable specs: `spec/specs/`
- delta specs: `spec/changes/active/<change-key>/specs/<domain>/spec.md`
- changes archive: `spec/changes/archive/`
- iterative workflow: 通过 active change + templates 落地

同时保留 PromptHub 自己需要的两层：

- `spec/issues/active/`：持续质量与问题追踪
- `spec/changes/legacy/`：无法直接作为当前真相源、但必须保留的历史内部文档

## Affected Areas

- Repository docs structure
- Internal SSD entrypoints
- Contributor workflow guidance

## Tradeoffs

- 历史 TODO 文档继续保留在 legacy，而不是强行改写为稳定 specs；这样可以最大化保真
- 稳定 specs 采用新写法做抽象归纳，历史原文则单独保留，避免混淆当前真相与历史计划

# PromptHub Issue Management Rules

本规则定义 PromptHub 如何记录未解决问题、技术债、GitHub issue 状态和归档文档。

## 基本原则

- 未解决问题不能只留在聊天、commit message 或个人记忆里。
- GitHub issue 的远端 open/closed 状态和本地交付状态分开记录。
- 被替代、作废、仅保留历史价值的文档必须归档并说明替代关系。
- 本地实现完成不等于公开 issue 可以关闭；只有目标版本发布后才按发布结果关闭 GitHub issue。

## 记录位置

- 当前 open issue 远端快照：`spec/issues/active/github-open.md`。
- 已关闭 issue 远端快照：`spec/issues/archive/github-closed.md`。
- 本地 triage / delivery overlay：`spec/issues/active/local-github-status.md`。
- 质量风险、技术债和未收敛问题：`spec/issues/active/`。
- 版本级交付摘要：`spec/releases/`。
- 关键架构决策：`spec/adr/`。
- 项目级归档入口：`spec/archive/`。
- 完成或废弃的 active change：`spec/changes/archive/`。
- 仅保留历史价值的旧 change 资料：`spec/changes/legacy/`。

## GitHub Issue 状态规则

- 本地实现完成但未发布：标记 `local_done` 或 `release_pending`，不要把 GitHub issue 当作已关闭。
- commit / PR 在发布前优先使用 `Refs #<issue>`。
- 只有目标版本已经发布且公开说明应关闭该 issue 时，才使用 `Closes #<issue>`。
- 发布后刷新 `spec/issues/active/github-open.md` 和 `spec/issues/archive/github-closed.md`。
- 拒绝或合并 issue 前，先在本地状态记录 `wontfix`、`duplicate` 或合并目标，再进行公开说明。

## 什么时候新增 issue 记录

- 发现非本轮可解决的 bug、质量风险、测试缺口或技术债。
- 当前设计有冲突，需要用户或后续 change 决策。
- 验证被跳过且存在残留风险。
- 历史文档、代码或测试与当前事实冲突，但本轮不负责修正。
- 用户需求需要拆成后续阶段。

## 归档要求

- 完成计划前更新已有记录中的结果、验证、跳过项和后续风险。
- 归档被替代文档时必须写明替代文档路径和废弃原因。
- 不直接删除仍有历史解释价值的文档。
- 不把 release-pending 的 issue 从本地记录里抹掉。

## 审查问题

- 这次工作是否新增了未解决问题但没有记录？
- 是否有 skipped verification 需要进入 issue 或 implementation notes？
- 是否替换了旧规则、旧文档或旧路径但没有归档说明？
- commit / PR 是否错误使用了 `Closes`？

## 相关规则

- `spec/rules/submission-traceability-rules.md`
- `spec/rules/document-routing-rules.md`
- `spec/releases/release-rules.md`

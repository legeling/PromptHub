# PromptHub Issue Management Rules

本规则定义 PromptHub 如何记录未解决问题、技术债、GitHub issue 状态和归档文档。

## 基本原则

- 未解决问题不能只留在聊天、commit message 或个人记忆里。
- GitHub issue 的远端 open/closed 状态和本地交付状态分开记录。
- 被替代、作废、仅保留历史价值的文档必须归档并说明替代关系。
- issue 的完整修复提交必须显式关联并具备自动关闭能力；远端关闭和版本发布是两个独立状态，关闭不等于已发布。

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

- 本地实现完成但未发布：标记 `local_done` 或 `release_pending`；远端状态必须独立核实，不能由本地状态推断。
- 每笔与 issue 相关的 commit 必须在正文显式关联对应编号，不能只在聊天、文档或分支名中提及。
- 完成该 issue 全部修复范围且必要验证通过的独立提交，正文必须包含 `Closes #<issue>`，不能仅写 `Refs`。这是项目默认规则，不以版本已发布或维护者再次确认作为前提。
- 调查、阶段性实现、仅引用或未完成 issue 全部范围的提交使用 `Refs #<issue>`，并说明剩余工作，禁止提前关闭。一个提交涉及多个 issue 时逐项判断，不得批量关闭未完成的 issue。
- 关闭关键字在提交进入 GitHub 默认分支时生效；本地 commit / amend 不会关闭远端 issue，也不授权推送。相关 PR 应保留关闭关联；远端关闭须核实，不能由本地提交信息推断。
- 发布或确认远端关闭后刷新 `spec/issues/active/github-open.md` 和 `spec/issues/archive/github-closed.md`。
- 拒绝或合并 issue 前，先在本地状态记录 `wontfix`、`duplicate` 或合并目标，再进行公开说明。

## 什么时候新增 issue 记录

- 发现非本轮可解决的 bug、质量风险、测试缺口或技术债。
- 当前设计有冲突，需要用户或后续 change 决策。
- 验证被跳过且存在残留风险。
- 历史文档、代码或测试与当前事实冲突，但本轮不负责修正。
- 用户需求需要拆成后续阶段。

## 归档要求

- 缺陷 issue 的完成和归档必须按 [测试标准](testing-standards.md#缺陷-issue-的回归要求)
  关联有效回归用例及可重跑命令，明确未验证边界；不能只留下“已修复 / 测试通过”。

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

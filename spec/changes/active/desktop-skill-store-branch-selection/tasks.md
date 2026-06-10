# Tasks

- [x] 确认当前 `git-repo` source 的真实行为：默认分支优先、URL 内嵌 branch 不稳定生效。
- [x] 扩展 `SkillStoreSource` 数据模型，增加 `branch` 与 `directory` 可选字段。
- [x] 为 GitHub / Git repo source 增加统一的归一化解析逻辑，支持从旧 tree URL 提取 branch/path。
- [x] 改造 `loadGitHubSkillRepo()`，按 `branch -> tree URL branch -> default_branch -> main` 顺序解析目标分支。
- [x] 为 `SkillStoreSourceForm` 与 `SkillStoreSourceEditModal` 增加 branch / directory UI。
- [x] 在自定义 source 列表或详情中展示已生效的 branch / directory。
- [x] 补充测试覆盖：默认分支、显式 branch、legacy tree URL、directory 过滤、错误提示上下文。
- [x] 运行桌面端相关测试、`typecheck`、`lint` 验证。
- [x] 更新 implementation.md 记录实际落地方案与验证结果。

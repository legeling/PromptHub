# Tasks

- [x] 明确变更边界
- [x] 完成 delta spec
- [x] 输出最终存储方案与备份策略
- [x] 设计并实现 `userData/data/rules/` managed copy 目录
- [x] 移除 `workspace-agents` / `Current Project` 伪规则项
- [x] 将项目规则收敛为仅来自用户手动添加的项目路径
- [x] 改造 `rules.ipc.ts` 为 `data/rules` 真相源 + target-file sync 模型
- [x] 扩展备份格式与恢复逻辑，纳入 Rules 正文与历史
- [x] 为 Rules 设计数据库 schema（`rules` / `rule_versions`）
- [x] 处理旧版 `rule-history` 与文件直读模型的迁移
- [x] 为同步状态、冲突导入、部署动作补充 UI/IPC 文案与测试
- [x] 修复 Rules 详情“打开位置”按钮传入文件路径导致无法打开的问题
- [x] 实现外部规则文件被直接修改后的冲突提示与双向解决流程
- [x] 更新 implementation.md
- [x] 同步稳定 specs / logic / assets / docs

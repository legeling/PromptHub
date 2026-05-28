# Tasks

- [x] 为桌面端新增统一数据库路径解析函数，并将主数据库目标迁移到 `userData/data/prompthub.db`
- [x] 设计并实现旧布局到新布局的一次性迁移与 marker
- [x] 更新恢复、备份、数据路径检查逻辑，使其同时兼容旧布局与新布局
- [x] 为启动迁移、回退与恢复场景补充单元/集成测试
- [x] 为 root DB / stale unified DB / unified-only 用户状态补充数据库选路回归测试
- [x] 为包含 `skills` / `skill_versions` 的 legacy root DB 升级场景补充真实 SQLite 迁移回归测试
- [x] 为 upgrade snapshot 增加自动保留上限与瞬时 DB 文件排除策略
- [x] 更新 `implementation.md` 记录实际落地情况与验证结果

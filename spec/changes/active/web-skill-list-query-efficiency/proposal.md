# Proposal

## Why

Web skill 列表当前先查询可见 skill id，再对每条记录调用详情读取。skill 数量增长后会形成 N+1 查询，影响自部署 Web 的列表、搜索和同步目标浏览体验。

## Scope

- In scope:
  - 优化 `apps/web` 的 `SkillService.list()` 读路径。
  - 保持 `GET /api/skills` 与 `GET /api/skills/search` 返回结构和权限语义不变。
  - 增加服务层回归测试，防止列表读取重新退化为逐条详情查询。
- Out of scope:
  - 不改 SQLite schema、索引或迁移。
  - 不引入分页或前端 UI 改动。
  - 不调整 skill 创建、更新、删除或版本接口语义。

## Risks

- 直接从服务层 SQL 映射完整 skill 对象时，必须保持和 `SkillDB.getById()` 一致的字段解析。
- 权限过滤必须仍然只返回当前 actor 可见的私有 skill 和共享 skill。

## Rollback Thinking

如果优化出现兼容问题，可以回退 `SkillService.list()` 到原来的逐条 `getById()` 实现；API 合约和数据格式没有迁移成本。

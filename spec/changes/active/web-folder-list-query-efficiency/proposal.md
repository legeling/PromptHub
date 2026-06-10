# Proposal

## Why

Web folder 列表当前先查询可见 folder id，再对每条记录调用详情读取。folder 数量增长后会形成 N+1 查询，影响自部署 Web 的文件夹树加载体验。

## Scope

- In scope:
  - 优化 `apps/web` 的 `FolderService.list()` 读路径。
  - 保持 `GET /api/folders` 返回结构、排序和权限语义不变。
  - 增加服务层回归测试，防止列表读取重新退化为逐条详情查询。
- Out of scope:
  - 不改 SQLite schema、索引或迁移。
  - 不引入分页或前端 UI 改动。
  - 不调整 folder 创建、更新、删除、reorder 或 prompt-folder ownership 语义。

## Risks

- 直接从服务层 SQL 映射完整 folder 对象时，必须保持和当前 `FolderService.getById()` 返回结构一致。
- 权限过滤必须仍然只返回 actor 可见的私有 folder 和共享 folder。

## Rollback Thinking

如果优化出现兼容问题，可以回退 `FolderService.list()` 到原来的逐条 `getById()` 实现；API 合约和数据格式没有迁移成本。

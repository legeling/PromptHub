# Design

## Overview

将 Web skill 列表的读取逻辑收口在 `SkillService` 内：列表 SQL 直接查询 `skills.*` 以及 Web 所需的 `owner_user_id`、`visibility` 字段，并用本地 row mapper 生成完整 `Skill` 返回值。

## Affected Areas

- Data model: 无 schema、迁移或索引变更。
- IPC / API: `GET /api/skills` 与 `GET /api/skills/search` 合约不变。
- Filesystem / sync: 不触发 workspace 同步，也不改变 skill 文件布局。
- UI / UX: 列表响应在大量 skill 时减少数据库往返，用户可见结构不变。

## Tradeoffs

- `SkillService` 会拥有一份 Web 列表 row mapper，以避免调用 `SkillDB.getById()` 造成 N+1 查询。
- 这会和 `SkillDB` 的 private `rowToSkill()` 存在少量映射重复；当前优先保持改动局部，不扩大 `packages/db` 公共 API。

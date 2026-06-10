# Design

## Overview

将 Web folder 列表读取逻辑收口在 `FolderService` 内：列表 SQL 直接查询完整 `folders.*` 行，并用本地 row mapper 生成和现有 Web folder payload 一致的对象。

## Affected Areas

- Data model: 无 schema、迁移或索引变更。
- IPC / API: `GET /api/folders` 合约不变。
- Filesystem / sync: 不触发额外 workspace 语义变化，也不改变 prompt workspace 布局。
- UI / UX: 文件夹列表在较大数据量时减少数据库往返，用户可见结构不变。

## Tradeoffs

- `FolderService` 会拥有一份 Web 列表 row mapper，以避免调用 `FolderDB.getById()` 造成 N+1 查询。
- 这和 `FolderDB` 的 private `rowToFolder()` 存在少量映射重复；当前优先保持改动局部，不扩大 `packages/db` 公共 API。

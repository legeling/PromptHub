# Design

## Overview

Add a FolderService parent-cycle guard before normal folder updates persist
`parentId`. The guard walks the proposed parent chain and rejects if it reaches
the folder being updated.

## Affected Areas

- Data model: no schema change.
- IPC / API: `PUT /api/folders/:id` returns `422 VALIDATION_ERROR` for
  self-parent or descendant-parent requests, and accepts `parentId: null` to
  clear a folder's parent.
- Filesystem / sync: prompt workspace sync no longer has to represent newly
  written cyclic folder graphs from normal Web API usage.
- UI / UX: clients get a clear validation error instead of a folder tree that
  appears to collapse or behave inconsistently.

## Rules

- Missing `parentId` remains allowed.
- `parentId: null` clears the parent and moves the folder to the root.
- A folder cannot be its own parent.
- A folder cannot move under any of its descendants.
- A visibility-only update cannot leave the folder mismatched with its current
  parent or direct children.
- Existing visibility/owner checks still run, and direct restore remains out of
  scope for this normal API guard.

## Tradeoffs

- The check lives in `FolderService` rather than the route so any Web caller
  using the service gets the same protection.
- The guard uses a bounded set walk over existing folder rows instead of a
  recursive SQL query; this matches the service's existing in-process
  validation style and keeps error handling simple.
- The shared folder update DTO now allows `parentId: null`, matching the
  existing SQLite `parent_id` nullable column and direct insert/sync snapshot
  shape.
- Direct child visibility checks are intentionally non-recursive because any
  valid folder graph already requires each edge to have matching visibility; a
  parent visibility change is invalid as soon as one direct child differs.

# Design

## Overview

Add PromptService-level reference guards and scoped tag operations. The folder
guard mirrors FolderService's visibility and ownership rules. The media guard
reuses the shared web media filename normalizer. Tag list/rename/delete now use
actor-aware row selection instead of the global `PromptDB` tag helpers.

## Affected Areas

- Data model: no schema change.
- IPC / API: Web prompt create/update/copy behavior changes from accepting
  invalid folder/media references to returning validation/not-found errors; tag
  meta endpoints no longer leak or mutate other users' private tags.
- Filesystem / sync: prompt workspace sync and export/sync media collection
  benefit because invalid new prompt references are rejected before later
  filesystem boundary work.
- UI / UX: API clients get clear validation responses instead of prompts
  silently disappearing from expected folder views or creating mismatched
  workspace paths.

## Rules

- Missing `folderId` remains allowed.
- A private prompt may reference only a private folder owned by the actor.
- A shared prompt may reference only a shared folder.
- Non-admin users still cannot create or modify shared prompts.
- Copying a visible shared prompt into a user's private library must clear the
  folder reference unless that folder is valid for the new private copy.
- Prompt `images` and `videos` references must be safe filenames: no empty
  names, current-directory placeholders, traversal, path separators, null bytes,
  or ASCII control characters.
- Prompt media references are not required to exist at prompt save time; export
  and sync continue to detect missing referenced media files when packaging
  media payloads.
- Tag list uses readable prompt rows: the actor's private prompts plus shared
  prompts.
- Tag rename/delete uses writable prompt rows: the actor's private prompts, and
  for admins, shared prompts as well. Normal users cannot mutate shared prompt
  tags through meta endpoints.

## Tradeoffs

- The checks live in `apps/web/src/services/prompt.service.ts` instead of the
  route so direct service users and route handlers share the same behavior.
- Import/direct-insert flows are intentionally not covered by this change
  because they restore snapshots and already flow through import/sync
  validation records.
- The older `PromptDB` global tag helpers remain for non-web callers, but Web
  routes no longer use them because they do not know about authenticated actor
  scope.

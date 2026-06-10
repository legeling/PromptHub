# Implementation

## Shipped

- Added Web prompt route regressions for invalid `folderId` writes:
  - normal users cannot create or update private prompts under another user's
    private folder
  - private prompts cannot be stored under shared folders
  - shared prompts cannot be stored under private folders
  - prompt updates can clear an existing folder assignment with `folderId: null`
  - copying a shared prompt into a user's private library clears the shared
    folder reference instead of carrying an invalid folder id into the private
    copy
- `apps/web/src/services/prompt.service.ts` now validates normal prompt create
  and update folder references before writing to SQLite or rebuilding the prompt
  workspace.
- `apps/web/src/routes/prompts.ts` now accepts `folderId: null` on normal prompt
  updates, matching the shared DTO and DB layer so users can move prompts back
  to the root.
- Prompt copy now keeps the source folder only when that folder is valid for the
  new private copy; otherwise it creates an uncategorized private copy.
- Added Web prompt route regressions for invalid media references:
  - prompt create rejects traversal image names
  - prompt create rejects backslash-separated video names
  - prompt update rejects null-byte image names and leaves existing safe media
    references untouched
- `apps/web/src/services/prompt.service.ts` now reuses the shared media filename
  normalizer for normal prompt create/update `images` and `videos` metadata
  before writing to SQLite or rebuilding the prompt workspace.
- Added Web prompt route regressions for oversized metadata arrays:
  - prompt create rejects more than 100 tags
  - prompt create rejects tags longer than 100 characters
  - prompt create rejects more than 50 variables
  - prompt create rejects more than 100 select options on a variable
  - prompt create rejects more than 100 image references
  - valid bounded tags, variables, image references, and video references still
    round-trip through the prompt read API
- `apps/web/src/routes/prompts.ts` now validates prompt metadata array counts
  and string lengths before normal create/update/direct-insert writes reach
  `PromptService`.
- Added Web prompt route regressions for tag metadata isolation:
  - tag listing includes the actor's private tags and shared tags
  - tag listing does not leak another user's private tags
  - normal-user tag rename/delete only changes that user's private prompts
  - another user's private prompt tags remain unchanged
- `apps/web/src/routes/prompts.ts` now passes the authenticated actor into tag
  list/rename/delete operations.
- `apps/web/src/services/prompt.service.ts` now implements scoped tag operations
  instead of using the global `PromptDB` tag helpers for Web routes.
- Added a Web prompt route regression for nested prompt version deletion:
  `DELETE /api/prompts/:id/versions/:versionId` now returns `404` and preserves
  the version when `versionId` belongs to a different prompt.
- `apps/web/src/services/prompt.service.ts` now verifies the version's
  `prompt_id` matches the route prompt id before calling the lower-level delete
  helper.

## Verification

- `pnpm --filter @prompthub/web test -- --run src/routes/prompts.test.ts -t "folder references|clears invalid folder"`:
  failed first before the service fix because cross-owner prompt creation
  returned `201` and shared prompt copy retained the shared `folderId`.
- `pnpm --filter @prompthub/web test -- --run src/routes/prompts.test.ts -t "folderId to null"`:
  failed first before the route schema fix because the update returned `422`.
- `pnpm --filter @prompthub/web test -- --run src/routes/prompts.test.ts -t "unsafe media references"`:
  failed first before the service fix because traversal image names returned
  `201` and were stored on the prompt.
- `pnpm --filter @prompthub/web test -- --run src/routes/prompts.test.ts -t "scopes tag"`:
  failed first before the service fix because a normal user's tag list included
  another user's private `other-secret` tag.
- `pnpm --filter @prompthub/web test -- --run src/routes/prompts.test.ts -t "folder references|clears invalid folder"`:
  passing after the service fix.
- `pnpm --filter @prompthub/web test -- --run src/routes/prompts.test.ts -t "folderId to null"`:
  passing after the route schema fix.
- `pnpm --filter @prompthub/web test -- --run src/routes/prompts.test.ts -t "unsafe media references"`:
  passing after the service fix.
- `pnpm --filter @prompthub/web test -- --run src/routes/prompts.test.ts -t "scopes tag"`:
  passing after the service fix.
- `pnpm --filter @prompthub/web test -- --run src/routes/prompts.test.ts`:
  **1 file / 9 tests**, passing.
- `pnpm --filter @prompthub/web test -- --run src/routes/prompts.test.ts -t "different prompt id"`:
  failed first before the service fix because the wrong nested route returned
  `200` and deleted another prompt's version.
- `pnpm --filter @prompthub/web test -- --run src/routes/prompts.test.ts -t "different prompt id"`:
  passing after the service fix.
- `pnpm --filter @prompthub/web test -- --run src/routes/prompts.test.ts`:
  **1 file / 10 tests**, passing.
- `pnpm --filter @prompthub/web test -- --run src/routes/prompts.test.ts -t "rejects oversized prompt metadata arrays"`:
  failed first before the route schema fix because 101 tags returned `201` and
  created a prompt.
- `pnpm --filter @prompthub/web test -- --run src/routes/prompts.test.ts -t "rejects oversized prompt metadata arrays"`:
  passing after the route schema fix.
- `pnpm --filter @prompthub/web test -- --run src/routes/prompts.test.ts -t "persists valid bounded prompt metadata arrays"`:
  passing after the route schema fix.
- `pnpm --filter @prompthub/web test -- --run src/routes/prompts.test.ts`:
  **1 file / 14 tests**, passing.
- `pnpm --filter @prompthub/web typecheck`: passing.
- `pnpm --filter @prompthub/web lint`: passing.
- `git diff --check -- apps/web/src/routes/prompts.ts apps/web/src/routes/prompts.test.ts spec/changes/active/web-prompt-folder-ownership`:
  clean.
- `git diff --check -- apps/web/src/services/prompt.service.ts apps/web/src/routes/prompts.test.ts spec/changes/active/web-prompt-folder-ownership`:
  clean.

## Synced Docs

- Stable docs were not updated in this step. The behavioral delta is captured
  in this active change and can be synced into long-lived Web/API behavior docs
  when the change is archived.

## Follow-ups

- Consider whether the prompt editor UI should prevalidate selected media names
  client-side for faster feedback, while keeping the service boundary as the
  source of truth.

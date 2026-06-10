# Implementation

## Shipped

- Added prompt list query constants for keyword, raw tag query, tag count, and
  folder id limits.
- Added `parseTagQuery()` so tag filters are split once and rejected when they
  contain more than 50 entries.
- Updated prompt list query validation messages to include field paths.
- Added a route regression for oversized keyword and too-many-tags filters.
- Added a service-level regression proving `PromptService.list()` must not
  issue per-prompt detail queries after the visible list query.
- Changed `PromptService.list()` to query complete visible prompt rows directly
  and map them to the existing Web prompt payload shape before applying the
  existing in-memory filter/sort/pagination flow.
- Added a service-level regression proving paginated prompt list requests must
  use SQL `COUNT(*)`, `LIMIT`, and `OFFSET` instead of loading all matching rows
  into application memory.
- Pushed prompt list visibility, keyword, tag, folder, favorite, default date,
  created date, and usage-count sorting filters into SQL for non-title sorts.
  `sortBy=title` still uses the existing JS `localeCompare` path to avoid
  changing string collation semantics.
- Added a Web client API regression proving `getPrompts()` forwards supported
  tag, folder, limit, and offset filters instead of silently dropping them.
- Updated `apps/web/src/client/api/prompts.ts` so the self-hosted Web client API
  wrapper matches the route and desktop bridge prompt list query surface.

## Verification

- Failure-first check:
  - `pnpm --filter @prompthub/web test -- --run src/routes/prompts.test.ts -t "oversized prompt list query"`
  - Failed because a 501-character `keyword` returned `200`.
- Passing checks:
  - `pnpm --filter @prompthub/web test -- --run src/routes/prompts.test.ts -t "oversized prompt list query"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/prompts.test.ts`
  - `pnpm --filter @prompthub/web typecheck`
  - `pnpm --filter @prompthub/web lint`
  - `git diff --check -- apps/web/src/routes/prompts.ts apps/web/src/routes/prompts.test.ts spec/changes/active/web-prompt-list-query-boundary`
- Prompt list query-efficiency failure-first check:
  - `pnpm --filter @prompthub/web test -- --run src/services/prompt.service.test.ts -t "lists visible prompts without per-prompt detail queries"`
  - Failed before implementation because listing two visible prompts called
    `prepare()` five times.
- Prompt list query-efficiency passing checks:
  - `pnpm --filter @prompthub/web test -- --run src/services/prompt.service.test.ts -t "lists visible prompts without per-prompt detail queries"`
  - `pnpm --filter @prompthub/web test -- --run src/services/prompt.service.test.ts`
  - `pnpm --filter @prompthub/web test -- --run src/routes/prompts.test.ts`
  - `pnpm --filter @prompthub/web typecheck`
  - `pnpm --filter @prompthub/web lint`
  - `git diff --check -- apps/web/src/services/prompt.service.ts apps/web/src/services/prompt.service.test.ts spec/changes/active/web-prompt-list-query-boundary`
- Prompt list SQL pagination failure-first check:
  - `pnpm --filter @prompthub/web test -- --run src/services/prompt.service.test.ts -t "applies prompt list pagination in SQL"`
  - Failed before implementation because the service did not prepare a
    `COUNT(*)` query or a data query with `LIMIT ? OFFSET ?`.
- Prompt list SQL pagination passing checks:
  - `pnpm --filter @prompthub/web test -- --run src/services/prompt.service.test.ts -t "applies prompt list pagination in SQL"`
  - `pnpm --filter @prompthub/web test -- --run src/services/prompt.service.test.ts`
  - `pnpm --filter @prompthub/web test -- --run src/routes/prompts.test.ts`
  - `pnpm --filter @prompthub/web typecheck`
  - `pnpm --filter @prompthub/web lint`
  - `git diff --check -- apps/web/src/services/prompt.service.ts apps/web/src/services/prompt.service.test.ts spec/changes/active/web-prompt-list-query-boundary`
- Web client prompt list query forwarding failure-first check:
  - `pnpm --filter @prompthub/web test -- --run src/client/api/prompts.test.ts -t "query strings"`
  - Failed before implementation because `tags`, `folderId`, `limit`, and
    `offset` were absent from the requested URL.
- Web client prompt list query forwarding passing checks:
  - `pnpm --filter @prompthub/web test -- --run src/client/api/prompts.test.ts -t "query strings"`
- Literal tag filter failure-first checks:
  - `pnpm --filter @prompthub/web test -- --run src/client/api/prompts.test.ts -t "literal tag"`
  - Failed before implementation because the client sent
    `tags=legal%2Creview%2Clanding+page`.
  - `pnpm --filter @prompthub/web test -- --run src/client/desktop/install-bridge.test.ts -t "encodes entity ids"`
  - Failed before implementation because the desktop bridge prompt search sent
    `tags=legal%2Creview%2Clanding+page`.
  - `pnpm --filter @prompthub/web test -- --run src/routes/prompts.test.ts -t "literal repeated tag"`
  - Failed before implementation because `tag=legal%2Creview` was ignored and
    the unfiltered prompt list was returned.
- Literal tag filter passing checks:
  - `pnpm --filter @prompthub/web test -- --run src/client/api/prompts.test.ts`
  - `pnpm --filter @prompthub/web test -- --run src/client/desktop/install-bridge.test.ts`
  - `pnpm --filter @prompthub/web test -- --run src/routes/prompts.test.ts`
  - `pnpm --filter @prompthub/web typecheck`
  - `pnpm --filter @prompthub/web lint`
  - `git diff --check -- apps/web/src/client/api/prompts.ts apps/web/src/client/api/prompts.test.ts apps/web/src/client/desktop/install-bridge.ts apps/web/src/client/desktop/install-bridge.test.ts apps/web/src/routes/prompts.ts apps/web/src/routes/prompts.test.ts spec/changes/active/web-prompt-list-query-boundary spec/issues/active/quality.md`

## Synced Docs

- Active proposal, design, delta spec, tasks, and implementation records cover
  this narrow Web prompt list query boundary. No stable docs were synced because
  the broader prompt list workflow remains unchanged.

## Follow-ups

- SQL-level filtering is now used for the normal non-title prompt list path.
  `sortBy=title` remains an in-memory fallback so the existing locale-aware
  ordering is preserved.

# Implementation

## Shipped

- Added route-level custom agent limits in `apps/web/src/routes/settings.ts`:
  - at most 32 custom agents
  - required trimmed `id`, `name`, and `rootPath`
  - bounded id/name, root path, relative path, and `configRelativePaths` values
- Added route regressions covering too many custom agents, blank name, blank root path, too many config relative paths, unchanged default state after rejected updates, and a valid custom agent persistence path.

## Verification

- Failure-first check:
  - `pnpm --filter @prompthub/web test -- --run src/routes/settings.test.ts -t "custom agent settings"`
  - Failed before the fix because a 33-agent payload returned `200`.
- Passing checks:
  - `pnpm --filter @prompthub/web test -- --run src/routes/settings.test.ts -t "custom agent settings"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/settings.test.ts`

## Synced Docs

- Active change only; no stable docs are expected for this narrow live settings validation boundary.

## Follow-ups

- Audit `builtinAgentOverrides`, `skillProjects`, and platform path maps for similar Web settings limits.

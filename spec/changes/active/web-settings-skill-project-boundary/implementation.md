# Implementation

## Shipped

- Added route-level skill project limits in `apps/web/src/routes/settings.ts`:
  - at most 32 skill projects
  - required trimmed `id`, `name`, and `rootPath`
  - bounded project fields, scan paths, deploy targets, and path string lengths
  - nonnegative integer timestamps
- Added route regressions covering too many projects, blank name, blank root path, too many scan paths, too many deploy targets, unchanged default state after rejected updates, and a valid skill project persistence path.

## Verification

- Failure-first check:
  - `pnpm --filter @prompthub/web test -- --run src/routes/settings.test.ts -t "skill project settings"`
  - Failed before the fix because a 33-project payload returned `200`.
- Passing checks:
  - `pnpm --filter @prompthub/web test -- --run src/routes/settings.test.ts -t "skill project settings"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/settings.test.ts`
  - `pnpm --filter @prompthub/web typecheck`
  - `pnpm --filter @prompthub/web lint`
  - `git diff --check -- apps/web/src/routes/settings.ts apps/web/src/routes/settings.test.ts spec/changes/active/web-settings-skill-project-boundary`

## Synced Docs

- Active change only; no stable docs are expected for this narrow live settings validation boundary.

## Follow-ups

- Audit `builtinAgentOverrides` and platform path maps for similar Web settings limits.

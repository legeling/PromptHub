# Implementation

## Shipped

- Added `promptTagSchema` and route-level constants for Web settings tag catalog limits.
- `promptTagCatalog` now accepts at most 200 trimmed, non-empty tags.
- Each catalog tag is limited to 100 characters.
- Added a route regression covering too many tags, overlong tags, blank tags, and the unchanged default catalog after rejected updates.

## Verification

- Failure-first check:
  - `pnpm --filter @prompthub/web test -- --run src/routes/settings.test.ts -t "validates malformed settings updates"`
  - Failed before the fix because a 201-item tag catalog returned `200`.
- Passing checks:
  - `pnpm --filter @prompthub/web test -- --run src/routes/settings.test.ts -t "validates malformed settings updates"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/settings.test.ts`

## Synced Docs

- Active change only; no stable docs are expected for this narrow preference validation boundary.

## Follow-ups

- Audit other settings arrays and path maps for similar size constraints.

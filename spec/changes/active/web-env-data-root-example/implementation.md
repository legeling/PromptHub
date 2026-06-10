# Implementation

## Shipped

- Added `apps/web/src/config.test.ts` to assert the tracked Web example
  environment file documents `DATA_ROOT` and does not document unsupported
  `DATA_DIR`.
- Updated `apps/web/.env.example` from `DATA_DIR=./data` to `DATA_ROOT=./`,
  matching `apps/web/src/config.ts` and the documented runtime layout.

## Verification

- Failure-first checks:
  - `pnpm --filter @prompthub/web test -- --run src/config.test.ts`
  - First failed because the new test pointed at `apps/.env.example`; the test
    path was corrected before validating the target behavior.
  - Re-running the same command then failed because `DATA_ROOT` was undefined in
    `apps/web/.env.example`.
- Passing checks:
  - `pnpm --filter @prompthub/web test -- --run src/config.test.ts`
  - `pnpm --filter @prompthub/web typecheck`
  - `pnpm --filter @prompthub/web lint`
  - `git diff --check -- apps/web/.env.example apps/web/src/config.test.ts spec/changes/active/web-env-data-root-example`

## Synced Docs

- Existing self-hosted docs already describe `DATA_ROOT`; no stable docs needed
  a behavior update for this example-file alignment.

## Follow-ups

- Existing local, untracked `.env` files may still contain `DATA_DIR` and need
  manual user migration if they were copied before this fix.

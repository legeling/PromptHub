# Mobile Prompt Persistence Hardening Implementation

## Product

Mobile

## Status

Release-pending. Mobile Prompt persistence now has an explicit schema version
and transactional initialization, repository parsing and failures are
hardened, and the list/detail/edit workflow uses functional controls with
localized feedback. The change remains active until the non-quick release
harness and native iOS/Android release-candidate checks are complete.

## Delivered

- Added a versioned SQLite initialization boundary with future-version refusal
  and rollback on failed migrations.
- Replaced synchronous Expo SQLite opening and queries with asynchronous calls,
  removing the web preview's `Sync operation timeout` failure.
- Split the Prompt repository core from the Expo adapter so persistence behavior
  can be exercised against a real in-memory SQLite database.
- Added safe tag parsing, missing-row errors, route-focus refresh, confirmed
  deletion, and visible load/save/delete failures.
- Added browser alert/confirmation fallbacks so validation, failures, and
  destructive confirmation remain functional in the Expo web target.
- Replaced decorative search and filter controls with working Prompt, Skill, and
  Store filtering; controls without behavior are no longer exposed as actions.
- Localized the Prompt workflow across all seven supported locales.
- Corrected the stable mobile behavior record so SQLite is the durable source of
  truth for Prompt records.

## Verification

- `pnpm typecheck:mobile` passed.
- `pnpm test:mobile` passed: 20 tests.
- Focused mobile coverage passed at 100% lines, functions, branches, and
  statements for `database.ts`, `mobileSchema.ts`, `promptRepositoryCore.ts`,
  `promptFilters.ts`, and `platformAlerts.ts`.
- Expo web export passed and generated 15 routes.
- Playwright loaded `/prompts` at a 390 x 844 viewport, completed create, search,
  edit, refresh, and confirmed-delete flows, and reported no page or console
  errors.
- Focused desktop regression verification passed: 7 files and 125 tests.
- `node website/scripts/sync-release.mjs` passed for `v0.5.9`.
- `pnpm verify:release:quick` passed all 18 stages in 375.0 seconds.

## Remaining Release Work

- Run the non-quick release harness before tagging when the stable publishing
  policy requires it.
- Native iOS and Android device interaction remains a release-candidate check;
  automated verification covered the shared repository contract and web build.

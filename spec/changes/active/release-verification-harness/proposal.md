# Proposal

## Why

Recent releases exposed multiple user-found regressions after publishing. The project has many useful tests, but the release gate is split across app-specific scripts and CI workflows. That makes it easy to miss a maintained surface, rerun the same layer through different aggregate scripts, or ship without a clear mapping from bug class to harness layer.

## Scope

- In scope:
  - Add a root release verification harness that covers desktop, CLI, web, Cloudflare worker, and shared workspace packages.
  - Keep each harness command unique so release validation does not duplicate the same test layer through nested aggregate scripts.
  - Document the expected verification layers for future bug fixes and release work.
- Out of scope:
  - Rewriting existing test suites.
  - Adding new product-specific regression cases for the user-reported bugs before those bugs are triaged individually.
  - Replacing GitHub Actions release packaging jobs.

## Risks

- The full release harness is slower than the existing desktop-only gate because it includes all maintained surfaces.
- Newly exposed package-level typecheck gaps may fail until shared packages are brought into compliance.
- E2E smoke remains environment-sensitive and may require local browser/runtime dependencies.

## Rollback Thinking

The change is additive. If the harness blocks unexpectedly, remove the root `verify:release` scripts and the package-level typecheck scripts, then continue using the existing app-specific verification commands while the failure is diagnosed.

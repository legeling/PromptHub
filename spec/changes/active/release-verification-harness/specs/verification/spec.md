# Delta Spec

## Added

- PromptHub MUST provide a root release verification harness that can be run before publishing a desktop, CLI, web, or worker release.
- The release harness MUST cover all maintained distribution surfaces: desktop, CLI, web, Cloudflare worker, and shared workspace packages.
- The release harness MUST avoid duplicate validation commands inside the same profile.
- The release harness MUST fail fast and report the failed layer by stable check id.
- Shared workspace packages that are consumed by apps MUST expose explicit package-level typecheck scripts.

## Modified

- Release readiness is no longer defined by desktop-only validation. A release candidate is ready only after the root release harness passes, unless the release scope explicitly excludes a product surface and the skipped surface is documented.

## Removed

- None.

## Scenarios

- Scenario: Maintainer runs a full release gate
  - Given a release candidate
  - When the maintainer runs `pnpm verify:release`
  - Then the harness runs package, CLI, desktop, web, and worker checks exactly once per command
  - And the process exits non-zero on the first failed check

- Scenario: Maintainer needs faster local triage
  - Given a local worktree
  - When the maintainer runs `pnpm verify:release:quick`
  - Then the harness runs the static, unit, and build checks needed for quick feedback
  - And it skips the slower release-only desktop integration, performance, bundle, and E2E smoke layers

- Scenario: A new check duplicates an existing command
  - Given a future edit to the harness
  - When two checks use the same exact command
  - Then the harness fails before running validation commands

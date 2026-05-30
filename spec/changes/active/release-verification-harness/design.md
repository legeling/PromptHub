# Design

## Overview

Add `scripts/verify-release.mts` as the root release harness. The harness owns a flat list of checks, validates that no two entries share the same id or exact command, and runs the selected profile sequentially with fail-fast behavior.

Two profiles are available:

- `release`: full publishing gate, including integration, performance, bundle budget, and desktop E2E smoke.
- `quick`: faster local triage gate, limited to package typecheck, lint, unit tests, and builds.

## Affected Areas

- Data model: none.
- IPC / API: none.
- Filesystem / sync: none.
- UI / UX: none.
- Tooling:
  - Root `package.json` gains `verify:release` and `verify:release:quick`.
  - `packages/core`, `packages/db`, and `packages/shared` gain explicit `typecheck` scripts.
  - `packages/shared/tsconfig.json` now includes `utils/**/*` because utils are exported package surface.

## Verification Layer Ownership

- Shared packages: compile exported shared contracts before downstream apps consume them.
- CLI: lint, typecheck, tests, and build for standalone distribution.
- Desktop: lint, typecheck, unit, integration, build, performance budget, bundle budget, and E2E smoke.
- Web: lint, typecheck, tests, and build.
- Cloudflare worker: lint, typecheck, and tests.

## Tradeoffs

- The harness intentionally does not call aggregate scripts such as `test:release` or `verify:web`; it expands the underlying unique commands so duplicate validation is visible and prevented.
- Checks are sequential for readable failure logs and deterministic stop points. Parallel execution can be added later after the first stable gate is trusted.

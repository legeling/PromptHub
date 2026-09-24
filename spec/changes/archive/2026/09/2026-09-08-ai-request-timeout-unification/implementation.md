# Implementation

## Status

- Phase: converge
- Status: completed

## Shipped

- Added one shared 300-second deadline for PromptHub-owned AI HTTP requests.
- Unified model discovery, connection tests, chat, Skill translation, image generation, the Electron main-process transport, browser fallback, and the shared core AI client.
- Kept the deadline active through non-streaming response body reads and streaming completion.
- Preserved explicit positive `timeoutMs` compatibility at the transport boundary without retaining product-owned shorter defaults.
- Added no retries and left Agent probes, sync, downloads, Git, database, UI timers, and polling cadence unchanged.

## Verification

- `TEST-AI-TIMEOUT-001`: `ai-transport.test.ts` passed, 23 tests; Skill translation cache and timeout presentation tests passed, 39 tests.
- `TEST-AI-TIMEOUT-002`: `ai-ipc.test.ts` passed, 6 tests, including stalled non-streaming body and stalled stream deadlines.
- `TEST-AI-TIMEOUT-003`: Core `ai-protocol.test.ts` passed, 9 tests, including abort at the shared deadline.
- Desktop, Core, and Shared TypeScript checks passed.
- Scoped Desktop ESLint and changed-file Prettier checks passed.
- `pnpm spec:traceability` passed for 16 changes, and `pnpm spec:index:check` passed after archive/index regeneration.
- Focused Desktop coverage run passed, 3 files / 49 tests. The selected legacy production files measured 57.95% statements/lines, 60.4% branches, and 69.69% functions overall; every new deadline route is exercised, while unrelated legacy branches remain outside this change.
- Full repository tests, production build, and E2E were not run because this transport-constant change does not alter packaging or UI workflow and the shared worktree contains extensive unrelated in-progress changes.
- The aggregate `pnpm spec:test` wrapper was not run because its referenced `.agents/skills/spec-init/tests/*` scripts are removed in the pre-existing shared worktree; the available traceability and generated-index checks were run directly.

## Converge

- Stable docs synced: `spec/knowledge/reference/ai-provider-apis.md` and `spec/knowledge/behavior/skills.md`.
- Superseded record annotated: `2026-09-08-skill-translation-long-request-timeout`.
- Final change destination: `spec/changes/archive/2026/09/2026-09-08-ai-request-timeout-unification/`.

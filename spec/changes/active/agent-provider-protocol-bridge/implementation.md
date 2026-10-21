# Agent Provider Protocol Bridge Implementation

## Product

Desktop

## Status

in progress. Routing contracts, codecs, lifecycle and UI remain open.

## Shipped

- The Agent provider form uses the canonical protocol names OpenAI Chat,
  OpenAI Responses, Anthropic Messages, and Google Generative AI.
- Kimi's existing `google-genai` native provider kind now has a matching Google
  Generative AI option; its direct protocol selector covers all four protocols.
- A shared pure route planner records each verified Agent adapter's direct
  protocol projection and identifies non-native combinations as unavailable
  bridge routes until the runtime is present. Pi's native
  `openai-completions` identifier remains an explicit projection of the
  canonical OpenAI Chat family.

## Verification

- `TEST-PROTOCOL-001`:
  - Command: `./node_modules/.bin/vitest run tests/unit/components/agent-provider-profile-workbench.test.tsx --reporter=dot`
  - Result: 26 tests passed.
  - Skipped/warnings: Vite printed its existing CJS Node API deprecation warning.
- `TEST-PROTOCOL-002`:
  - Command: `node --experimental-strip-types --test packages/shared/tests/agent-provider-protocol-route.test.ts`
  - Result: 6 tests passed, covering the four-protocol order, eight verified
    Agent adapters, direct mappings, unavailable and available bridge routes,
    and unknown input failures.
  - Skipped/warnings: none.
- Additional verification:
  - `./node_modules/.bin/vitest run tests/unit/components/renderer-i18n-smoke.test.tsx --reporter=dot`: 2 tests passed.
  - `./node_modules/.bin/tsc --noEmit` in `packages/shared`: passed.
  - `./node_modules/.bin/tsc --noEmit` in `apps/desktop`: passed.
  - `./node_modules/.bin/vite build` in `apps/desktop`: renderer, main, and
    preload builds passed; existing chunk-size and mixed dynamic/static import
    warnings remain.

## Analyze

- Traceability complete for the delivered batch: `FR-PROTOCOL-001` ->
  `DES-PROTOCOL-001` -> `TEST-PROTOCOL-001` -> `T-PROTOCOL-001`, and
  `FR-PROTOCOL-002` -> `DES-PROTOCOL-001` -> `TEST-PROTOCOL-002` ->
  `T-PROTOCOL-002`.
- Conflicts/blockers resolved: the existing direct-only import remains truthful;
  non-native choices are not enabled before the bridge runtime exists.

## Converge

- Stable workflow/knowledge/rules synced: pending bridge implementation.
- Issues/releases/ADRs/indexes synced: pending.
- Final change destination: remains active.

## Synced Docs

- None yet; the stable protocol reference remains unchanged until runtime
  behavior ships.

## Follow-ups

- Route planning, protocol codecs, loopback lifecycle, activation integration,
  and end-to-end verification remain required before bridged choices are usable.

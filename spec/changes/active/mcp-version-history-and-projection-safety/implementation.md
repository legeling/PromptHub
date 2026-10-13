# Implementation

## Status

- Phase: implement
- Status: in-progress
- Completed scope: external target projection safety and `backupPath`
  deprecation
- Remaining scope: My MCP version history, conflict workflows, legacy-sidecar
  cleanup, product surfaces, and convergence

## Implemented In This Iteration

- Replaced adjacent `.prompthub-mcp-backup-*` creation in apply, remove, and
  managed-target synchronization with one shared projection commit boundary.
- Added byte-identical no-op detection so repeated distribution does not change
  target inode or modification time.
- Added same-directory temporary publication, file flush, atomic rename,
  post-write byte and MCP-entry verification, and exact in-memory rollback.
- Restores the original bytes when verification or binding persistence fails;
  removes a newly created target when the same failure occurs on first write.
- Removes temporary projection files on success and failure. No persistent or
  centralized copy of an external Agent/project config is created.
- Kept the optional `backupPath` fields readable for compatibility, marked them
  deprecated, and omitted them from new projection results.
- Classified empty MCP `env` and header values as file-owned unconfigured
  placeholders. Canonical publication now extracts only non-empty literal
  credentials into the device vault and merges both classes on hydration.
- Added a renderer inventory read path that degrades only unavailable device
  secrets to the existing redaction sentinel. Strict execution and mutation
  reads still reject missing or invalid secrets.
- Routed Desktop `mcp-library:get` through the redacted file inventory path so
  one unavailable vault cannot erase every file-owned MCP entry from the UI.

## Remaining Delivery

- Formal My MCP version history under PromptHub-owned data.
- No persistent backup artifact for external Agent/project MCP projection.
- Atomic projection, in-operation rollback, verification, and crash
  reconciliation.
- Entry-level import/overwrite conflict handling.
- Previewed and confirmed cleanup for legacy PromptHub sidecars.

## Verification Status

- Test-first evidence: the changed Desktop projection tests failed against the
  previous sidecar implementation before production code changed.
- `pnpm --filter @prompthub/core exec vitest run
tests/mcp-target-projection.test.ts --coverage
--coverage.include=src/mcp-target-projection.ts --coverage.reporter=text`:
  9 tests passed; the changed projection helper reached 100% statements,
  branches, functions, and lines.
- Focused Desktop MCP suite: 3 files and 52 tests passed.
- `pnpm --filter @prompthub/core typecheck`: passed.
- `pnpm --filter @prompthub/shared typecheck`: passed.
- Empty-placeholder and vault-degradation regression suite: 2 Core files and
  23 tests passed; 3 Desktop files and 25 tests passed.
- Changed Core MCP coverage run: 23 tests passed; canonical migration reached
  100% statements/branches/functions/lines, while the larger existing canonical
  library and resource-schema modules reached 91.61%/88.18% and
  94.97%/68.62% statement/branch coverage respectively. Every new
  placeholder, strict-read, missing-vault, unreadable-vault, and redacted-read
  decision is exercised.
- Core and Desktop typechecks passed. Scoped Desktop ESLint, Prettier, file-size
  enforcement, and repository spec governance/traceability passed.
- Development-root migration produced six validated per-server MCP bundles,
  four device bindings, no superseded `library.json`, and explicit empty Slack
  credential placeholders without literal secret output. A direct canonical
  reload returned all six server names.
- UI verification, legacy-sidecar cleanup tests, and performance measurements
  remain pending with the unfinished tasks.

## Convergence Gate

This change must remain active until implementation, adversarial verification,
stable documentation sync, and issue-state reconciliation are complete.

## MCP correction #231 — 2026-10-13

Saved MCP entries with no description display the dedicated empty-description
key in all seven locales. `mcp-detail-feedback.test.tsx` asserts the rendered
empty state and absence of the selection/save hint. In an isolated copy,
restoring the original hint makes this test fail on the empty-state assertion
(exit 1); the repaired MCP component batch passes 204 tests in 26 files.
The isolated English Electron detail view displays the repaired text before
and after process restart. No CLI/Web entrypoint uses this Desktop detail UI.

## MCP correction #232 — 2026-10-13

Desktop health results translate stable issue codes with command/field/cwd
context in all seven locales. Core/CLI diagnostics are English and omit literal
environment/placeholder values. `mcp-health-feedback.test.tsx` asserts localized
text instead of the legacy message; restoring direct diagnostic rendering in
an isolated copy fails that assertion (exit 1). Core
`mcp-health-language.test.ts` asserts codes and English diagnostics; the Core
MCP/resource batch passes 102 tests. Isolated English Electron GUI shows the
missing-command error. Health remains static validation, not a protocol handshake.

## MCP correction #233 — 2026-10-13

Shared Codex TOML removal preserves unrelated sections and comments and removes
empty paired managed markers. `packages/core/tests/mcp-toml-cleanup.test.ts`
performs three apply/remove cycles and checks exact retained content and no
managed marker. Restoring the original removal in an isolated copy fails on
the orphan opening marker (exit 1); the repaired cleanup/backup batch passes
27 tests. Isolated Electron distribution/uninstall and process restart preserve
the unrelated Codex entry and leave neither managed marker. Desktop and CLI
consume the shared remover; Web's existing Agent MCP surface is read-only.

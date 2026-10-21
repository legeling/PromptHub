# Desktop Settings Authority Convergence Implementation

## Product

Desktop

## Status

active. Authority convergence and migration acceptance remain open; current local credential work does not close the whole plan.

## Shipped

- No production implementation is claimed by this change yet.
- `ADR-20260820-001` fixes the final settings authority, physical documents,
  process ownership, migration precedence, and legacy-store exit criteria.
- The current remembered-close fix remains a compatibility bridge until this
  change removes its SQLite projection and all legacy startup consumers.

## Verification

- Planning evidence: current policy and startup code were inspected against the
  accepted storage ADR, renderer migration, canonical rebuild classification,
  settings store persistence, and SQLite schema.
- Production tests: not run for this planning-only batch.
- Performance evidence: not run; the design requires bounded `O(S)` config
  publication and a single serialized writer before implementation can ship.

## Analyze

- Traceability complete: yes, for `FR-CONFIG-001..005`,
  `NFR-CONFIG-001`, `DES-CONFIG-001..005`, `TEST-CONFIG-001..007`, and
  `T-CONFIG-001..009`.
- Conflicts/blockers resolved: explicit durable preferences are canonical
  config; only incidental transient UI/session state remains renderer-owned.
- Remaining implementation prerequisite: the full field registry in
  `T-CONFIG-002` must be completed before source edits begin.

## Converge

- Stable workflow/knowledge/rules synced: pending implementation; stable docs
  must not claim the legacy stores are retired before code and fixtures prove it.
- Issues/releases/ADRs/indexes synced: ADR created; change index pending
  regeneration.
- Final change destination: pending verified implementation and release.

## Synced Docs

- `spec/adr/ADR-20260820-001-desktop-settings-authority.md`

## Follow-ups

- Complete the field classification inventory before modifying persistence
  code.
- Reconcile the active close-choice change with the final repository once the
  compatibility bridge is removed.

# Design — Prompt `current_version` startup self-heal

## DES-PCV-001 — Repair semantics

Storage primitive (`packages/db/src/prompt-version-consistency.ts`) operates on a
file-backed adapter Database in one transaction:

- compute `MAX(version)` per prompt from `prompt_versions`;
- `MAX` is non-null and `current_version != MAX` → `UPDATE prompts SET current_version = MAX`;
- `MAX` is null (prompt exists with content, no version row) → insert a version-1 row
  copied verbatim from the prompt row (`id` new uuid, note NULL, ai_response from
  `last_ai_response`, created_at from prompt) and set `current_version = 1`.

Healthy prompts never touched; second run is no-op. Rationale for choosing to converge
down (rather than abort): if the missing current version row is genuinely lost (e.g. a
manual delete), the newest intact content is still safe to present as current, whereas a
hard abort makes the whole vault unusable.

## DES-PCV-002 — Startup wiring

New `healPromptVersionPointers(sourceDatabasePath)` in
`apps/desktop/src/main/services/canonical-storage-startup.ts`, invoked in
`ensureCanonicalStorageAuthorityOnStartup` right after `prepareSourceDatabase?.()`
(first-time authority publication only) and before `publish(...)`:

- read first 16 bytes; only proceed when the SQLite header `SQLite format 3\0` matches,
  otherwise return (keeps non-SQLite fixture/recovery behavior unchanged);
- open the source with `DatabaseAdapter`, run `repairPromptVersionConsistency`, and close
  in `finally`.

This complements—rather than duplicates—the migration gates:
`fix_prompt_current_version_v1` / `repair_empty_prompt_version_chain_v1` run exactly once
and won't rerun after being marked, whereas this bootstrap heal re-validates before every
canonical projection so a regression between runs can't permanently block startup.

## Affected modules / ownership

- `packages/db` (storage primitive + DB-layer unit tests kept under desktop main tests
  with a real SQLite `:memory:` / file adapter).
- `apps/desktop/src/main/services/canonical-storage-startup.ts` (wiring + SQLite probe).
- No `packages/core` change; no schema/migration file added (reuses existing tables);
  no IPC/shared-types change.

## Risks / tradeoffs

- Convergence may present an older intact content as current when the newest row was
  lost; lossless-vs-available trade-off favors availability for startup.
- Repairing user data means the action is not read-only; it is idempotent and confined to
  version pointers plus (only when no chain exists) one snapshot row.
- Test coverage keeps adversarial boundary: missing pointer, empty chain, healthy,
  idempotency, non-SQLite skip.

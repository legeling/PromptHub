# Rules Issue 193: Missing Project Rule Reconciliation

## Phase And Status

- Phase: analyze
- Status: design-ready
- Primary requirement: `FR-RULE193-001`
- Exit condition: rescan persists missing-target state, the list clearly
  distinguishes missing rules, and explicit cleanup removes only selected
  missing project records without deleting unrelated or external files.

## Why

GitHub issue #193 reports that deleting a project `AGENTS.md` from disk and
rescanning leaves a normal-looking project rule in PromptHub.

The scanner computes the current filesystem state but does not persist the
changed project sync status. The cached database record can therefore remain
`synced`, while the renderer intentionally retains all project entries and does
not explain that the target disappeared.

PromptHub's managed Rule copy and versions are durable user data. Rescan must
not silently destroy them merely because an external target file is absent.

## Scope

- In scope:
  - reconcile project target existence during scan and persist changed sync
    status to metadata plus the Rules DB index;
  - keep the PromptHub-managed body and version history recoverable;
  - render an explicit missing/invalid state with its target path;
  - add confirmation-gated cleanup for selected missing project records;
  - keep existing global and present project rules unchanged;
  - cover rescan, cached reload, restart, cleanup, Windows paths, and failure
    behavior.
- Out of scope:
  - automatically deleting missing project records;
  - deleting or recreating external project files during rescan;
  - adding provenance inference that guesses whether a rule was scanned or
    manually created;
  - changing the one-canonical-`AGENTS.md` project rule model.

## Risks

- Automatic deletion could erase the only managed copy and its history.
- Rewriting metadata on every scan would cause unnecessary disk and DB I/O.
- A cleanup action could target a present or global rule if identifiers are not
  revalidated in the owning service.
- Windows path casing and separator differences can make duplicate or missing
  checks inconsistent.

## Rollback Thinking

No schema migration is required because `target-missing` already exists.
Rollback restores the previous scan/list behavior. Cleanup is destructive only
after explicit confirmation; before deletion, the existing managed content and
version history remain the recovery path.

## Related Records

- Issue: https://github.com/legeling/PromptHub/issues/193
- Existing Rules persistence change:
  `spec/changes/active/rules-managed-copies/`
- Stable behavior:
  `spec/knowledge/behavior/rules-workspace.md`
- Governing rules:
  `spec/rules/testing-standards.md`

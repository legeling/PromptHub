# Implementation

## Product

Shared

## Status

review-pending. The issue is closed, but restored-authorization and bounded-inventory acceptance remain open in this broader plan.

## Shipped

- Added one Shared compatibility normalizer used by Desktop backup import and
  Web snapshot parsing.
- Current `ai` and `preflight` provenance is preserved, legacy `static` maps to
  `preflight`, and unknown string methods remove only the auxiliary report.
- Non-method report validation remains strict in the Web Zod contract.
- Removed the Desktop renderer normalizer's forced `ai` assignment; current
  `ai` and `preflight` reports retain provenance and findings across repeated
  normalization. No installation approval policy changed.
- Report method labels and descriptions now derive from the preserved current
  provenance. Added deterministic/preflight wording in all seven Desktop locales;
  AI wording and installation approval policy remain unchanged.
- AI-specific scoring dimension explanations are shown only for AI reports.
  Preflight retains its stored findings, risk level, scan metadata and optional
  score without claiming that an AI model reviewed its content.

## Verification

- Shared: 25 tests passed; the new normalizer has 100% line/branch/function
  coverage, including a 10,000-Skill single-read regression.
- Web snapshot contract: 7 tests passed.
- Web backup route: malformed non-provenance safety data returns 422 and leaves
  no backup directory.
- Desktop backup format: 14 tests passed.
- Shared, Web, and Desktop typechecks plus targeted Web/Desktop ESLint: passed.
- Restored-authorization integration and bounded time/memory measurement remain
  follow-up release gates.
- Renderer provenance regression (2026-10-13): 4 normalizer tests passed,
  covering current `ai`/`preflight`, repeated normalization and existing
  metadata behavior. Desktop backup-format (14) and snapshot-compatibility (3)
  regressions also passed. Desktop source/test typechecks and targeted ESLint
  passed; no GUI or release-gate acceptance is implied.
- Provenance display regression (2026-10-13): 10 tests passed. Current `ai` and
  `preflight`, plus legacy `static`, traverse the real backup codec, the Skill
  restore DB primitive, a disk SQLite close/reopen, renderer normalization and
  the actual report modal DOM. Labels and descriptions match current provenance,
  and all seven locales have their own preflight entries. No native GUI or full
  portable-restore/release acceptance is implied.

## Analyze

- Traceability complete: implementation is mapped; restored-authorization and
  bounded-inventory verification tasks remain open.
- Conflicts/blockers resolved: the shared `ai | preflight` type is canonical;
  legacy `static` maps to `preflight`; unknown provenance removes only the
  auxiliary report.

## Converge

- Stable sync behavior and local issue overlay synced: yes.
- GitHub #191 was closed on 2026-10-19; closure does not complete the broader
  restored-authorization and capacity acceptance tasks in this plan.
- Final change destination: active until release assignment.

## Synced Docs

- `spec/knowledge/behavior/sync.md`

## Follow-ups

- Re-audit any other import/export codec that rewrites scan provenance instead
  of using the shared compatibility helper.

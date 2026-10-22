# Implementation

## Product

Shared

## Status

review-pending. Matrix, capacity and native lifecycle acceptance tasks remain open.

## Shipped

- Plugin imports inspect every allowlisted target-native marker and persist
  `nativeTargetIds` without changing the canonical package identity.
- Distribution preserves an exact target-native manifest when present and
  falls back to the existing adapter only when the package lacks that target.
- Secondary manifests are bounded to 1 MiB and checked for malformed JSON,
  traversal, non-file markers, and symlink escape. Invalid evidence is stored
  per target, disables only that target, and cannot be overwritten by an
  adapter distribution; an escaping package symlink still rejects the package.
- Installed detail target matrices overlay per-package native evidence.
- Review hardening validates source packages before managed copy and removes a
  newly materialized package if entry construction or persistence fails.

## Verification

- 2026-10-22 authorized macOS Electron acceptance: a local dual-manifest fixture
  exposes both native targets, installs through real Codex and Claude CLIs, and
  retains both distribution targets after application restart. The exact report's
  `https://github.com/ayghri/i-have-adhd` URL imports version 0.4.1 and displays both
  native Codex/Claude targets. Initial download attempts lacked the existing proxy
  variables; matching the user's existing routing resolved Git access without
  product changes. #190 is closed for the missing-target defect; original Windows
  and execution of the upstream package's hooks were not tested.
- Existing focused Desktop import/native/target-overlay regressions pass in the
  seven-issue audit. Native Plugin Toast/close/horizontal-action/light-dark GUI
  regression also passes. No generated Plugin hooks were executed by this check.

- Desktop Plugin focused suites: 41 tests passed across distribution/import,
  package validation/version restore, and native/invalid target overlay.
- Core and Desktop typechecks: passed.
- Targeted Desktop ESLint: passed.
- Shared branch coverage is not applicable to this Core-owned change; focused
  Core coverage and the large-package probe remain pending.

## Analyze

- Traceability complete: implementation is mapped; lifecycle, performance, and
  running-Desktop verification tasks remain open.
- Conflicts/blockers resolved: package identity remains canonical and
  deterministic, while native support becomes per-target evidence.

## Converge

- Stable Plugin behavior synced: yes.
- Local issue overlay synced: yes; #190 closed after exact-source macOS acceptance,
  independently of the broader matrix/capacity tasks and release state.
- Final change destination: active until release assignment and manual Desktop
  operation are complete.

## Synced Docs

- `spec/knowledge/behavior/plugins.md`

## Follow-ups

- Enabling currently disabled native installer targets requires separate
  registration and rollback designs; marker recognition alone is insufficient.
- The explicit large-package filesystem-operation probe and running-Desktop
  walkthrough remain release gates, not correctness blockers for #190.

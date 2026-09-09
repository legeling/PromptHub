# Sync Issue 191: Safety Report Contract Compatibility

## Phase And Status

- Phase: analyze
- Status: design-ready
- Primary requirement: `FR-SYNC191-001`
- Exit condition: the current desktop `preflight` payload and supported legacy
  payloads pass the Web sync contract without weakening validation of the
  remaining snapshot, and focused cross-surface regression tests are green.

## Why

GitHub issue #191 reports that a self-hosted backup is rejected when a Skill
contains `safetyReport.scanMethod: "preflight"`. The shared Skill contract
defines `ai | preflight`, while the Web snapshot parser accepts `ai | static`
and rewrites both accepted values to `ai`. A valid current Desktop payload can
therefore fail before the remote snapshot is written.

This is a data-protection defect: auxiliary scan provenance must not make an
otherwise valid backup unavailable, and compatibility handling must not
misrepresent a deterministic preflight as an AI assessment.

## Scope

- In scope:
  - establish one shared compatibility policy for Skill safety reports in
    backup and sync payloads;
  - preserve current `ai` and `preflight` values;
  - migrate the legacy `static` value to `preflight`;
  - remove only an unrecognized scan-method report while preserving the Skill
    and the rest of the snapshot;
  - keep all non-scan-method safety report fields and all unrelated snapshot
    fields under strict validation;
  - replace the Desktop import normalizer that currently forces every report to
    `ai`;
  - add producer-to-consumer contract and route-level failure tests.
- Out of scope:
  - changing the safety scanner or its install blocking policy;
  - treating restored safety reports as installation authorization;
  - changing self-hosted retention, merge, authentication, or transport;
  - rewriting existing local Skill rows.

## Risks

- Over-broad preprocessing could hide malformed or hostile snapshot data.
- Reclassifying `static` as `ai` would create false provenance.
- Retaining an unknown report could accidentally grant trust after restore.
- Deep-cloning a large snapshot solely for one compatibility field would add
  avoidable memory cost.

## Rollback Thinking

The change adds no schema migration and does not rewrite local rows. Rollback
restores the previous parser and import normalizer. A rejected payload is not
written remotely, so parser failure must remain side-effect free.

## Related Records

- Issue: https://github.com/legeling/PromptHub/issues/191
- Related reliability change:
  `spec/changes/active/self-hosted-skill-sync-reliability/`
- Stable behavior:
  `spec/knowledge/behavior/skills.md`,
  `spec/knowledge/behavior/sync.md`
- Governing rules:
  `spec/rules/testing-standards.md`

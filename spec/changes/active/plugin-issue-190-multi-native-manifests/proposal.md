# Plugin Issue 190: Multi-Native Manifest Support

## Phase And Status

- Phase: analyze
- Status: design-ready
- Primary requirement: `FR-PLUG190-001`
- Exit condition: a package with valid Codex and Claude native manifests is
  recognized and distributed natively to both targets, while malformed
  secondary manifests are isolated to their own target.

## Why

GitHub issue #190 reports that `ayghri/i-have-adhd`, which contains both
`.codex-plugin/plugin.json` and `.claude-plugin/plugin.json`, is recognized as
native only for Codex.

PromptHub currently scans marker paths in priority order and returns the first
match. Distribution passthrough is also hard-coded to Codex. A multi-native
package is therefore collapsed into one canonical marker, and a valid Claude
package is unnecessarily regenerated through the adapter path.

## Scope

- In scope:
  - discover every supported native package marker within the verified package
    root;
  - retain one deterministic canonical manifest for package identity while
    tracking per-target native evidence separately;
  - validate each native marker independently;
  - overlay target compatibility for the selected Plugin or batch;
  - pass through an exact target-native package for Codex and Claude;
  - generate an adapter marker only when that target has no native marker;
  - add real multi-manifest package fixtures and update/rescan regressions.
- Out of scope:
  - enabling currently disabled Cursor, Kiro, Copilot, Qwen, runtime-only, or
    composite distribution targets;
  - executing plugin code or native installers;
  - changing Plugin child-asset ownership;
  - inferring native support from README text or directory names without a
    recognized valid marker.

## Risks

- Treating marker presence alone as native support could accept malformed or
  escaping manifests.
- Combining all manifests into one identity object could create conflicting
  names, versions, or asset paths.
- A stale cached target list could disagree with files changed after import.
- Passthrough must not skip package boundary or symlink validation.

## Rollback Thinking

Native-target evidence is optional derived metadata and requires no database
migration. Distribution still writes to target-owned package directories using
the existing copy/symlink and cleanup paths. Reverting restores first-marker
classification and Codex-only passthrough; installed My Plugins records remain
readable.

## Related Records

- Issue: https://github.com/legeling/PromptHub/issues/190
- Original feature: `spec/changes/active/plugin-management/`
- Stable behavior:
  `spec/knowledge/behavior/plugins.md`,
  `spec/knowledge/reference/plugin-agent-adapter-matrix.md`
- Governing rules:
  `spec/rules/testing-standards.md`

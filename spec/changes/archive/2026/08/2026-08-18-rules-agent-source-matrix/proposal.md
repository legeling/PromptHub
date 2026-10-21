# Agent Rules Source Matrix Proposal

## Phase And Status

- Phase: analyze
- Status: implementation in progress for verified global entry files
- Primary requirement: `FR-RULESRC-001`
- Related issues: #196, #197; related reconciliation change #193
- Exit condition: supported user/project Rules sources are evidence-backed,
  allowlisted, distinguishable, and safely reconciled across platforms.

## Why

The stable Rules workspace currently models one canonical file per platform or
registered project. Modern Agents also consume multi-file directories and
platform-specific extensions. Guessing every directory named `rules` would
import ordinary documentation, while preserving the single-file model cannot
represent confirmed sources such as Claude's `.claude/rules`.

## Scope

- Verified source matrix for Claude, Cursor, Windsurf, Cline, Roo, Kilo,
  GitHub Copilot, and Codex.
- Immediate global-entry support for Kiro, Augment, and Cline, using only paths
  currently documented by those products. This does not collapse their richer
  directory rule systems into one complete file.
- User/project scope, multi-file directories, single-file entries, precedence,
  recursive policy, format, and platform version evidence.
- Bounded scanning, source identity, preview/edit/version behavior, conflicts,
  and deletion reconciliation.
- No heuristic scan of arbitrary `rule` or `rules` directory names.

## Risks And Rollback

- Agent behavior can change by version. Unsupported or unverified rows remain
  documented but disabled.
- PromptHub-managed copies remain canonical; external paths are source/target
  projections with explicit status.
- Disabling a matrix row stops future scans but does not delete managed Rules or
  external files.

## Related Records

- `spec/knowledge/behavior/rules-workspace.md`
- `spec/knowledge/reference/agent-platforms.md`
- `spec/changes/completed/rules-issue-193-missing-project-reconciliation/`

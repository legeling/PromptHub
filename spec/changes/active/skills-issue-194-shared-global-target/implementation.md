# Implementation

## Product

Shared

## Status

blocked. Experimental shared-target compatibility and ownership acceptance remain gated by tasks.md.

## Shipped

- Added `agent-skills-global` as a Skill-only target without changing
  `SKILL_PLATFORMS` or Agent detection/counts.
- Core copy/symlink lifecycle resolves `~/.agents/skills/<name>`, uses atomic
  stage/backup publication and ownership receipts, detects modified/unmanaged
  states, and refuses unsafe uninstall.
- Desktop and CLI install/status/uninstall flows use the same lifecycle.
  Shared distribution is opt-in, excluded from batch defaults, and warns when
  selected with known duplicate-discovery platform targets.
- Review fixed a recursive-copy risk when an override symlink resolved inside
  the source, ensured failed staging is removed, and kept a committed target
  plus receipt consistent when obsolete-backup cleanup fails.

## Verification

- Shared registry/normalizer suite: 24 tests passed with 100% coverage for the
  new target projection.
- Core shared lifecycle: 5 tests passed, including copy, symlink, modification,
  unmanaged conflict, source/target containment, and symlinked-root escape.
- CLI Skill: 14 tests passed.
- Desktop platform/batch/focused run: included in 129 passing tests.
- Shared/Core/CLI/Desktop typechecks and targeted Desktop ESLint: passed.
- Official documentation evidence remains distinct from runtime verification.

## Analyze

- Traceability complete: yes, for all current requirements.
- Conflicts/blockers resolved: the shared directory is a Skill distribution
  target, not an Agent platform.
- Research gate: only evidence-backed Agent/OS/version/mode combinations may
  move from `documented` or `unverified` to `verified`.

## Converge

- Stable Skill behavior and compatibility reference synced: yes.
- Local issue remains `in_progress` until the OS/Agent runtime evidence matrix
  and release assignment are complete.
- Final change destination: active pending compatibility convergence.

## Synced Docs

- `spec/knowledge/behavior/skills.md`
- `spec/knowledge/reference/shared-agent-skills-compatibility.md`
- `spec/knowledge/reference/agent-platforms.md`

## Follow-ups

- Platform-specific native directories remain supported even when a platform
  also verifies the shared directory; precedence and duplicate behavior must
  remain visible.
- Windows/Linux runtime fixtures, exact physical-target collapse, and failure
  injection remain open compatibility gates. The shipped surface is therefore
  labeled experimental and never selected by default.

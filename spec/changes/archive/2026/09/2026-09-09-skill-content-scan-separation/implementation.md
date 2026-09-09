# Implementation

## Status

Completed locally on 2026-09-09; publication pending.

Accepted boundary: standalone, disabled-by-default, explicitly invoked content-only
static/AI assessment. Business workflows and source/channel trust are out of scope
for the scanner. Existing transport/filesystem/data-integrity protections remain.

## Changes

- Desktop installation/update staging, renderer operations, Web operations and CLI
  copy/import/snapshot/distribution no longer scan content or consume content verdicts.
  Legacy operation scan/approval fields are inert compatibility inputs. Installation
  and update preview dialogs no longer display safety status or disable actions based
  on a report; data-diff and overwrite confirmation remain unchanged.
- The standalone setting defaults off. Explicit enablement permits manual static or
  AI scanning; opening a page, enabling the option or performing business operations
  never triggers scanning. Legacy automatic/channel/trust settings are normalized off.
- One shared static content scanner ignores source/channel metadata, preserves
  credential-value redaction and treats findings as advisory. AI prompts omit source
  reputation; configuration/provider/parse failures remain explicit, without a fake
  static fallback. CLI manual scanning accurately reports the static method.
- Package representation limits, filesystem/archive containment, atomic writes,
  rollback and transport protection remain separate. Scan-only inventory limits no
  longer truncate or reject otherwise representable business packages.
- Existing UI controls and progressive disclosure are reused; seven locale files
  describe the standalone opt-in workflow. No new UI framework was introduced.

## Verification

- Focused desktop lifecycle, remote Git/Zip, local repository, manual scanner,
  settings, store/detail and install/update regression groups passed after old
  mandatory-scan expectations were replaced with the accepted boundary.
- Final business-dialog cleanup: 3 test files / 27 tests passed, including explicit
  legacy-blocked-report install/update cases. Desktop type checking and the four
  changed dialog/controller lint checks passed after this cleanup.
- Shared content rules (8 tests), desktop main scanner (14 plus 4 separation tests),
  renderer scan dispatch (3 tests) and standalone settings UI (5 tests) each reached
  100% statement, line, function and branch coverage. This is not whole-legacy-file
  coverage for the broader business modules; untouched legacy branch coverage is not
  asserted. The focused content fixture scans 150 files of 2,000 lines under 5 seconds.
- Desktop, shared, core, CLI and Web type checks passed; scoped desktop source lint,
  CLI/Web lint, file-size checks, change traceability and diff whitespace checks passed.
- Final scoped quick harness: shared 48, core 692, CLI 124 and Web 417 tests passed.
  CI-configuration governance and file-size governance passed. The overall harness
  failed only at existing specification governance: the dirty worktree lacks
  `.agents/skills/spec-init/tests/spec-init-commit-rules.sh`. That unrelated removal
  was not repaired or bypassed.

## Delivery boundaries

Reproducible focused commands (run from `apps/desktop`):

```sh
pnpm exec vitest run tests/unit/components/skill-business-review-separation.test.tsx tests/unit/components/skill-store-remote-catalog-actions.test.tsx tests/unit/components/skill-store-detail-timers.test.tsx --maxWorkers=2 --minWorkers=1
pnpm exec tsc --noEmit
pnpm exec eslint src/renderer/components/skill/SkillStoreInstallReviewDialog.tsx src/renderer/components/skill/SkillStoreUpdateReviewDialog.tsx src/renderer/components/skill/SkillStoreDetailOverlays.tsx src/renderer/components/skill/SkillStoreDetail.tsx --max-warnings 0
```

All three commands passed after the final source edits. Repository-root archive
traceability and staged whitespace checks are also required at submission.

Stable Skill behavior, store requirements and regression matrix are synchronized.
No live GUI/E2E, real AI provider, production packaging or cross-platform acceptance
was performed. No live user profile or service was changed; temporary tests used
disposable fixtures. Other dirty changes remain owned by their existing tasks.
The scoped commit includes this change only. No push, release or GitHub issue
closure is included.

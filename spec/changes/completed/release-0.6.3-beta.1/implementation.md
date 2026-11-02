# 0.6.3-beta.1 implementation and verification

## Product

Delivery

## Status

completed

## Changes

- Preserve unrecognized Skill directory trees before the released converter.
- Publish migration recovery sources inside the workspace restore data swap.
- Include the reviewed browser Cloud sign-in source and seven locale changes.
- Accept semver prerelease candidates in version alignment and installer acceptance.
- Preserve the stable website/download identity at 0.6.2.

## Evidence

Earlier focused baseline: 120 cases passed. The subsequent white-box review added
two passing recovery fault cases (15 cases in skill-directory-recovery.test.ts).
Workspace restore regression found the undeclared recovery-root gap; the fix is
implemented. Its initial two new assertions incorrectly expected empty directories
that the file-only snapshot format does not encode; the regression now verifies
all actual manifest files, original source, existing recovery, rollback and reopen.
Workspace snapshot recheck passed all 11 cases; Cloud/release/updater targeted
checks passed 37 cases. Root ESLint explicitly includes Core files and passed.
Quick diagnostics passed governance/static/mobile checks; the remaining run was
cancelled to finalize release copy and installed Skill verification before the
full gate. It is not recorded as a passing full quick run.
Cloud API readback: desktop start without parameters returns 422 (route present),
and anonymous store feed returns 200. Existing Cloud UI build gating stays intact.
The native callback receipt now uses localized JSON for all seven languages.
Full release verification passed all 40 checks on 2026-11-02 (1807.2 seconds,
concurrency 2), including actual desktop smoke, integration, unit shards and all
product build/type/test gates. Command: pnpm verify:release --concurrency 2.
Website release metadata tests and production build passed. Platform packaging
and installed Windows acceptance passed. Release run 41384990876 passed all
40 CI checks and five platform builds; macOS signatures/notarization and update
manifest hashes passed. Windows packaged smoke and five E2E cases passed;
installed acceptance 41385913357 passed Skill recovery and three uninstall/reinstall
cases. Published 2026-11-02 with 20 assets; stable latest remains v0.6.2.
Self-hosted run 41386335486 passed verification, versioned GHCR publication and
image archive export. Public Windows x64 installer returns HTTP 200. No local
task processes remain; isolated test profiles were removed and existing user
application/data were untouched.

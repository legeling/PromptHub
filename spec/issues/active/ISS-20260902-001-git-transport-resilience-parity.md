# ISS-20260902-001 Git Transport Resilience Parity

Status: open

## Context

The Skill issue #211 audit found other PromptHub surfaces that invoke an
ambient Git executable. The Skill Desktop package adapter now owns a bounded
HTTPS archive fallback and actionable error reasons, but this behavior cannot
be copied into other domains without checking their package contracts.

Related change:
`spec/changes/active/skills-issue-211-git-http-fallback/`.

## Findings

### Plugin HTTPS Git import

`packages/core/src/plugin-library/package-materialization.ts` clones HTTPS and
SSH Plugin sources through the ambient Git executable. Renderer error handling
already distinguishes Git failure and tells the user to check Git, so the
immediate misleading-copy defect does not apply. Public HTTPS Plugin packages
still have no archive fallback.

Before implementing parity, a Plugin change must preserve manifest discovery,
multi-asset inventory, package path selection, semantic classification,
activation, rollback and source identity. It should reuse a core-owned bounded
archive transport rather than import Desktop Skill code.

### Desktop source-check notification correction (2026-10-14)

Installed detail previously started a source check on mount. Marketplace package
fingerprinting materializes the remote repository, so opening or remounting a
detail could trigger a clone, then show a timeout on Settings after navigation.
Detail now uses the explicit Check updates action, one active request, and
request ownership tied to the current Plugin detail. A late result cannot show
a notification/review elsewhere; failed refresh does not reuse cached update
status. The existing localized network error formatter also recognizes the IPC
Git clone timeout. This does not add archive fallback or change Git's timeout.

An isolated clone of `https://github.com/openai/plugins` using the production
depth/filter/sparse arguments completed in 5,978 ms on this host; the screenshot's
30-second transport failure was not reproduced. This is a current network
observation, not proof of the reporter's proxy configuration or all-network
availability. The probe repository and process were removed after completion.

Validation: 34 Desktop component/error cases pass across
`tests/unit/components/shortcuts-settings.test.tsx`,
`tests/unit/components/plugin-manager-detail.test.tsx` and
`tests/unit/components/plugin-install-error.test.ts`. Run from the repository:

```sh
pnpm --filter @prompthub/desktop exec vitest run --project unit tests/unit/components/shortcuts-settings.test.tsx tests/unit/components/plugin-manager-detail.test.tsx tests/unit/components/plugin-install-error.test.ts
```

Four detail regressions cover opening under StrictMode without a source call,
one pending manual check with a retry after localized failure, late failure
after Back, and rejecting cached update review after a failed current check.
The real renderer/store runs with source-check/update IPC methods replaced by
controlled responses; these tests do not prove live Core transport or Electron
GUI. A temporary Vitest workspace overlays only the original HEAD detail
controller at transform time: the no-automatic-check case fails with exit 1
because automatic checking replaces Check updates before user input. Shared
source files are never reverted. The temporary runner/workspace is removed.

Desktop source and test typechecks, six touched-file ESLint checks, and Desktop
production build pass. The pre-existing detail suite emits React act warnings;
no warnings were suppressed. Shortcut styling follows existing tokens and
shared controls; the long existing ShortcutItem/controller functions retain
their established component boundaries instead of extracting unrelated flows.
GUI/layout acceptance is not performed in this request because GUI control
requires explicit authorization under AGENTS GUI-1. No user profile, proxy
configuration, Git timeout, commit or remote repository state is changed.

### CLI Skill Git install

The standalone CLI Git source path also requires the ambient Git executable.
CLI users may reasonably be expected to have Git, but the prerequisite and
missing-command error contract are not currently governed by the Desktop
fallback. A future CLI decision should either document/check the prerequisite
or adopt an app-independent archive fallback with equivalent package tests.

### Explicit Git operations

Git backup, push, branch/ref management and SSH-authenticated private sources
cannot be replaced by a source archive because they require repository history,
credentials or write capability. These operations need precise Git
availability diagnostics, not archive fallback.

## Exit Criteria

- Decide separately for Plugin and CLI whether public HTTPS sources require
  archive fallback or an explicit Git prerequisite.
- If fallback is selected, define the package-domain safety, source identity,
  capacity and rollback contract before implementation.
- Keep history/write/SSH operations Git-only and verify actionable missing-Git
  diagnostics.

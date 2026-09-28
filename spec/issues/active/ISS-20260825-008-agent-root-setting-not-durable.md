# Agent Root Setting Is Not Read Back From Durable Authority

## Record

- ID: `ISS-20260825-008`
- Status: confirmed
- Severity: high settings data-loss risk
- Owning change: `spec/changes/active/desktop-settings-authority-convergence/`
- Affected flow: `E2E-AGENT-002`
- First local triage: 2026-08-25
- Automated evidence:
  `apps/desktop/tests/e2e/agent-settings-dialog.spec.ts`

## Confirmed Phenomenon

In a canonical-authority Electron profile, saving a valid replacement root for
Claude Code immediately updates the Agent header. A subsequent
`window.api.settings.get()` call does not contain
`builtinAgentOverrides.claude.rootPath`. The UI therefore reports success from
renderer memory without proving that the next startup will receive the same
setting.

Canceling the same dialog leaves the prior root unchanged and performs no
durable mutation.

## Root Cause

The current settings write path stores `builtinAgentOverrides` in the SQLite
`settings` compatibility table. The settings read path then merges the
canonical renderer settings object over the SQLite result. Once renderer
migration is complete, an empty canonical `builtinAgentOverrides` field masks
the newly written SQLite value.

This is the authority split already targeted by
`desktop-settings-authority-convergence`: explicit Agent device paths belong in
`config/devices/agents.json`; SQLite and renderer state must not independently
decide the committed value.

## Related Code

- `apps/desktop/src/main/ipc/settings.ipc.ts`: `SETTINGS_GET` and
  `SETTINGS_SET` merge/write different stores.
- `apps/desktop/src/renderer/stores/settings/settings-agent-actions.ts`:
  `writeBuiltinOverrides` updates renderer state and starts an asynchronous
  main-process compatibility write.
- `apps/desktop/src/renderer/components/agent/AgentSettingsDialog.tsx`: closes
  immediately after the renderer action without awaiting committed settings.
- `spec/changes/active/desktop-settings-authority-convergence/design.md`:
  accepted canonical ownership and atomic patch contract.

## Required Resolution

Route Agent root patches through the accepted typed main/Core configuration
repository for `config/devices/agents.json`. The renderer must replace its
projection only after the main process validates, atomically publishes, and
re-reads the committed snapshot. A rejected publication must keep the dialog
open and restore the prior visible root.

Do not add another SQLite/canonical dual-write special case; that would conflict
with the accepted settings-authority change.

## Required Verification

2026-09-28 regression audit: the reproduction remains in
`apps/desktop/tests/e2e/agent-settings-dialog.spec.ts`, named
`saves the Agent root and persists selection and pinning across restart`.
From the repository root, after building and with GUI authorization, run
`pnpm --filter @prompthub/desktop exec playwright test tests/e2e/agent-settings-dialog.spec.ts`.
It is not part of the narrow default E2E smoke selection. This audit did not run
the GUI or confirm a fix; keep this issue open. The diagnosis/design above is
historical: current storage ownership follows the foundation redesign's SQLite
and filesystem contract, not a new parallel settings authority.

- Save, read back, restart twice, clear renderer storage, and rebuild SQLite;
  the exact Agent root remains unchanged.
- Cancel and failed publication leave all durable stores and visible state
  unchanged.
- Pin and selected-Agent state are classified separately as durable preference
  or transient UI state before their persistence assertions are finalized.

# Design

## Call Chain

`AboutSettings toggle -> confirmation dialog -> settings store updateChannel -> App / UpdateDialog pass channel -> main updater applies prerelease channel`

## Affected Modules

- `apps/desktop/src/renderer/components/settings/AboutSettings.tsx`
- `apps/desktop/src/renderer/stores/settings.store.ts`
- `apps/desktop/src/renderer/i18n/locales/*.json`
- desktop update-related tests

## Data / IPC / Migration Impact

- Data model: no new persisted type required beyond existing `updateChannel`
- IPC channels: reuse existing updater IPC with `channel: "stable" | "preview"`
- Migrations: none

## Technical Approach

- Keep `updateChannel` as the single behavioral switch for update checks.
- Replace the direct preview toggle with a guarded flow:
  - user enables preview
  - confirmation dialog explains instability risk and recommends manual backup
  - user must explicitly confirm before `updateChannel` becomes `preview`
- Switching back to stable remains simple and immediate.
- Preserve current runtime behavior where updater receives `channel` from renderer, but make the UX harder to enable accidentally.

## Alternatives Considered

- Add a second boolean like `previewUpdatesEnabled`.
  - Rejected because existing `updateChannel` already models the behavior correctly.
- Show only an inline warning without confirmation.
  - Rejected because the user explicitly wants consent and risk acknowledgement.

## Risks And Mitigations

- Users might ignore the warning text:
  - Mitigation: put the warning in a blocking confirm dialog, not only inline copy.

## Verification Plan

- Unit/component tests for the settings interaction
- Unit tests for update dialog / updater channel behavior where relevant
- Lint and targeted test runs

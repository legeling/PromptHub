# Implementation

## Product

Desktop

## Status

review-pending. Packaged Windows acceptance remains open.

## Reported Evidence

- The Windows close dialog shows **Remember my choice**, but a later launch asks
  again.
- Current code applies the remembered action to renderer/main memory and sends
  the close result immediately.
- Canonical renderer persistence is asynchronous and not awaited by the dialog;
  `SETTINGS_SET` did not publish `closeAction` to canonical settings.

## Root Cause

The shared Checkbox cancelled the native label/input click while rendering its
input read-only. In a controlled dialog the callback ran, but the visible input
could remain unchecked.

The durable source after renderer migration is canonical `config/app.json`,
while SQLite remains a compatibility projection. The dialog depended on a
background Zustand subscription to publish canonical settings and could exit
the application before that publication completed. The explicit settings
setter also omitted the main settings persistence call, so no awaited durable
boundary existed.

## Implemented

- The shared Checkbox now uses the native input change event and has a controlled
  visual-state regression, while preserving disabled and single-callback
  behavior.
- Added an awaited `persistCloseAction()` settings action. It updates renderer
  and main memory, waits for main settings persistence, and restores the prior
  action if the write rejects.
- Main-process settings hydration now reapplies the normalized canonical close
  action after restart instead of leaving main memory at the pre-hydration
  default `ask` value.
- `SETTINGS_SET` now validates a present close action at the main-process trust
  boundary using the shared `Settings.closeAction` contract. After renderer
  migration it atomically merges the action into canonical settings before
  writing the SQLite compatibility row, and restores the previous canonical
  settings if that compatibility transaction fails.
- The close dialog visibly toggles remember state, disables close/action inputs
  during the bounded write, sends the close result only after success, and keeps
  the dialog open with localized error copy on failure.
- Seven desktop locales and the stable desktop behavior contract now describe
  the failure-visible remembered-close boundary.

## Verification

- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/checkbox.test.tsx tests/unit/components/close-dialog.test.tsx tests/unit/main/settings-renderer-persistence-ipc.test.ts tests/unit/stores/settings-close-action.test.ts`
  passed 35 tests across four files.
- Locale JSON parsing, repository traceability, and diff whitespace checks
  passed for the combined desktop batch.
- Packaged Windows close/relaunch acceptance was not run in this batch.

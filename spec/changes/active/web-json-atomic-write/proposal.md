# Proposal

## Why

Web runtime JSON state files such as `config/devices/<userId>.json` are written
with direct `writeFileSync` replacement. If the write is interrupted after the
target is truncated, the previous durable state can be lost and future reads
fall back to empty/default state.

## Scope

- In scope:
  - Add an atomic JSON file write helper for small Web runtime JSON files.
  - Use it for the device registry.
  - Add a regression proving an interrupted device registry write preserves the
    previous file content.
- Out of scope:
  - Reworking all workspace file writers in this change.
  - Cross-filesystem staging directories.
  - SQLite transaction behavior.

## Risks

- Atomic writes add a temporary sibling file and `renameSync` operation per
  registry write.
- Failed writes may leave a best-effort cleaned temporary file if the process
  terminates abruptly.

## Rollback Thinking

Rollback restores direct `writeFileSync` for device registries and removes the
helper/test. No data migration is needed.

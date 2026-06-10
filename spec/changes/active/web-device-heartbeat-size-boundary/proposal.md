# Proposal

## Why

`POST /api/devices/heartbeat` stores client supplied device metadata in a
per-user JSON file. Required fields were non-empty but unbounded, so a client
could send very large `userAgent`, name, platform, or version strings and bloat
the device record file.

## Scope

- In scope:
  - Add route-level maximum lengths for heartbeat metadata.
  - Reject oversized heartbeat payloads with `422 VALIDATION_ERROR`.
  - Add a regression proving rejected oversized payloads do not write device
    records.
- Out of scope:
  - Changing the device file storage format.
  - Adding device deletion or server-side device management.
  - Changing desktop device heartbeat semantics beyond accepted field sizes.

## Risks

- Extremely long client names or user-agent strings are rejected. The limits are
  above normal browser and desktop heartbeat display needs.

## Rollback Thinking

Rollback is limited to removing route schema limits and the regression test. No
stored data migration is introduced.

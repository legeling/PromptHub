# Design

## Overview

Keep device heartbeat storage as a small per-user JSON file, and enforce bounded
metadata at the Web route boundary before persistence. Device ids are limited to
128 characters, display labels and versions to 120 characters, and `userAgent`
to 512 characters.

## Affected Areas

- Data model:
  - No schema or file format change.
- IPC / API:
  - `POST /api/devices/heartbeat` now rejects oversized metadata with `422`.
- Filesystem / sync:
  - Rejected heartbeat payloads do not create `config/devices` records.
- UI / UX:
  - Normal desktop/browser device labels continue to fit within the accepted
    limits.

## Tradeoffs

- The route rejects rather than truncates. This avoids silently storing a value
  different from the caller's payload and keeps oversized clients visible during
  testing.

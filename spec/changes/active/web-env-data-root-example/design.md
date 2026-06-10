# Design

## Overview

Keep `DATA_ROOT` as the single Web runtime source of truth and update the
tracked example environment file to match the existing config parser.

## Affected Areas

- Data model: none.
- IPC / API: none.
- Filesystem / sync: no layout change; this fixes deployment documentation for
  the existing `DATA_ROOT` layout.
- UI / UX: no runtime UI change.

## Tradeoffs

- Not adding `DATA_DIR` as an alias keeps the configuration surface small and
  avoids two names for the same durable path boundary.

# Design

## Overview

Write small JSON files to a temporary sibling path first, then rename the temp
file over the target. The temporary file lives in the target directory so the
rename stays within one filesystem.

## Affected Areas

- Data model: none.
- IPC / API: none.
- Filesystem / sync: device registry writes become temp-write + rename instead
  of direct target overwrite.
- UI / UX: device lists keep the previous durable state if a heartbeat write is
  interrupted.

## Tradeoffs

- This protects against partial target writes but does not guarantee fsync-level
  durability across sudden power loss.
- The helper is intentionally local to `apps/web` for now; broader workspace
  writer adoption should be handled with separate risk-specific tests.

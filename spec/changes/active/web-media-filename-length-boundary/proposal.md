# Proposal

## Why

Web media read/delete endpoints accepted arbitrarily long `:filename` route
parameters after path traversal and control-character checks. Those names could
fall through to filesystem reads and produce storage-adapter-specific behavior,
such as a 404 for a path segment that should never be treated as a valid media
file name.

PromptHub should reject oversized media file names at the Web API boundary with
the same deterministic bad-request model used for traversal and null-byte
attempts.

## Scope

- In scope:
  - Add a UTF-8 byte-length limit to web media file-name normalization.
  - Return `400 BAD_REQUEST` for oversized media file names on read-style
    routes.
  - Add focused service and route regression coverage.
- Out of scope:
  - Changing generated media UUID names.
  - Changing media storage directories or import/export media payloads.
  - Changing desktop media behavior.

## Risks

- Extremely long existing media files on disk become unreachable through the web
  media API. PromptHub-generated names are UUID-based and remain well below the
  limit.
- The limit must be byte-based rather than character-based so CJK, emoji, and
  other multibyte names are bounded consistently with filesystem segment limits.

## Rollback Thinking

Rollback is limited to removing the byte-length guard and its regressions. No
schema, migration, or media file layout change is introduced.

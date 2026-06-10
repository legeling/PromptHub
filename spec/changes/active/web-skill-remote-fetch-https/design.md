# Design

## Overview

Add an explicit HTTPS preflight for remote Skill URLs at both the route schema
and `SkillService.fetchRemote` boundary. The route catches invalid URLs as a
`422 VALIDATION_ERROR`; the service keeps the invariant for direct callers and
future tests that bypass route parsing.

## Affected Areas

- Data model: no schema change.
- API: `POST /api/skills/fetch-remote` rejects non-HTTPS URLs with
  `VALIDATION_ERROR`.
- Filesystem / sync: failed validation happens before Skill DB writes or
  workspace sync.
- UI / UX: callers get a clear validation message instead of a successful import
  from cleartext HTTP or a lower-level transport error.

## Rules

- Remote Skill fetch URLs must use `https:`.
- The check must run before `requestRemoteBuffered`.
- Import-to-library must not create a Skill when the URL is non-HTTPS.

## Tradeoffs

- Duplicating the check in route and service is intentional: the route gives
  early request feedback, while the service remains the business-rule boundary.

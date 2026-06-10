# Design

## Overview

Harden `GET /api/prompts` at the route schema boundary. Zod enforces string
length limits for raw query fields, and a small `parseTagQuery()` helper splits
and validates the comma-separated tag filter count before calling
`PromptService.list()`.

## Affected Areas

- Data model:
  - No persistence impact.
- API / contracts:
  - Oversized prompt list query filters return `422 VALIDATION_ERROR`.
  - Query validation messages now include field paths.
- Filesystem / sync:
  - No impact.
- UI / UX:
  - Invalid oversized filters fail early with clearer messages.

## Limits

- `keyword`: 500 characters.
- `tags`: 2000 characters before splitting for the legacy comma-separated query.
- `tag`: repeated literal tag query values, each bounded to the prompt tag length.
- tag entries: 50 non-empty comma-separated values.
- `folderId`: 200 characters.

## Compatibility

The existing `tags=alpha,beta` query format remains supported for callers that
already send comma-separated filters. New Web client code should use repeated
`tag=...` parameters so literal tags containing commas do not get split.

## Tradeoffs

This does not remove the in-memory prompt filtering cost for valid queries; it
only prevents unusually large filter inputs from amplifying that cost.

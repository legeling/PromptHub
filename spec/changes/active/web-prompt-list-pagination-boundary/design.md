# Design

## Overview

Update `PromptService.list()` to return both paged items and the filtered total.
The route keeps the same `paginated()` response shape, but fills
`pagination.total` from the filtered count before slicing.

## Affected Areas

- Data model:
  - No persistence impact.
- API / contracts:
  - `GET /api/prompts` now reports `pagination.total` as all matching prompts,
    not only returned prompts.
- Filesystem / sync:
  - No impact.
- UI / UX:
  - Prompt list pagination controls can correctly determine whether additional
    pages exist.

## Tradeoffs

This keeps the existing in-memory filter/sort path and fixes the response
contract first. Moving filtering and pagination into SQL remains a possible
future performance optimization.

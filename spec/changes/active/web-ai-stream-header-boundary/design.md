# Design

## Overview

Add focused stream response and upstream URL guards in `apps/web/src/routes/ai.ts`.
The route still sets PromptHub-owned stream headers explicitly and then copies
only upstream headers outside the denylist. Both buffered and streaming AI proxy
requests require HTTPS upstream URLs before reaching the shared remote transport.
The route also bounds declared request envelope size and parsed proxy fields
before passing data into the remote transport.

## Affected Areas

- Data model:
  - No data model impact.
- IPC / API:
  - `POST /api/ai/stream` no longer forwards upstream `set-cookie` or
    hop-by-hop headers.
  - `POST /api/ai/request` and `POST /api/ai/stream` reject non-HTTPS upstream
    URLs with validation errors.
  - Both AI proxy routes reject oversized declared request envelopes before
    parsing JSON and reject oversized `requestId`, URL, header, and body fields
    with validation errors.
- Filesystem / sync:
  - No filesystem or sync impact.
- UI / UX:
  - Streaming content remains unchanged. Browser-visible transport headers are
    safer and more predictable.

## Tradeoffs

- The denylist approach keeps existing custom provider headers compatible while
  blocking headers that should be controlled by PromptHub or the HTTP transport
  layer.
- The HTTPS-only URL check duplicates the transport allowlist intentionally so
  callers receive a route-level validation error before the remote helper can
  attempt DNS or network work.
- The route-level size guards are intentionally smaller than arbitrary upstream
  provider capabilities. PromptHub's Web proxy should not accept unbounded JSON
  envelopes or header maps before applying its own transport constraints.

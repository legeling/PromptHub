# Design

## `DES-AI-TIMEOUT-001`: Shared five-minute deadline

Define `AI_REQUEST_TIMEOUT_MS = 300_000` in `@prompthub/shared/constants/ai`. Import it at every AI HTTP deadline site and remove local timeout constants. The main-process transport continues accepting an explicit `timeoutMs` for contract compatibility, but all product-owned callers and its fallback use the shared value. Keep each timer active until the full response body or stream has been consumed so a stalled body cannot become unbounded after response headers arrive.

## Affected Areas

- Data model: none
- IPC / API: no shape change; optional `timeoutMs` remains supported
- Filesystem / sync: none
- UI / UX: slow AI operations wait longer before surfacing their existing timeout error

## Tradeoffs

- One request may retain its bounded response state for five minutes. Request count, serialization complexity, and network I/O remain unchanged; the browser fallback buffers the same non-streaming body already buffered by the Electron IPC path, while streaming remains incremental. No retries are added.

## Analyze Result

- Requirement links: `FR-AI-TIMEOUT-001`
- Verification links: `TEST-AI-TIMEOUT-001`, `TEST-AI-TIMEOUT-002`, `TEST-AI-TIMEOUT-003`
- Blocking conflicts: none; the user explicitly replaces the prior translation-only timeout decision
- Unresolved `[待确认]`: none

## Traceability

| Requirement         | Design               | Verification                                                        | Task               |
| ------------------- | -------------------- | ------------------------------------------------------------------- | ------------------ |
| `FR-AI-TIMEOUT-001` | `DES-AI-TIMEOUT-001` | `TEST-AI-TIMEOUT-001`, `TEST-AI-TIMEOUT-002`, `TEST-AI-TIMEOUT-003` | `T-AI-TIMEOUT-001` |

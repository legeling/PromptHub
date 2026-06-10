# Proposal

## Why

`POST /api/import` accepts JSON, ZIP, octet-stream, and multipart uploads. The
route read request bodies with `json()`, `arrayBuffer()`, or `formData()` before
checking the declared size, which let oversized import requests consume memory
before normal snapshot validation could run.

## Scope

- In scope:
  - Reject import requests whose `Content-Length` exceeds the Web import limit.
  - Reject invalid negative or non-numeric `Content-Length` values.
  - Add a route regression proving oversized declared bodies are rejected before
    parsing/importing payloads.
- Out of scope:
  - Streaming ZIP parsing.
  - Enforcing unknown-length chunked request limits after bytes are received.
  - Changing sync pull/push payload size limits.

## Risks

Legitimate imports over the limit now fail early and need to be split or
handled outside the Web route. The limit is intentionally above the existing
single-media payload limit and protects the aggregate import envelope.

## Rollback Thinking

Rollback is limited to removing the `Content-Length` precheck and regression
test. No persisted data or migration is involved.

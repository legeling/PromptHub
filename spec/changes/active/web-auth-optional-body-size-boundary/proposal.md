# Proposal

## Why

The Web auth refresh and logout endpoints accept an optional JSON body, but the parser reads the entire request body with `text()` before validation. These endpoints only need a small refresh token payload or an empty cookie-backed body, so declared oversized requests should be rejected before body parsing.

## Scope

- In scope:
  - Add a `Content-Length` precheck to optional auth request body parsing.
  - Enforce the same limit while reading streamed auth request bodies that do
    not declare `Content-Length`.
  - Cover `/api/auth/refresh` with a regression that proves oversized declared bodies are rejected before token rotation.
  - Document the API boundary.
- Out of scope:
  - Changing global JSON parsing for every route.
  - Changing token format, cookie behavior, or rate-limit policy.

## Risks

- Legitimate refresh/logout JSON payloads above the new limit will now fail. The selected limit is far above expected token payload size.

## Rollback Thinking

Rollback removes the optional auth body `Content-Length` precheck and regression test. No schema, storage, or token migration is involved.

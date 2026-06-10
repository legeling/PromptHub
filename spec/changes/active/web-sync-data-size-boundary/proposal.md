# Proposal

## Why

`PUT /api/sync/data` imports a full sync snapshot and can carry media payloads. Unlike `/api/import`, it currently starts JSON body parsing before checking the declared request size. A client that declares an oversized body should be rejected before parsing or durable import work begins.

## Scope

- In scope:
  - Add a `Content-Length` precheck to direct sync data imports.
  - Reject invalid declared `Content-Length` values.
  - Add a route regression proving an oversized declared sync import is rejected and existing data remains intact.
- Out of scope:
  - Enforcing unknown-length streamed body limits.
  - Changing WebDAV pull/push response-size limits.
  - Changing sync snapshot schema or import semantics.

## Risks

- Legitimate direct sync imports over the limit now fail early and must use a smaller snapshot or a future chunked/lower-level transfer path.

## Rollback Thinking

Rollback removes the route-local precheck and regression. No schema migration or data cleanup is required.

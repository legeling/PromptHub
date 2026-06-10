# Proposal

## Why

Web remote Skill fetching imports content from a user-supplied URL. The service
transport is configured for HTTPS-only requests, but the route schema and
service boundary still accept `http://` URLs. Tests or future callers that mock
the transport can bypass the HTTPS expectation and import cleartext remote
content.

## Scope

- In scope:
  - Reject non-HTTPS URLs for `POST /api/skills/fetch-remote` before remote
    content is fetched or imported.
  - Keep the same validation error contract used for other remote fetch
    validation failures.
  - Add a route regression proving `http://` URLs are rejected.
- Out of scope:
  - Changing the remote HTTP SSRF implementation.
  - Supporting private/internal network Skill sources.
  - Desktop Skill store remote fetching.

## Risks

- Users with existing HTTP-only Skill URLs must switch to HTTPS. This matches
  the existing transport policy and avoids cleartext remote imports.

## Rollback Thinking

Rollback is limited to removing the HTTPS preflight and regression. No schema or
stored data migration is introduced.

# Design

## Overview

Add a small request-size guard inside `parseOptionalAuthBody()`. The helper checks a declared `Content-Length` before calling `c.req.text()`, rejects invalid lengths, and rejects bodies over 1 MiB with `400 BAD_REQUEST`.

## Affected Areas

- Data model: no schema or persistence impact.
- API / contracts: `/api/auth/refresh` and `/api/auth/logout` reject invalid or oversized declared `Content-Length` values before optional body parsing.
- Filesystem / sync: no impact.
- UI / UX: normal JSON-token and cookie-backed refresh/logout flows remain unchanged.

## Tradeoffs

- Route-local validation avoids changing every JSON endpoint at once.
- The precheck only covers declared `Content-Length`; streaming/chunked enforcement remains a server-level concern.

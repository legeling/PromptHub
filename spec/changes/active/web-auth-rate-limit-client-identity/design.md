# Design

## Overview

Auth rate limits will no longer trust `x-forwarded-for` or `x-real-ip` by
default. `getClientIdentifier()` will return a stable fallback identity unless
`TRUST_PROXY_HEADERS=true` is configured. When proxy headers are trusted, the
service will use the first `x-forwarded-for` hop and then `x-real-ip`.

## Affected Areas

- Data model: none.
- IPC / API: no route payload changes. Adds `TRUST_PROXY_HEADERS` process
  configuration for self-hosted Web deployments.
- Filesystem / sync: none.
- UI / UX: none.

## Tradeoffs

- Defaulting to the fallback bucket is safer for direct internet exposure and
  misconfigured proxies, but it is coarse behind a legitimate proxy until the
  deployment opts in.
- A boolean trust switch is intentionally small. CIDR-aware trusted proxy
  matching can be added later if deployments need finer-grained behavior.

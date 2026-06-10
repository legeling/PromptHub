# Proposal

## Why

Web authentication rate limits currently derive the client identity directly
from caller-supplied `x-forwarded-for` / `x-real-ip` headers. In deployments
where the edge proxy does not strip or rewrite these headers, a client can vary
the header value to bypass login, register, or refresh rate limits.

## Scope

- In scope:
  - Default auth rate-limit client identity to a non-spoofable fallback when
    trusted proxy headers are not explicitly enabled.
  - Add an environment switch for deployments that intentionally trust proxy IP
    headers after sanitizing them at the edge.
  - Add route regressions covering spoofed headers and trusted proxy behavior.
- Out of scope:
  - Distributed or persistent rate limiting.
  - Changing captcha, token, password, or cookie behavior.
  - Adding proxy allowlists or CIDR matching.

## Risks

- Self-hosted deployments behind a proxy that relied on unsanitized forwarded
  headers will now share a fallback bucket until they opt in with the new
  trusted-proxy setting.
- The fallback identity is coarse in test/serverless contexts that do not expose
  a socket address through Hono.

## Rollback Thinking

Rollback removes the trusted-proxy setting and restores direct use of forwarded
IP headers. No schema, token, or storage migration is involved.

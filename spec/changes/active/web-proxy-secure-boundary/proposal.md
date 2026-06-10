# Web Proxy Secure Request Boundary

## Why

Self-hosted Web deployments often run behind a TLS-terminating reverse proxy.
The app already has `TRUST_PROXY_HEADERS`, but secure-request detection is
inconsistent:

- security headers trust `x-forwarded-proto: https` unconditionally for HSTS
- auth cookies ignore trusted proxy mode and only inspect the local request URL

This can either emit HSTS for spoofed untrusted requests or omit the `Secure`
cookie flag in legitimate HTTPS proxy deployments.

## Scope

- Use `TRUST_PROXY_HEADERS` consistently for secure-request detection.
- Apply the same secure-request decision to HSTS and auth cookie options.
- Preserve direct HTTPS behavior without proxy headers.

## Out Of Scope

- Changing trusted client IP parsing for rate limits.
- Adding new proxy allowlists.
- Changing cookie names, SameSite policy, or token lifetimes.

## Rollback

Revert the shared secure-request helper and tests. No data migration is needed.

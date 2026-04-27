# Proposal

## Summary

Fix self-hosted web media upload regressions by restoring browser-safe UUID generation and improving the user-facing error guidance when remote image URLs point to blocked local-network addresses.

## Why

- Pasting images in self-hosted web can fail in non-secure contexts because `crypto.randomUUID()` is not always available.
- Users currently receive a generic upload failure when a remote image URL points to a LAN/internal host blocked by SSRF protection.

## Scope

### In Scope

- Add a browser-safe UUID fallback for the web desktop bridge media path.
- Improve remote media download error messaging for local-network / internal-address rejections.
- Add tests for the new behaviors.

### Out Of Scope

- Disabling SSRF protection for LAN or localhost media URLs.
- Broader refactors of media upload UX.

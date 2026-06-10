# Startup Log Noise Spec

## Requirements

- Dev startup MUST NOT open Chromium DevTools by default.
- Dev startup MUST allow explicit DevTools opening through an environment variable.
- Database initialization MUST NOT create a pre-migration backup when the existing database schema is already current.
- Database initialization MUST still create a pre-migration backup when a non-empty existing database needs migration.
- Normal renderer AI workflows MUST NOT print prompts, streamed content, generated image URLs, base64 image payloads, or raw provider response bodies through `console.log`.
- Renderer AI failure diagnostics SHOULD keep sensitive provider payloads out of console warn/error arguments while preserving user-visible error messages.
- Legacy IndexedDB reset, version-change cleanup, and media clear success paths MUST NOT print success-only `console.log` messages during normal operation.
- High-frequency renderer controls MUST NOT print expected browser API degradation details during normal user interactions when the control can continue functioning.

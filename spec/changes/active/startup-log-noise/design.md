# Design

## Boundaries

- Electron startup controls whether DevTools opens automatically.
- Vite config can suppress Browserslist stale-data warnings for local dev/build logs.
- `packages/db` owns migration backup behavior.
- Desktop renderer services and shared UI primitives own normal workflow diagnostic logging for AI requests, sync/startup progress, legacy IndexedDB compatibility helpers, and high-frequency interaction controls.

## Decisions

- DevTools should be opt-in during dev startup via `PROMPTHUB_OPEN_DEVTOOLS=1` or `ELECTRON_OPEN_DEVTOOLS=1`.
- Database pre-migration backups should only be created when the existing database appears to need schema work.
- Stale SQLite lock cleanup remains visible only when it actually removes a lock.
- Normal renderer AI workflows should not print prompts, streamed content, generated image URLs, base64 image payloads, or raw provider responses to the console. Failure paths may keep concise warn/error markers, but console payloads should avoid user content and provider response bodies.
- Legacy IndexedDB reset, version-change cleanup, and media clearing helpers should not print success-only `console.log` messages during normal operation. Failure diagnostics remain visible through warn/error logs.
- High-frequency renderer controls should silently degrade expected browser API edge cases when the interaction still works, such as pointer capture failures during column resizing.

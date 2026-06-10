# Design

## Ownership

- Owning app: `apps/web`
- Source of truth: browser device id in `window.localStorage`, server validation in `apps/web/src/routes/devices.ts`
- Contract: `/api/devices/heartbeat` request body remains unchanged

## Approach

- Keep browser device id generation inside `DesktopWorkspace.tsx`, where heartbeat metadata is assembled.
- Add a small validation helper that mirrors the server id boundary: trimmed non-empty string, at most 128 characters.
- Rewrite invalid stored ids before dispatching the heartbeat.
- Replace raw `fetch` with `fetchWithAuthRetry` so heartbeat behavior matches other authenticated web client calls.

## Verification

- Component regression tests cover invalid stored ids and auth retry dispatch.
- Focused Web tests, typecheck, lint, and diff whitespace checks are required before this change is considered done.

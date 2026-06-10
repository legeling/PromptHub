# Web Device Heartbeat Resilience

## Why

The self-hosted web workspace registers the browser as a connected device through `/api/devices/heartbeat`. The client currently trusts the persisted browser device id and sends the heartbeat with raw `fetch`, which can leave the device record stale when local storage contains an invalid id or when the access token needs the existing refresh flow.

## Scope

- Validate and self-heal the browser device id stored in local storage before heartbeat dispatch.
- Send heartbeat through the existing authenticated retry wrapper.
- Keep the server device schema unchanged.

## Risks

- Existing valid browser device ids must remain stable.
- Invalid local ids will be replaced, which creates a new browser device identity for that client.

## Rollback

Revert the client-side validation and request wrapper change. No schema or data migration is involved.

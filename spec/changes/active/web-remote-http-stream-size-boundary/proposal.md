# Proposal

## Why

`requestRemoteBuffered()` enforces a response byte limit, but
`requestRemoteStream()` currently returns the upstream stream without enforcing
`maxBytes`. Callers such as the AI stream proxy can therefore forward an
unbounded upstream response even when they pass a size limit.

## Scope

- Enforce `maxBytes` while consuming `requestRemoteStream()` bodies.
- Add regression coverage for streamed responses that exceed the configured
  byte limit.
- Keep existing SSRF, protocol, redirect, and header behavior unchanged.

## Risks

- Consumers will now see a stream read error instead of an endlessly growing
  stream when upstream exceeds the cap.
- Stream cancellation should tear down the upstream response to avoid keeping
  sockets open.

## Rollback

Revert the stream wrapper and restore direct `Readable.toWeb(response)`. The
regression test will fail if stream byte limits are no longer enforced.

## Impacted User Flows

- Web AI stream proxy requests.
- Any future remote stream caller using the shared remote HTTP helper.

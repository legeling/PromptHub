# Web API Delta Spec

## Modified Requirements

### Requirement: Device Heartbeat Metadata Must Be Bounded

`POST /api/devices/heartbeat` must reject oversized metadata before writing a
device record.

#### Scenario: Oversized user agent

- Given an authenticated user
- When the user sends a heartbeat with `userAgent` longer than 512 characters
- Then the response status is `422`
- And the response code is `VALIDATION_ERROR`
- And no device record is written for that heartbeat

### Requirement: Normal Heartbeats Remain Accepted

Desktop and browser heartbeats with bounded id, name, platform, version, and
user-agent metadata remain accepted and are listed for the authenticated user.

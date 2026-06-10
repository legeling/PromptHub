# Web Client Device Heartbeat Delta

## Modified Requirements

### Requirement: Browser heartbeat device identity

The Web client MUST only send a browser heartbeat with a non-empty device id that satisfies the server device id limit.

#### Scenario: Stored browser device id is invalid

- **Given** local storage contains an empty, whitespace-only, or oversized browser device id
- **When** the web workspace sends the browser heartbeat
- **Then** the client replaces the invalid value with a generated valid id
- **And** the heartbeat request body uses the generated id

### Requirement: Browser heartbeat authentication

The Web client MUST send browser heartbeat requests through the shared authenticated fetch retry flow.

#### Scenario: Heartbeat requires token refresh

- **Given** the current access token is expired but the auth session can refresh
- **When** the web workspace sends the browser heartbeat
- **Then** the request is dispatched through the auth retry wrapper instead of raw `fetch`

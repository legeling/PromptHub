# Web API Spec Delta

## Modified Requirements

### Requirement: Secure request detection honors trusted proxy mode

The Web app MUST treat a request as secure when the request URL is HTTPS, or
when `TRUST_PROXY_HEADERS=true` and the first `x-forwarded-proto` value is
`https`.

#### Scenario: untrusted forwarded proto is spoofed

- **Given** `TRUST_PROXY_HEADERS=false`
- **When** an HTTP request includes `x-forwarded-proto: https`
- **Then** the app MUST NOT emit HSTS based on that header

#### Scenario: trusted proxy forwards HTTPS

- **Given** `TRUST_PROXY_HEADERS=true`
- **When** an auth response is generated for an HTTP app request with `x-forwarded-proto: https`
- **Then** auth cookies MUST include the `Secure` flag
- **And** HSTS MAY be emitted for the response

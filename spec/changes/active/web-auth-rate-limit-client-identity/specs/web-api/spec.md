# Web API Delta Spec

## Modified Requirements

### Requirement: Auth Rate Limits Must Not Trust Spoofable Client IP Headers By Default

Web auth rate limiting must not derive client identity from caller-supplied
`x-forwarded-for` or `x-real-ip` headers unless the deployment explicitly
enables trusted proxy headers.

#### Scenario: Login attempts vary forwarded headers without trusted proxy mode

- Given trusted proxy headers are disabled
- And a client repeatedly submits invalid login attempts for the same user
- When each request uses a different `x-forwarded-for` value
- Then the auth route still applies the same rate-limit bucket
- And the next attempt after the configured threshold returns `429 RATE_LIMITED`

#### Scenario: Trusted proxy headers are explicitly enabled

- Given trusted proxy headers are enabled
- When auth rate limiting derives the client identity
- Then the first `x-forwarded-for` hop is used when present
- And `x-real-ip` is used when `x-forwarded-for` is absent

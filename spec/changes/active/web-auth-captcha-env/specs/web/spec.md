# Web Spec Delta

## ADDED Requirements

### Requirement FR-001: Captcha can be disabled by environment variable

PromptHub Web MUST keep auth captcha enabled by default and MUST disable setup/login captcha only when `AUTH_CAPTCHA_ENABLED=false` is set.

#### Scenario: Default deployment keeps captcha

Given `AUTH_CAPTCHA_ENABLED` is unset
When a user opens setup or login
Then the server requires captcha fields
And the client renders the captcha challenge.

#### Scenario: Internal deployment disables captcha

Given `AUTH_CAPTCHA_ENABLED=false`
When a user opens setup or login
Then `/api/auth/bootstrap` reports `captchaEnabled: false`
And setup/login submit succeeds without `captchaId` or `captchaAnswer`.

### Requirement FR-002: Frontend follows backend captcha state

The web client MUST use backend bootstrap state to decide whether captcha UI is required.

#### Scenario: Captcha disabled client state

Given bootstrap reports `captchaEnabled: false`
When setup/login pages render
Then they do not call `getCaptcha`
And they do not render the captcha input or refresh button.

### Requirement FR-003: Cloudflare Worker mirrors self-hosted auth behavior

The Cloudflare Worker auth implementation MUST support the same `AUTH_CAPTCHA_ENABLED=false` switch.

#### Scenario: Worker captcha disabled

Given Worker env has `AUTH_CAPTCHA_ENABLED=false`
When a user registers or logs in
Then the worker does not require captcha fields.

### Requirement FR-004: Disabling captcha does not weaken other auth controls

Disabling captcha MUST NOT disable password validation, JWT cookie handling, registration restrictions, or auth rate limits.

#### Scenario: Auth controls remain active

Given `AUTH_CAPTCHA_ENABLED=false`
When setup or login requests are processed
Then only captcha issue/verify behavior is skipped
And all other auth validation and session behavior remains unchanged.

## Traceability

| Requirement | Design | Verification | Task |
| --- | --- | --- | --- |
| `FR-001` | `DES-001`, `DES-002` | `TEST-001`, `TEST-002` | `T-001`, `T-003` |
| `FR-002` | `DES-003` | `TEST-003` | `T-003` |
| `FR-003` | `DES-004` | `TEST-004` | `T-004` |
| `FR-004` | `DES-002`, `DES-005` | `TEST-001`, `TEST-002`, `TEST-004` | `T-003`, `T-004` |

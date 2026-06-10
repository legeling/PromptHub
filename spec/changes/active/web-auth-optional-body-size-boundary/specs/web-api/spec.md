# Web Auth Optional Body Size Boundary

## Modified Requirements

### Requirement: Optional auth bodies must reject oversized declared payloads

`POST /api/auth/refresh` and `POST /api/auth/logout` MUST reject requests whose declared `Content-Length` is larger than the optional auth body limit before parsing the optional JSON body.

#### Scenario: Refresh rejects an oversized declared body

- Given a registered user has a valid refresh token
- When the user submits `POST /api/auth/refresh` with `Content-Length` greater than the optional auth body limit
- Then the API responds with `400 BAD_REQUEST`
- And the refresh token is not rotated

#### Scenario: Refresh rejects an oversized streamed body

- Given a registered user has a valid refresh token
- When the user submits `POST /api/auth/refresh` with no `Content-Length` and
  a streamed JSON body larger than the optional auth body limit
- Then the API responds with `400 BAD_REQUEST`
- And the refresh token remains usable by a later valid refresh request

#### Scenario: Cookie-backed empty refresh remains accepted

- Given a user has an HttpOnly refresh cookie
- When the user submits an empty `POST /api/auth/refresh` request
- Then the API uses the refresh cookie and rotates the token normally

### Requirement: Credential auth bodies must reject oversized declared payloads

`POST /api/auth/register`, `POST /api/auth/login`, and
`PUT /api/auth/password` MUST reject requests whose declared `Content-Length`
is larger than the auth body limit before parsing credential JSON.

#### Scenario: Register rejects an oversized declared body

- Given an unauthenticated client
- When the client submits `POST /api/auth/register` with `Content-Length`
  greater than the auth body limit
- Then the API responds with `400 BAD_REQUEST`
- And the response explains that the auth request body exceeds the size limit

#### Scenario: Register rejects an oversized streamed body

- Given an unauthenticated client
- When the client submits `POST /api/auth/register` with no `Content-Length`
  and a streamed JSON body larger than the auth body limit
- Then the API responds with `400 BAD_REQUEST`
- And captcha verification and user creation are not attempted

#### Scenario: Password change rejects an oversized declared body

- Given an authenticated user
- When the user submits `PUT /api/auth/password` with `Content-Length` greater
  than the auth body limit
- Then the API responds with `400 BAD_REQUEST`
- And the existing password remains valid

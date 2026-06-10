# Web API Delta Spec

## Modified Requirements

### Requirement: AI Proxy Requests Must Use HTTPS Upstream URLs

`POST /api/ai/request` and `POST /api/ai/stream` must reject non-HTTPS
upstream URLs before contacting remote hosts.

#### Scenario: Buffered AI proxy request uses HTTP

- Given an authenticated user sends an AI proxy request with an `http://`
  upstream URL
- When PromptHub validates the request
- Then the response is `422 VALIDATION_ERROR`
- And no upstream buffered transport request is attempted

#### Scenario: Streaming AI proxy request uses HTTP

- Given an authenticated user sends an AI stream request with an `http://`
  upstream URL
- When PromptHub validates the request
- Then the response is `422 VALIDATION_ERROR`
- And no upstream stream transport request is attempted

### Requirement: AI Stream Responses Must Not Forward Upstream Cookies

`POST /api/ai/stream` must not include upstream `set-cookie` headers in the
browser response.

#### Scenario: Upstream stream response sets cookies

- Given an authenticated user sends a valid AI stream request
- And the upstream streaming response contains `set-cookie`
- When PromptHub returns the stream response
- Then the response does not include `set-cookie`
- And the stream body is still delivered

### Requirement: AI Stream Responses Must Strip Hop-By-Hop Headers

`POST /api/ai/stream` must strip hop-by-hop headers such as
`transfer-encoding`, `connection`, `keep-alive`, `te`, `trailer`, and `upgrade`.

### Requirement: AI Proxy Requests Must Enforce Input Size Boundaries

`POST /api/ai/request` and `POST /api/ai/stream` must reject oversized declared
request envelopes before JSON parsing and must validate bounded `requestId`,
URL, header, and body fields before contacting upstream transports.

#### Scenario: Declared AI proxy request envelope is too large

- Given an authenticated user submits an AI proxy request with `Content-Length`
  greater than the AI proxy request envelope limit
- When PromptHub validates the request
- Then the response is `400 BAD_REQUEST`
- And no upstream transport request is attempted

#### Scenario: AI proxy request fields exceed supported limits

- Given an authenticated user submits an AI proxy request with an overlong
  request id, URL, headers, or body field
- When PromptHub validates the request
- Then the response is `422 VALIDATION_ERROR`
- And no upstream transport request is attempted

### Requirement: AI Stream Transport Errors Must Not Expose Internal Details

`POST /api/ai/stream` must not return raw transport exception messages to
clients.

#### Scenario: Streaming transport throws

- Given an authenticated user sends a valid AI stream request
- When the streaming transport throws an internal exception
- Then PromptHub responds with `500 INTERNAL_ERROR`
- And the response message is a generic internal server error
- And the upstream exception message is not exposed to the client

### Requirement: AI Buffered Transport Errors Must Not Expose Internal Details

`POST /api/ai/request` must not return raw transport exception messages to
clients.

#### Scenario: Buffered transport throws

- Given an authenticated user sends a valid buffered AI proxy request
- When the buffered transport throws an internal exception
- Then PromptHub returns an AI transport envelope with `ok: false`
- And the envelope error message is generic
- And the upstream exception message is not exposed to the client

### Requirement: AI Stream Non-2xx Responses Must Not Replay Requests

`POST /api/ai/stream` must not issue a second upstream request when the first
stream transport request receives a non-2xx response.

#### Scenario: Upstream stream response is non-2xx

- Given an authenticated user sends a streaming AI proxy request with a POST body
- When the upstream stream transport returns a non-2xx response with a response body
- Then PromptHub returns an AI transport envelope using that response status,
  headers, and body
- And PromptHub does not call the buffered transport for the same request

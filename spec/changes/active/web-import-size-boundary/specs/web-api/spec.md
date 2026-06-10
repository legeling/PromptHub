# Web API Delta Spec

## Modified Requirements

### Requirement: Web Import Must Reject Oversized Declared Request Bodies

`POST /api/import` must reject requests whose declared `Content-Length` exceeds
the Web import body limit before parsing JSON, ZIP, octet-stream, or multipart
payloads.

#### Scenario: Declared import body exceeds the limit

- Given an authenticated user sends `POST /api/import`
- And the request `Content-Length` is greater than the Web import body limit
- When PromptHub handles the request
- Then the response status is `400`
- And the response code is `BAD_REQUEST`
- And no import records are written

#### Scenario: Content-Length is invalid

- Given an authenticated user sends `POST /api/import`
- And the request `Content-Length` is negative or not numeric
- When PromptHub handles the request
- Then the response status is `400`
- And the response code is `BAD_REQUEST`

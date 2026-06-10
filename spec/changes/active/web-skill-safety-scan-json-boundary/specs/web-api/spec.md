# Web API Delta Spec

## Modified Requirements

### Requirement: Legacy Skill Safety Scan Must Reject Malformed JSON

`POST /api/skills/:id/safety-scan` must reject non-empty malformed JSON request
bodies before starting a safety scan.
Both the legacy Skill safety scan route and the direct `POST /api/skills/safety-scan`
route must reject oversized scan input fields before calling the AI provider.

#### Scenario: Malformed JSON is submitted

- Given an authenticated user owns a Skill
- When the user sends `POST /api/skills/:id/safety-scan` with malformed JSON
- Then the response status is `400`
- And the response code is `BAD_REQUEST`
- And no upstream AI request is attempted

#### Scenario: Empty body is submitted

- Given an authenticated user owns a Skill
- When the user sends `POST /api/skills/:id/safety-scan` without a body
- Then the route preserves the existing no-override scan behavior

#### Scenario: Oversized scan input is submitted

- Given an authenticated user submits a safety scan request with overlong name,
  content, local path, audit metadata, or AI config fields
- When PromptHub validates the request
- Then the response status is `422`
- And the response code is `VALIDATION_ERROR`
- And no upstream AI provider request is attempted

# Web API Delta Spec

## Modified Requirements

### Requirement: Generic Skill Updates Must Not Save Safety Reports

`PUT /api/skills/:id` must reject request bodies that contain `safetyReport`.
Safety reports are only writable through the dedicated safety-report route.

#### Scenario: Generic update includes a safety report

- Given an authenticated user owns a private Skill
- When the user sends `PUT /api/skills/:id` with a `safetyReport` field
- Then the response status is `422`
- And the response code is `VALIDATION_ERROR`
- And the stored Skill has no new safety report

### Requirement: Dedicated Safety Report Route Remains Authoritative

`PUT /api/skills/:id/safety-report` remains the accepted route for persisting a
validated `SkillSafetyReport`.
The route must reject oversized report content, including excessive finding
counts and overlong summary, finding code, title, detail, file path, or evidence
fields.

#### Scenario: Dedicated safety report route receives oversized report content

- Given an authenticated user owns a private Skill
- When the user sends `PUT /api/skills/:id/safety-report` with too many findings
  or overlong report fields
- Then the response status is `422`
- And the response code is `VALIDATION_ERROR`
- And the stored Skill has no new safety report

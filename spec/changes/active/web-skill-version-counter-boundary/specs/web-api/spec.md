# Web API Delta Spec

## Modified Requirements

### Requirement: Generic Skill Updates Must Not Overwrite Version Counters

`PUT /api/skills/:id` must reject request bodies that contain
`currentVersion`. Version counters are derived from version snapshot creation.

#### Scenario: Generic update includes currentVersion

- Given an authenticated user owns a private Skill
- And the Skill has version `1`
- When the user sends `PUT /api/skills/:id` with `currentVersion: 99`
- Then the response status is `422`
- And the response code is `VALIDATION_ERROR`
- And creating the next version returns version `2`

### Requirement: Version Creation Owns Counter Mutation

`POST /api/skills/:id/versions` remains the accepted route for advancing the
Skill version counter.

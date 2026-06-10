# Web API Delta Spec

## Modified Requirements

### Requirement: Project Rule Creation Must Reject Unsafe User Supplied IDs

`POST /api/rules/projects` must reject an optional `id` that cannot be safely
used as one managed workspace path segment.

#### Scenario: Project id contains path traversal

- Given an authenticated user
- When the user sends `POST /api/rules/projects` with `id: "../escape"`
- Then the response status is `422`
- And the response code is `VALIDATION_ERROR`
- And no rule descriptor or managed workspace file is created

### Requirement: Project Rule Creation Must Bound Names And Root Paths

`POST /api/rules/projects` must reject project names and root paths that are
empty after trimming, over the supported length, or contain control characters.

#### Scenario: Project name contains control characters

- Given an authenticated user
- When the user sends `POST /api/rules/projects` with a project name containing
  a NUL character
- Then the response status is `422`
- And the response code is `VALIDATION_ERROR`
- And no rule descriptor or managed workspace file is created

#### Scenario: Project root path is overlong or contains control characters

- Given an authenticated user
- When the user sends `POST /api/rules/projects` with an overlong root path or
  a root path containing control characters
- Then the response status is `422`
- And the response code is `VALIDATION_ERROR`
- And no rule descriptor or managed workspace file is created

### Requirement: Project Rule Deletion Must Reject Unsafe User Supplied IDs

`DELETE /api/rules/projects/:projectId` must reject a `projectId` that cannot
be safely used as one managed workspace path segment.

#### Scenario: Delete project id contains path traversal

- Given an authenticated user
- When the user sends `DELETE /api/rules/projects/..%2Fescape`
- Then the response status is `422`
- And the response code is `VALIDATION_ERROR`
- And no managed workspace file is created or deleted for that unsafe id

### Requirement: Imported Rule Records Must Return Validation Errors For Unsafe Paths

`POST /api/rules/import-records` must map unsafe managed workspace snapshot
errors to `422 VALIDATION_ERROR`.

#### Scenario: Imported rule record contains unsafe path segments

- Given an authenticated user
- When the user imports a rule record with `id: "project:../escape"` or
  `name: "../AGENTS.md"`
- Then the response status is `422`
- And the response code is `VALIDATION_ERROR`
- And no rule descriptor or managed workspace file is created

### Requirement: Rules Mutation Payloads Must Be Bounded

Rules mutation endpoints must reject oversized content and bulk import payloads
at the route validation boundary before mutating managed workspace files.

#### Scenario: Saving oversized rule content

- Given an authenticated user has an existing project rule
- And the rule has valid existing content
- When the user sends `PUT /api/rules/{id}` with content larger than the rule
  content limit
- Then the response status is `422`
- And the response code is `VALIDATION_ERROR`
- And the existing rule content remains unchanged

#### Scenario: Rewriting with oversized instruction

- Given an authenticated user
- When the user sends `POST /api/rules/rewrite` with an instruction larger
  than the rewrite instruction limit
- Then the response status is `422`
- And the response code is `VALIDATION_ERROR`

#### Scenario: Importing too many rule records

- Given an authenticated user
- When the user sends `POST /api/rules/import-records` with more than the
  allowed number of records
- Then the response status is `422`
- And the response code is `VALIDATION_ERROR`

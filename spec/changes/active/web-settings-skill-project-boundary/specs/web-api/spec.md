# Web Settings Skill Project Boundary

## Modified Requirements

### Requirement: Skill project settings must be bounded and non-empty

`PUT /api/settings` MUST reject skill project payloads with empty required fields, overlong path fields, too many scan/deploy paths, or too many projects.

#### Scenario: Invalid skill project payload is rejected

- Given an authenticated user has default settings
- When the user updates settings with an invalid skill project payload
- Then the API responds with `422 VALIDATION_ERROR`
- And the user's `skillProjects` setting remains unchanged

#### Scenario: Valid skill project remains accepted

- Given an authenticated user
- When the user updates settings with a small skill project config
- Then the API responds with `200`
- And the submitted skill project is returned by the next settings read

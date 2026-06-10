# Web Settings Custom Agent Boundary

## Modified Requirements

### Requirement: Custom agent settings must be bounded and non-empty

`PUT /api/settings` MUST reject custom agent payloads with empty required fields, overlong string fields, too many config relative paths, or too many custom agents.

#### Scenario: Invalid custom agent payload is rejected

- Given an authenticated user has default settings
- When the user updates settings with an invalid custom agent
- Then the API responds with `422 VALIDATION_ERROR`
- And the user's `customAgents` setting remains unchanged

#### Scenario: Valid custom agent remains accepted

- Given an authenticated user
- When the user updates settings with a small custom agent config
- Then the API responds with `200`
- And the submitted custom agent is returned by the next settings read

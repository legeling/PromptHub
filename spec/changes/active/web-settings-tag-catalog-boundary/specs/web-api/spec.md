# Web Settings Tag Catalog Boundary

## Modified Requirements

### Requirement: Prompt tag catalog updates must be bounded

`PUT /api/settings` MUST reject `promptTagCatalog` payloads that contain empty tags, tags longer than the per-tag limit, or more tags than the catalog limit.

#### Scenario: Oversized tag catalog is rejected

- Given an authenticated user has default settings
- When the user updates settings with more prompt tags than the catalog limit
- Then the API responds with `422 VALIDATION_ERROR`
- And the user's `promptTagCatalog` remains unchanged

#### Scenario: Valid tag catalog remains accepted

- Given an authenticated user
- When the user updates settings with a small prompt tag catalog
- Then the API responds with `200`
- And the submitted tags are returned by the next settings read

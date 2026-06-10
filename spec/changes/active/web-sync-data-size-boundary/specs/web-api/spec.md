# Web Sync Data Size Boundary

## Modified Requirements

### Requirement: Direct sync data imports must reject oversized declared request bodies

`PUT /api/sync/data` MUST reject requests whose declared `Content-Length` exceeds the Web sync data body limit before parsing JSON or importing records.

#### Scenario: Declared sync data body exceeds the limit

- Given an authenticated user has existing prompt data
- When the user submits `PUT /api/sync/data` with `Content-Length` greater than the Web sync data body limit
- Then the API responds with `400 BAD_REQUEST`
- And the existing prompt data remains unchanged

#### Scenario: Content-Length is invalid

- Given an authenticated user submits `PUT /api/sync/data`
- And `Content-Length` is negative or non-numeric
- Then the API responds with `400 BAD_REQUEST`

# Web API Spec Delta

## Modified Requirements

### Requirement: Settings platform preference validation

`PUT /api/settings` MUST validate persisted platform preference fields before writing settings.

#### Scenario: bounded platform collections

- **Given** an authenticated user sends platform preference records or arrays
- **When** a collection exceeds the supported maximum
- **Then** the API returns `422 VALIDATION_ERROR`
- **And** the malformed setting is not persisted

#### Scenario: non-empty platform ids and paths

- **Given** an authenticated user sends platform ids, custom platform paths, or agent asset paths
- **When** any id or path is blank after trimming or exceeds the supported length
- **Then** the API returns `422 VALIDATION_ERROR`
- **And** the malformed setting is not persisted

#### Scenario: valid platform preferences

- **Given** an authenticated user sends valid platform preference values
- **When** the settings update succeeds
- **Then** those values round-trip through `GET /api/settings`

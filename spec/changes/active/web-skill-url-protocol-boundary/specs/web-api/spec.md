# Web API Spec Delta

## Modified Requirements

### Requirement: Skill URL metadata uses safe protocols

`POST /api/skills`, `POST /api/skills/import`, `PUT /api/skills/:id`, direct
Skill service writes, and sync/backup imports MUST reject unsafe URL protocols
for Skill metadata before persistence.

#### Scenario: unsafe source or content URL is submitted

- **Given** an authenticated user submits Skill metadata
- **And** `source_url` or `content_url` uses `javascript:`, `file:`, or another non-HTTP(S) protocol
- **When** the Skill mutation or import is processed
- **Then** the API returns `422 VALIDATION_ERROR`
- **And** the unsafe URL is not persisted

#### Scenario: unsafe icon URL is submitted

- **Given** an authenticated user submits Skill metadata
- **And** `icon_url` uses an unsafe protocol such as `javascript:` or `file:`
- **When** the Skill mutation or import is processed
- **Then** the API returns `422 VALIDATION_ERROR`
- **And** the unsafe icon URL is not persisted

#### Scenario: supported icon data URL is submitted

- **Given** an authenticated user submits `icon_url` as a base64 image data URL
- **When** the Skill mutation succeeds
- **Then** the icon URL round-trips through the Skill read API

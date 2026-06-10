# Web API Spec Delta

## Modified Requirements

### Requirement: Skill metadata arrays are bounded

`POST /api/skills`, `POST /api/skills/import`, `PUT /api/skills/:id`, and
remote skill imports through `POST /api/skills/fetch-remote` MUST validate
skill metadata arrays before persistence.

#### Scenario: metadata arrays exceed the allowed count

- **Given** an authenticated user sends too many tags, original tags, prerequisites, or compatibility entries
- **When** the user creates, imports, or updates a skill
- **Then** the API returns `422 VALIDATION_ERROR`
- **And** the malformed skill metadata is not persisted

#### Scenario: metadata entries are empty or too long

- **Given** an authenticated user sends blank or overlong skill metadata entries
- **When** the user creates, imports, or updates a skill
- **Then** the API returns `422 VALIDATION_ERROR`

#### Scenario: valid metadata persists

- **Given** an authenticated user sends valid skill metadata arrays
- **When** the skill mutation succeeds
- **Then** the metadata values round-trip through the skill read API

#### Scenario: remote frontmatter metadata exceeds limits

- **Given** an authenticated user fetches a remote skill with `importToLibrary`
- **When** the fetched SKILL.md frontmatter contains overlong or excessive tags
- **Then** the API returns `422 VALIDATION_ERROR`
- **And** no imported skill is persisted

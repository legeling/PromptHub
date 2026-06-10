# Web API Delta Spec

## Modified Requirements

### Requirement: Folder List Query Efficiency

`GET /api/folders` MUST return visible folders without issuing per-folder detail lookups after the visible list query.

#### Scenario: Listing multiple visible folders

- Given a user has multiple visible private and shared folders
- When the Web folder service lists folders for that user
- Then the service returns the same folder payload shape as before
- And the database read path does not add one or more extra detail queries per returned folder

#### Scenario: Permission filtering remains unchanged

- Given a user lists private, shared, or all folders
- When the service applies the requested scope
- Then private folders are limited to the actor owner
- And shared folders remain visible to authenticated users

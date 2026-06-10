# Web API Delta Spec

## Modified Requirements

### Requirement: Skill List Query Efficiency

`GET /api/skills` and `GET /api/skills/search` MUST return visible skills without issuing per-skill detail lookups after the visible list query.

#### Scenario: Listing multiple visible skills

- Given a user has multiple visible private and shared skills
- When the Web skill service lists skills for that user
- Then the service returns the same skill payload shape as before
- And the database read path does not add one or more extra detail queries per returned skill

#### Scenario: Permission filtering remains unchanged

- Given a user lists private, shared, or all skills
- When the service applies the requested scope
- Then private skills are limited to the actor owner
- And shared skills remain visible to authenticated users

# Delta for Web Data Layout Migration

## MODIFIED Requirements

### Requirement: Web Data Root Layout

The web runtime SHALL move toward a `data/ + config/ + backups/ + logs/` layout with prompt files stored in the newer folder-and-frontmatter structure.

#### Scenario

- GIVEN the web runtime persists PromptHub data
- WHEN the new layout is fully adopted
- THEN prompts, settings, devices, media, and backups follow the newer structured layout

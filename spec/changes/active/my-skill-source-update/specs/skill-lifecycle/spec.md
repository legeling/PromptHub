# Skill Lifecycle Delta

## ADDED Requirements

### Requirement: Installed skills with source metadata can check source updates

An installed skill that has `source_url` or `content_url` metadata MUST be able to check for updates from the My Skills detail view even when the current store registry cache does not contain the skill.

#### Scenario: GitHub tree source without cached registry entry

- **Given** an installed skill has a GitHub tree `source_url`
- **And** no registry or remote store entry matches it
- **When** the user checks for source updates
- **Then** PromptHub derives the raw `SKILL.md` URL
- **And** compares the fetched content with `installed_content_hash`
- **And** reports whether an update is available, up to date, locally modified, or conflicted.

### Requirement: Source updates preserve local safety semantics

Source updates MUST create a version snapshot before applying remote content and MUST not overwrite local modifications unless the caller explicitly requests overwrite behavior.

#### Scenario: Pristine installed skill receives source update

- **Given** an installed GitHub skill is unchanged since its last installed content hash
- **And** the remote `SKILL.md` content changed
- **When** the user applies the source update
- **Then** PromptHub creates a skill version snapshot
- **And** updates the installed skill content and source metadata
- **And** refreshes its managed local repo content.

### Requirement: Store source labels remain stable across source updates

Updating a skill from a private or custom store MUST NOT replace the user-facing store label with the underlying Git host label.

#### Scenario: Private Gitea store skill updates

- **Given** a skill was installed from a user-named private store
- **And** its underlying source is a Gitea repository
- **When** PromptHub checks the unchanged source content
- **Then** the skill is reported as up to date
- **When** the remote source later changes and the user applies the update
- **Then** the installed skill keeps the private store label
- **And** it is not relabeled as a generic Gitea import.

# Core Rules Workspace Atomic Writes Spec

## Modified Requirements

### Requirement: Managed Rules workspace writes preserve previous readable files

Shared Rules workspace writes under `data/rules/` MUST publish managed rule
content, metadata JSON, version files, and version indexes using same-directory
atomic replacement. If writing the replacement content fails before publication,
the previous destination file MUST remain readable and unchanged.

#### Scenario: Managed rule content write is interrupted

- **GIVEN** a project rule has existing managed content
- **WHEN** saving replacement content fails while writing the managed rule file
- **THEN** the previous managed rule content remains readable on disk
- **AND** the save operation reports the write failure

### Requirement: External target rule write semantics remain stable

This change MUST NOT switch user-managed external target paths to rename-based
replacement. Target sync errors may still report `sync-error`, but durable
Rules truth remains the managed workspace copy under `data/rules/`.

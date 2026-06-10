# Core Rules Workspace Path Boundary Spec

## Modified Requirements

### Requirement: Project rule ids are safe path segments

The shared Rules workspace service MUST reject caller-supplied project rule ids
that cannot be safely used as one managed workspace path segment.

#### Scenario: Direct project creation contains path traversal project id

- **GIVEN** a direct desktop or CLI caller creates a project rule with
  `id: "../escape-create"`
- **WHEN** the shared Rules workspace service receives the request
- **THEN** the creation fails with a validation error
- **AND** no managed rule file is created outside `data/rules/projects/`

#### Scenario: Imported backup record contains path traversal project id

- **GIVEN** a Rules backup import contains `id: "project:../../../escaped"`
- **WHEN** the shared Rules workspace service imports the record
- **THEN** the import fails with a validation error
- **AND** no managed rule file is created outside `data/rules/projects/`

### Requirement: Valid project ids keep existing layout

Valid ids containing letters, numbers, dots, underscores, and hyphens MUST keep
the existing `data/rules/projects/<slug>__<id>/AGENTS.md` layout.

# CLI Ergonomics Spec Delta

## Added Requirements

### Requirement: CWD-Aware Project Rules

PromptHub CLI MUST allow a developer to register the current working directory
as a project rules workspace without requiring a GUI flow or a full absolute
path.

#### Scenario: Initialize current project rules

- **WHEN** the user runs `prompthub rules project-init` from a project directory
- **THEN** the CLI creates a project rule for that directory
- **AND** the default project name is the directory basename
- **AND** the default target rules file is `<cwd>/AGENTS.md`.

### Requirement: Fuzzy CLI Resource Selection

PromptHub CLI SHOULD accept a human-readable id, name, title, or query for
high-frequency read/use/apply commands when the match is unambiguous.

#### Scenario: Copy prompt by title query

- **GIVEN** exactly one prompt matches a title query
- **WHEN** the user runs `prompthub prompt copy <query>`
- **THEN** the CLI copies that prompt and increments usage.

#### Scenario: Ambiguous non-interactive match

- **GIVEN** multiple resources match the same query
- **WHEN** the command runs in non-interactive mode
- **THEN** the CLI fails with `CONFLICT`
- **AND** the error details include candidate ids and labels.

#### Scenario: Ambiguous interactive match

- **GIVEN** multiple resources match the same query
- **WHEN** the command runs in an interactive terminal
- **THEN** the CLI presents numbered choices on stderr
- **AND** runs the command for the selected resource.

### Requirement: Interactive AI Route Selection

PromptHub CLI MUST allow route assignment without requiring the user to copy a
generated model id when a compatible model can be selected by query or by
interactive choice.

#### Scenario: Select a compatible model for a route

- **WHEN** the user runs `prompthub ai route-set visionText`
- **THEN** the CLI lists compatible vision-capable models in an interactive
  terminal
- **AND** applies the selected model through existing route validation.

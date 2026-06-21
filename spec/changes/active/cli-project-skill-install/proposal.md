# CLI Project Skill Install Proposal

## Why

Developers who are already inside a project directory should not need to open the desktop app, register that folder as a Skill project, and then import a Skill from My Skills. The CLI should provide a direct project-local install path that uses the same Skill package semantics as desktop project distribution.

## Scope

- Add a CLI command for installing an existing PromptHub Skill into a project directory.
- Default the project root to the current working directory.
- Default the target Skill folder root to `<project>/.agents/skills`.
- Allow interactive selection from My Skills when no identifier is passed.
- Preserve the full Skill directory package, not only `SKILL.md`.

## Non-Goals

- No change to desktop project registration or project scanning UI.
- No new database schema or persisted project record.
- No remote marketplace install behavior change.

## Risks

- Existing target project Skills may contain local edits. The CLI should skip existing targets by default and require an explicit force option to overwrite.
- Interactive output must not corrupt JSON stdout for script callers.

## Rollback

The feature is isolated to CLI command handling and shared CLI Skill service code. Removing the command and helper restores prior behavior without migration.

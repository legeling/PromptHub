# CLI Project Skill Install Design

## Command Shape

Add:

```text
prompthub skill project-install [id|name|query] [--project <path>] [--target <skills-dir>] [--mode copy|symlink] [--force]
```

Aliases may map to the same behavior to reduce discoverability friction.

## Data Boundary

- Source of truth remains the existing SQLite Skill record plus its managed/local Skill repo path.
- The command does not create a `SkillProject` settings record.
- The command writes only to the requested filesystem project target.

## Install Semantics

- Project root defaults to `process.cwd()`.
- Target root defaults to `<projectRoot>/.agents/skills`.
- `<targetRoot>/<skill-name>` is the created Skill package folder.
- Copy mode preserves the full Skill directory and excludes PromptHub-internal repo entries.
- Symlink mode links the target folder to the resolved local Skill repo.
- Existing targets are skipped unless `--force` is passed.

## Interactive Semantics

- Interactive selection is only used when no Skill identifier is passed and the CLI input is interactive.
- Selection prompt text is written to stderr so stdout remains JSON/table payload output.
- Non-interactive invocations without an identifier fail with a usage error.

## Verification

- CLI tests cover exact install, current working directory default, interactive selection, fuzzy matching, ambiguous matching, skip existing, and force overwrite.

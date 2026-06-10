# Web Skill Workspace Atomic Export Spec

## Modified Requirements

### Requirement: Skill workspace export preserves the last complete tree on write failure

Web skill workspace export MUST write the next tree into a sibling staging
directory and MUST NOT remove or partially overwrite the live `data/skills`
workspace when metadata, `SKILL.md`, version, or sidecar file writes fail.

#### Scenario: SKILL.md write is interrupted

- **GIVEN** a complete live skill workspace exists on disk
- **AND** SQLite contains updated skill data
- **WHEN** skill workspace export fails while writing `SKILL.md`
- **THEN** export fails with the underlying write error
- **AND** the previous live `SKILL.md` still exists
- **AND** previous live sidecar files still exist
- **AND** previous live file contents are unchanged

### Requirement: Skill workspace import ignores export scratch directories

Web skill workspace import MUST NOT treat interrupted export staging or backup
directories as valid skill directories.

#### Scenario: Scratch directory remains after interrupted export

- **GIVEN** `data/skills/.skills-staging-*` contains a `skill.json`
- **WHEN** skill workspace import scans the live workspace
- **THEN** that scratch directory is ignored

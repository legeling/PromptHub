# Web Prompt Workspace Atomic Export Spec

## Modified Requirements

### Requirement: Prompt workspace export preserves the last complete tree on write failure

Web prompt workspace export MUST write the next tree into a sibling staging
directory and MUST NOT remove or partially overwrite the live `data/prompts`
workspace when folder metadata, prompt, or version file writes fail.

#### Scenario: Prompt file write is interrupted

- **GIVEN** a complete live prompt workspace exists on disk
- **AND** SQLite contains updated prompt data
- **WHEN** prompt workspace export fails while writing a prompt markdown file
- **THEN** export fails with the underlying write error
- **AND** the previous live prompt markdown file still exists
- **AND** the previous live prompt markdown content is unchanged

### Requirement: Prompt workspace export publishes complete snapshots only

Web prompt workspace export MUST replace the live `data/prompts` directory only
after folder metadata, prompt markdown files, and prompt version files have all
been written successfully to staging.

#### Scenario: Export succeeds

- **GIVEN** SQLite contains folders, prompts, and prompt versions
- **WHEN** prompt workspace export completes
- **THEN** the live workspace contains the exported folder metadata, prompt
  markdown files, and version files from the same export snapshot

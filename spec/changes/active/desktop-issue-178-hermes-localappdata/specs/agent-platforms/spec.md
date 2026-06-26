# Agent Platform Path Spec

## Modified Requirements

### Requirement: Windows platform variables are expanded

PromptHub MUST expand supported Windows environment placeholders before checking
or writing built-in agent platform paths.

#### Scenario: Expand LOCALAPPDATA

- **GIVEN** a Windows platform path template containing `%LOCALAPPDATA%`
- **WHEN** PromptHub resolves the path
- **THEN** it expands the placeholder to `process.env.LOCALAPPDATA`
- **AND** if `LOCALAPPDATA` is unavailable, it falls back to
  `<home>\AppData\Local`

#### Scenario: Open LOCALAPPDATA-backed paths

- **GIVEN** a desktop UI action opens a path containing `%LOCALAPPDATA%`
- **WHEN** the main process handles `shell:openPath`
- **THEN** it expands the placeholder before checking the filesystem

### Requirement: Hermes Windows Native uses the local app data root

PromptHub MUST use Hermes Agent's Windows Native root under
`%LOCALAPPDATA%\hermes` for built-in Hermes detection and derived asset paths.

#### Scenario: Resolve Hermes Windows root

- **GIVEN** PromptHub is running on Windows
- **AND** the user has not overridden the Hermes Agent root path
- **WHEN** PromptHub resolves the Hermes Agent root
- **THEN** the resolved root is `<LOCALAPPDATA>\hermes`
- **AND** the derived Skills path is `<LOCALAPPDATA>\hermes\skills`

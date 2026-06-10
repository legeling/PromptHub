# Web Rule Workspace Atomic Versions Spec

## Modified Requirements

### Requirement: Rule imports preserve prior records on write failure

Web rule workspace imports MUST NOT leave managed content, `_rule.json`, version
files, or `index.json` in a half-new/half-old state when a write fails. If an
imported version write fails, the previous exported rule record MUST remain
readable.

#### Scenario: Imported rule version write is interrupted

- **GIVEN** a rule has an existing exported version history
- **WHEN** a later import fails while writing an imported version file
- **THEN** the import throws the underlying write error
- **AND** the previous managed rule content remains readable
- **AND** the previous exported version history remains readable

### Requirement: Rule version index matches published files

Web rule workspace imports MUST publish `index.json` and version files from the
same staged version snapshot.

#### Scenario: Imported rule versions succeed

- **GIVEN** an imported rule record contains one or more version snapshots
- **WHEN** import completes
- **THEN** exported rule versions match the imported version snapshots and the
  live index references files that exist in the same directory.

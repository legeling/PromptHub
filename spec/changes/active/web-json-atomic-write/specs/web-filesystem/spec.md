# Web Filesystem Delta Spec

## Modified Requirements

### Requirement: Device Registry Writes Must Preserve Previous State On Interrupted Writes

Web device registry updates must not overwrite the existing registry file until
the replacement JSON payload has been fully written to a sibling temporary file.

#### Scenario: Device heartbeat write is interrupted

- Given a user already has a device registry JSON file
- When a heartbeat attempts to persist an updated registry
- And the write is interrupted before the replacement file is complete
- Then the heartbeat reports the write failure
- And the previous registry JSON file remains readable and unchanged

### Requirement: Settings Mirror Writes Must Preserve Previous State On Interrupted Writes

Web settings mirror updates must not overwrite the existing
`config/settings/<userId>.json` file until the replacement JSON payload has
been fully written to a sibling temporary file.

#### Scenario: Settings mirror write is interrupted

- Given a user already has a settings mirror JSON file
- When a settings update attempts to persist the mirror file
- And the write is interrupted before the replacement file is complete
- Then the settings update reports the write failure
- And the previous settings mirror JSON file remains readable and unchanged

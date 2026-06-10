# Web Config Delta Spec

## Modified Requirements

### Requirement: Example Environment Must Use Supported Data Root Key

The tracked Web example environment file must document `DATA_ROOT`, matching
the server config parser and runtime path helpers.

#### Scenario: Contributor validates the Web example env file

- Given the tracked `apps/web/.env.example`
- When the example is inspected by tests
- Then it contains `DATA_ROOT`
- And it does not contain the unsupported `DATA_DIR` key

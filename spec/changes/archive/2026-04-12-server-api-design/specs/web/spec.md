# Delta for Server API Design

## ADDED Requirements

### Requirement: Web REST API Surface

The web product SHALL expose a REST API surface for its supported resources and authentication workflows.

#### Scenario

- GIVEN a browser client or integration calls PromptHub Web
- WHEN the relevant feature is supported on the web surface
- THEN the system exposes a consistent HTTP endpoint with auth and resource semantics

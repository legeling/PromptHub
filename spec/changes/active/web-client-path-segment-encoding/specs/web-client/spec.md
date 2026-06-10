# Web Client API Delta Spec

## Modified Requirements

### Requirement: Client API Path Segments Must Be Encoded

The Web client API wrappers MUST encode dynamic route path segments before
dispatching requests.

#### Scenario: Prompt ID contains path-significant characters

- Given client code calls a prompt wrapper with an ID containing `/`, `?`, or `#`
- When the wrapper builds the request URL
- Then the ID is encoded as one path segment
- And the generated URL does not reinterpret the ID as path, query, or fragment
  syntax

#### Scenario: Skill ID contains path-significant characters

- Given client code calls a skill wrapper with an ID containing `/`, `?`, or `#`
- When the wrapper builds the request URL
- Then the ID is encoded as one path segment
- And the generated URL preserves the intended route structure

#### Scenario: Desktop bridge entity ID contains path-significant characters

- Given Web runtime desktop bridge code calls prompt, folder, skill, or version
  methods with an ID containing `/`, `?`, or `#`
- When the bridge builds the request URL
- Then every dynamic entity ID is encoded as one path segment
- And the generated URL preserves the intended route structure

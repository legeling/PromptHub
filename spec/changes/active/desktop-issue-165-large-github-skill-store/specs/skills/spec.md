# Skills Spec

## Modified Requirements

### Requirement: Large GitHub Store Discovery

PromptHub MUST allow remote content responses up to 10MB so large GitHub skill store tree metadata can be fetched without changing the existing discovery flow.

#### Scenario: GitHub recursive tree exceeds the old cap but fits the new cap

- **Given** a GitHub skill store repository with a recursive tree payload larger than 5MB
- **And** the payload is no larger than 10MB
- **When** PromptHub loads the store
- **Then** the remote fetch request is allowed
- **And** PromptHub discovers `SKILL.md` files from the recursive tree response.

#### Scenario: Remote content exceeds the new cap

- **Given** any remote response larger than 10MB
- **When** PromptHub fetches the remote content
- **Then** the request fails with `Remote content exceeds size limit`.

#### Scenario: Unified cap applies across URL shapes

- **Given** a raw GitHub file, normal GitHub API response, non-recursive tree request, recursive tree request, or third-party URL
- **When** PromptHub chooses the remote fetch cap
- **Then** it uses the same 10MB cap.

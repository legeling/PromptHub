# Web API Delta Spec

## Modified Requirements

### Requirement: Prompt tag mutation payloads must respect prompt tag bounds

Prompt tag rename and delete APIs MUST reject empty or oversized tag values
using the same per-tag boundary as prompt create/update metadata.

#### Scenario: Rename tries to write an oversized tag

Given an authenticated user has a prompt tagged `rename-me`
When the user renames `rename-me` to a tag longer than the prompt tag limit
Then the API returns `422 VALIDATION_ERROR`
And the prompt still contains `rename-me`.

#### Scenario: Delete receives an oversized tag

Given an authenticated user has prompt tags
When the user sends an oversized tag to the delete-tag API
Then the API returns `422 VALIDATION_ERROR`
And the prompt tags remain unchanged.

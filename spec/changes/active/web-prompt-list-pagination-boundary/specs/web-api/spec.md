# Web API Delta Spec

## Modified Requirements

### Requirement: Prompt List Pagination Total Must Reflect Filtered Matches

`GET /api/prompts` must report `pagination.total` as the number of prompts that
match the requested scope and filters before `limit` and `offset` are applied.

#### Scenario: Page size is smaller than filtered result count

- Given an authenticated user has three private prompts that match a tag filter
- When the user requests `GET /api/prompts?scope=private&tags=paged&limit=2`
- Then the response contains two prompt items
- And `pagination.total` is `3`
- And `pagination.limit` is `2`
- And `pagination.offset` is `0`

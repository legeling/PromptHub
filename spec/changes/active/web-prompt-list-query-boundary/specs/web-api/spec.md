# Web API Delta Spec

## Modified Requirements

### Requirement: Prompt List Query Filters Must Be Bounded

`GET /api/prompts` must reject oversized list query filters before calling the
prompt list service.

#### Scenario: Keyword exceeds the allowed length

- Given an authenticated user requests `GET /api/prompts`
- When the `keyword` query value exceeds the allowed length
- Then the response status is `422`
- And the response code is `VALIDATION_ERROR`
- And the error message identifies `keyword`

#### Scenario: Tag filter contains too many entries

- Given an authenticated user requests `GET /api/prompts`
- When the comma-separated `tags` filter contains more than 50 non-empty entries
- Then the response status is `422`
- And the response code is `VALIDATION_ERROR`
- And the error message says `tags must contain at most 50 entries`

### Requirement: Prompt List Tag Filters Preserve Literal Tag Values

`GET /api/prompts` must support exact tag filtering for tags containing commas
without breaking the legacy comma-separated `tags` query format.

#### Scenario: Repeated literal tag filter contains a comma

- Given an authenticated user has one prompt tagged `legal,review`
- And another prompt tagged with separate `legal` and `review` tags
- When the user lists prompts with `tag=legal%2Creview`
- Then only the prompt with the literal `legal,review` tag is returned

#### Scenario: Legacy comma-separated tag filter remains supported

- Given an authenticated user has a prompt tagged with `legal` and `review`
- When the user lists prompts with `tags=legal,review`
- Then the prompt is matched by both legacy tag filter entries

### Requirement: Prompt List Query Efficiency

`GET /api/prompts` must return visible prompts without issuing per-prompt
detail lookups after the visible list query.

#### Scenario: Listing multiple visible prompts

- Given a user has multiple visible private and shared prompts
- When the Web prompt service lists prompts for that user
- Then the service returns the same prompt payload shape as before
- And the database read path does not add one or more extra detail queries per
  returned prompt

#### Scenario: Listing a page of matching prompts

- Given a user has more visible matching prompts than the requested page size
- When the Web prompt service lists prompts with `limit` and `offset`
- Then the service returns the same page and filtered total as before
- And the database read path applies pagination before returning prompt rows to
  application memory

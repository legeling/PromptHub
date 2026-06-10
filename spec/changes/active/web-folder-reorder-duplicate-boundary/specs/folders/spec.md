# Folder Reorder Duplicate Boundary

## Modified Requirements

### Requirement: Folder reorder ids must be unique

`PUT /api/folders/reorder` MUST reject any payload whose `ids` array contains the same folder id more than once.
The same route MUST reject oversized reorder payloads before loading folder rows:
the `ids` array must contain at most 500 entries and each id must be at most
200 characters.

#### Scenario: Duplicate folder ids are rejected without mutation

- Given an authenticated user owns two private folders
- When the user submits `ids` with one folder id repeated
- Then the API responds with `422 VALIDATION_ERROR`
- And the error message identifies that folder reorder ids must be unique
- And the existing folder order remains unchanged

#### Scenario: Valid private reorder remains accepted

- Given an authenticated user owns two private folders
- When the user submits each id once in a new order
- Then the API responds with success
- And the folders are listed in the requested order

#### Scenario: Oversized reorder payload is rejected at the route boundary

- Given an authenticated user submits a folder reorder payload with more than
  500 ids
- Or any id exceeds 200 characters
- When PromptHub validates the request
- Then the API responds with `422 VALIDATION_ERROR`
- And folder rows are not loaded for the invalid payload

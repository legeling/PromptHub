# Web API Delta Spec

## Modified Requirements

### Requirement: Prompt folder references respect visibility and owner boundaries

Normal Web prompt create and update APIs MUST validate any supplied `folderId`
before storing the prompt.

#### Scenario: Private prompt uses another user's private folder

Given user A owns a private folder
When user B creates or updates a private prompt with that folder id
Then the API returns `404 NOT_FOUND`
And no prompt owned by user B is stored with user A's private folder id.

#### Scenario: Private prompt uses a shared folder

Given an admin owns a shared folder
When a user creates or updates a private prompt with that shared folder id
Then the API returns `422 VALIDATION_ERROR`
And the prompt is not stored under the shared folder.

#### Scenario: Shared prompt uses a private folder

Given an admin owns a private folder
When the admin creates or updates a shared prompt with that private folder id
Then the API returns `422 VALIDATION_ERROR`
And the prompt is not stored under the private folder.

#### Scenario: Prompt copy changes ownership boundary

Given a user can read a shared prompt whose folder is shared
When that user copies the prompt into their private library
Then the copied prompt is private, owned by that user, and does not retain an
invalid shared folder reference.

### Requirement: Prompt media references use safe filenames

Normal Web prompt create and update APIs MUST validate `images` and `videos`
entries with the shared media filename safety rules before storing the prompt.

#### Scenario: Prompt create includes unsafe image or video names

Given an authenticated user creates a prompt
When `images` or `videos` includes traversal, path separators, empty names, or
control characters
Then the API returns `422 VALIDATION_ERROR`
And the prompt is not stored with that unsafe media reference.

#### Scenario: Prompt update includes unsafe media names

Given an existing prompt has safe media references
When the user updates `images` or `videos` with an unsafe filename
Then the API returns `422 VALIDATION_ERROR`
And the existing safe media references remain unchanged.

### Requirement: Prompt metadata arrays are bounded

Normal Web prompt create, update, and direct-insert APIs MUST validate prompt
metadata array counts and string lengths before storing the prompt.

#### Scenario: Prompt create includes oversized metadata arrays

Given an authenticated user creates a prompt
When `tags`, `variables`, variable `options`, `images`, or `videos` exceed the
supported item count or per-item length
Then the API returns `422 VALIDATION_ERROR`
And the malformed prompt is not stored.

#### Scenario: Valid bounded prompt metadata persists

Given an authenticated user creates a prompt with valid tags, variables, images,
and videos
When the user reads the prompt
Then those metadata arrays round-trip unchanged.

### Requirement: Prompt tag meta APIs respect actor scope

The Web prompt tag list, rename, and delete APIs MUST operate within the
authenticated actor's prompt visibility and write boundaries.

#### Scenario: User lists prompt tags

Given user A and user B each own private prompts with different tags
And an admin has a shared prompt with a shared tag
When user A lists prompt tags
Then the response includes user A's private tags and shared prompt tags
And it does not include user B's private tags.

#### Scenario: User renames or deletes prompt tags

Given user A and user B both use the same tag on private prompts
When user A renames or deletes that tag through the tag meta API
Then only user A's private prompt tags are changed
And user B's private prompt tags remain unchanged.

### Requirement: Prompt version routes respect the prompt id boundary

Prompt version operations nested under `/api/prompts/:id` MUST only mutate
versions that belong to the prompt identified by `:id`.

#### Scenario: Version delete uses a different prompt route

Given a user owns prompt A and prompt B
And prompt B has a saved version
When the user calls `DELETE /api/prompts/{promptA}/versions/{promptBVersion}`
Then the API returns `404 NOT_FOUND`
And prompt B's version is not deleted.

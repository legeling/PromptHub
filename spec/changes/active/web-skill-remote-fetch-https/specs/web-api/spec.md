# Web API Delta Spec

## Modified Requirements

### Requirement: Remote Skill fetch URLs must use HTTPS

The Web remote Skill fetch API MUST reject non-HTTPS remote Skill URLs before
fetching upstream content or importing a Skill into the library.

#### Scenario: HTTP remote Skill URL is submitted

Given an authenticated user submits `POST /api/skills/fetch-remote`
When the request URL uses `http:`
Then the API returns `422 VALIDATION_ERROR`
And no upstream fetch is attempted
And no Skill is imported into the user's library.

### Requirement: Remote Skill imports default to writable visibility

When `POST /api/skills/fetch-remote` imports a fetched Skill and the request
does not specify `visibility`, the API MUST choose a visibility that the actor
can write. Admin users keep the shared default; normal users default to
`private`.

#### Scenario: Normal user imports a remote Skill without visibility

Given an authenticated non-admin user submits `POST /api/skills/fetch-remote`
And `importToLibrary` is true
And the request omits `visibility`
When the remote Skill is fetched successfully
Then the API imports the Skill into the user's private library
And returns `201` with `visibility = private`.

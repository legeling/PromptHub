# Web API Delta Spec

## Modified Requirements

### Requirement: Pulled Sync Media Writes Must Not Expose Partial Files

Pulled sync media writes must use a same-directory temporary file and publish
the final media filename only after the full payload has been written.

#### Scenario: Pulled sync media write is interrupted

- Given a sync import contains pulled media payloads
- When writing one pulled media file is interrupted before the full payload is
  written
- Then the sync media writer reports the write failure
- And the final media filename is not created with partial content

### Requirement: Sync Import Must Keep Records And Pulled Media Consistent

Direct sync import and WebDAV pull import must not leave imported database
records or rule workspace files when pulled media cannot be written. They must
also roll back pulled media files if a later import step fails.

#### Scenario: Pulled media write fails

- Given a sync import payload contains prompts, folders, rules, and pulled media
- When pulled media writing fails
- Then the sync import returns `422 VALIDATION_ERROR`
- And the imported prompts, folders, rules, and skills are not visible in the
  next sync export

#### Scenario: Later import step fails after pulled media was written

- Given pulled media has been written for a sync import
- When a later import step fails
- Then the sync import returns `422 VALIDATION_ERROR`
- And the pulled media files written for that failed import are removed or
  restored to their previous content

## Modified Requirements

### Requirement: Failed imports must not leave partial database records

The Web import workflow MUST roll back database records written by the import
when a write-time failure occurs after earlier records have been inserted.

#### Scenario: Import fails during later writes

Given an authenticated user imports a payload containing folders and prompts
When a later import write fails
Then the API returns an error
And the folders and prompts from that import are not visible in a subsequent
export.

### Requirement: Failed imports must not leave pulled media files

The Web import workflow MUST validate imported media before database writes and
MUST write pulled media files only after database import succeeds.

#### Scenario: Import fails after media validation

Given an authenticated user imports a payload containing prompt media
When the database import fails after media validation
Then the API returns an error
And the pulled media file from that import is not present in the user's media
workspace.

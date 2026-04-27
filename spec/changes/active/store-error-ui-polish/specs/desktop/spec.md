# Delta for Desktop Warning And Store Error UI

## MODIFIED Requirements

### Requirement: Preview Update Channel Messaging

The desktop About settings page MUST keep preview-update risk acknowledgement clear without disrupting the visual rhythm of the settings card layout.

#### Scenario

- GIVEN the user has already enabled preview updates
- WHEN they view the About settings page
- THEN the page shows a lightweight inline preview-channel note
- AND the strongest risk/backup warning remains in the blocking confirmation step before opt-in

### Requirement: Remote Store Rate-Limit Guidance

Desktop remote-store error states MUST only present actionable guidance that exists in the product.

#### Scenario

- GIVEN the remote Skill Store load fails because GitHub API rate limiting was reached
- WHEN the error is shown to the user
- THEN the UI recommends retrying later or switching networks
- AND it does not direct the user to a nonexistent GitHub token setting

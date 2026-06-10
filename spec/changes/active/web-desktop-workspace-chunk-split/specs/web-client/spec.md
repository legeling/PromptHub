# Web Client Delta Spec

## Modified Requirements

### Requirement: Authenticated Workspace Bundle

The web client SHALL keep the setup/login shell separate from the authenticated
desktop workspace bundle, and SHOULD avoid including desktop-only startup,
update, recovery, and backup import modal surfaces in the authenticated
workspace initial chunk when those surfaces are not open.
AI execution helpers used by prompt testing, image generation, multi-model
comparison, and skill translation SHOULD also stay out of the authenticated
workspace initial chunk until the user invokes those actions.

#### Scenario: Web runtime loads authenticated workspace

- **GIVEN** the user opens the self-hosted web authenticated workspace
- **WHEN** the web build loads `DesktopWorkspace`
- **THEN** desktop update, close, recovery, and backup import confirmation
  dialogs are not eagerly evaluated before the web runtime renders the
  workspace.
- **AND** the AI service implementation is not eagerly evaluated solely because
  the prompt workspace or skill navigation store loaded.

#### Scenario: Desktop runtime starts normally

- **GIVEN** the Electron desktop renderer starts
- **WHEN** the user or application opens update, close, recovery, or backup
  import confirmation dialogs
- **THEN** each dialog is lazy-loaded inside a Suspense boundary and renders
  with the same props and behavior as before.

#### Scenario: User runs an AI action

- **GIVEN** the prompt workspace is already visible
- **WHEN** the user starts single-model testing, image generation, multi-model
  comparison, generated-image download, or skill translation
- **THEN** the relevant AI or generated-image helper module is loaded on demand
  and the existing action behavior is preserved.

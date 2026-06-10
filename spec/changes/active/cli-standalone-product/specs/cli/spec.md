# CLI Standalone Spec Delta

## Added Requirements

### Requirement: CLI as Independent Product

PromptHub MUST provide a standalone CLI product under `apps/cli` that can be installed and executed without requiring the desktop application binary or Electron runtime.

#### Scenario: CLI bootstraps shared workspace

- **WHEN** the user runs the standalone CLI with a valid PromptHub workspace
- **THEN** the CLI resolves the same workspace layout as desktop
- **AND** it reads and writes the same PromptHub data directories.

### Requirement: Shared Runtime Path Contract

PromptHub MUST keep runtime path resolution in a shared module consumed by both desktop and CLI.

#### Scenario: Desktop and CLI resolve the same skills directory

- **WHEN** desktop and CLI run against the same appData / userData roots
- **THEN** `skills`, `rules`, `prompts`, and asset directories resolve to the same absolute paths.

### Requirement: Desktop Stops Shipping a CLI Entry

PromptHub desktop MUST stop exposing and packaging any CLI entry once `apps/cli` becomes the standalone CLI product.

#### Scenario: Desktop package no longer installs or launches CLI entrypoints

- **WHEN** the desktop application is installed or launched
- **THEN** it does not install a `prompthub` shell wrapper or desktop CLI bin
- **AND** desktop only surfaces standalone CLI guidance in Settings.

### Requirement: Desktop Settings Must Expose Standalone CLI Installation

PromptHub desktop MUST surface the standalone CLI through a dedicated Settings entry instead of burying it inside the About page, and the install action must use a real release artifact that users can install with npm or pnpm.

#### Scenario: User opens the CLI settings page

- **WHEN** the user navigates to desktop Settings
- **THEN** they can open a dedicated `PromptHub CLI` section
- **AND** that section shows whether the `prompthub` command is already installed
- **AND** it shows the exact install source and one-click install command based on the current release tarball

#### Scenario: User installs CLI from desktop Settings

- **GIVEN** the current release includes a CLI tarball asset
- **WHEN** the user clicks one-click install with npm or pnpm
- **THEN** desktop invokes the corresponding global package-manager install command against the GitHub release tarball
- **AND** it does not require building the CLI from repository source code inside the settings flow

### Requirement: CLI Must Manage AI Providers, Models, And Routes

PromptHub CLI MUST expose the same stable AI configuration concepts used by the desktop model workbench: provider endpoints, model entries, and model routes.

#### Scenario: User configures a vision route from CLI

- **WHEN** the user adds a provider, adds a chat model with `--vision`, and runs `prompthub ai route-set visionText <model-id>`
- **THEN** the CLI stores the route in the shared AI config file
- **AND** `prompthub ai routes` reports the configured model.
- **AND** desktop loads that provider, model, and route through its settings bootstrap.

#### Scenario: User assigns an incompatible model to a route

- **WHEN** the user assigns a non-vision chat model to `visionText`
- **THEN** the CLI rejects the change with `ROUTE_CAPABILITY_MISMATCH`
- **AND** it does not write an invalid route.

#### Scenario: User deletes a model

- **WHEN** the user deletes a model that belongs to a provider
- **THEN** the model is removed
- **AND** routes referencing that model are cleared
- **AND** the provider remains configured until explicitly deleted.

### Requirement: CLI Skill Scan Table Output Must Tolerate Partial Safety Reports

PromptHub CLI MUST render `skill scan` table output without crashing when a scanned skill carries a partial or legacy safety report.

#### Scenario: Safety report has no findings array

- **GIVEN** a scanned skill includes a safety report level but no `findings` array
- **WHEN** the user runs `prompthub --output table skill scan <path>`
- **THEN** the CLI renders the skill row
- **AND** it reports the finding count as `0`
- **AND** it does not exit with an internal error.

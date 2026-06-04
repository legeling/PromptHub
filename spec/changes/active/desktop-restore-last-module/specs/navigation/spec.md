# Navigation Spec

## Modified Requirements

### Requirement: Restore Last Home Module

The desktop shell MUST restore the last active home module after reload or app restart.

#### Scenario: Last module was Skills

- **Given** the persisted UI state stores `appModule: "skill"`
- **When** the renderer starts
- **Then** the active app module is `skill`
- **And** the compatibility `viewMode` is `skill`

#### Scenario: Last module was Rules

- **Given** the persisted UI state stores `appModule: "rules"`
- **When** the renderer starts
- **Then** the active app module is `rules`
- **And** the compatibility `viewMode` remains `prompt`

#### Scenario: Persisted module is invalid

- **Given** the persisted UI state contains an unknown module
- **When** the renderer starts
- **Then** the active app module falls back to `prompt`
- **And** the compatibility `viewMode` falls back to `prompt`

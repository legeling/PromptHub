# Skill Store Batch Operations

## Added Requirements

### Requirement: Batch Store Mode

The desktop Skill Store MUST provide an explicit batch management mode for the currently visible store catalog.

#### Scenario: Selecting visible store entries

- Given the user is viewing a Skill Store source with filtered catalog entries
- When batch mode is enabled and the user selects visible entries
- Then selection MUST be keyed by stable store identity, not by rendered row index
- And selection MUST survive virtualized row recycling

### Requirement: Batch Store Operations

The desktop Skill Store MUST support batch install, update, and remove actions for selected store entries.

#### Scenario: Batch install skips imported entries

- Given selected store entries include already imported Skills and not-yet-imported Skills
- When the user starts batch install
- Then only not-yet-imported Skills MUST be installed
- And already imported Skills MUST be skipped without failure

#### Scenario: Batch remove only affects My Skills

- Given selected store entries include imported and non-imported Skills
- When the user confirms batch removal
- Then only imported entries that can be matched to a local My Skill MUST be removed
- And remote store content MUST NOT be deleted.

### Requirement: Per-Skill Pending State

Batch operations MUST keep independent pending state for each affected store Skill.

#### Scenario: Detail and list share pending state

- Given a store Skill is pending due to a batch operation
- When the user opens its detail
- Then duplicate install or update actions MUST remain disabled until that Skill operation completes.

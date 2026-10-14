# Pi Agent Separation Requirements

## `FR-PI-001`: Distinct Product Identity

PromptHub MUST expose Pi and Oh My Pi as two built-in Agents with unique ids,
names, executables and default roots.

### Scenario: Both products are installed

- Given `~/.pi/agent` and `~/.omp/agent` both exist
- When PromptHub detects built-in Agents
- Then both `pi` and `oh-my-pi` are returned
- And neither entry replaces or deduplicates the other

## `FR-PI-002`: Native Pi Assets

The Pi Agent MUST derive Skills, extensions, global instructions and editable
non-secret configuration from `~/.pi/agent` or its resolved override.

The Pi Agent MUST distinguish native Pi 1.2.0 user/project MCP files from
optional adapter/shared candidates, following `FR-AGENT-111` in the current
workbench requirements. Configuration writing remains partial until native
runtime consumption is verified; it MUST NOT execute/install an adapter.

## `FR-PI-003`: Bounded Read-Only Sessions

PromptHub MUST list and read Pi JSONL sessions from the Pi session root using
the existing bounded, symlink-safe, lazy transcript behavior. Pi results MUST
retain `agentId: pi`, use the `pi` executable for resume, and never read Oh My
Pi's default root.

## `FR-PI-004`: Non-Secret Model Selection

PromptHub MUST inspect and update Pi's `defaultProvider` and `defaultModel`
selection in `settings.json` without exposing authentication data. The main-only
credential/catalog boundary is defined in the workbench Pi model catalog design.
Writes MUST preserve unrelated JSONC fields, use backup plus atomic
replacement, detect concurrent changes and verify the persisted result.

## `FR-PI-005`: Official Pi Identity Asset

PromptHub MUST render Pi with a bundled copy of the official Pi badge rather
than a generic brand fallback. The asset MUST be addressable from the renderer
platform-assets directory, remain available offline, and have provenance
recorded in the stable Agent platform reference.

### Scenario: Pi is shown in the Agent workbench

- Given the built-in platform id is `pi`
- When the Agent workbench renders its platform icon
- Then the rendered image source ends in `pi.svg`
- And the bundled SVG contains the official Pi badge geometry
- And Pi's fallback metadata uses the semantic Lucide `Pi` icon, not
  `CircleDot`

## `FR-PI-006`: Official Oh My Pi Identity Asset

PromptHub MUST render Oh My Pi with the official plugin-connected mark from
the upstream repository rather than the generic terminal fallback. The
bundled transparent mark MUST have a theme-safe dark backing so its light mark
and orange connector remain legible in both application themes.

### Scenario: Oh My Pi is shown in the Agent workbench

- Given the built-in platform id is `oh-my-pi`
- When the Agent workbench renders its platform icon
- Then the rendered image source ends in `oh-my-pi.svg`
- And the bundled SVG contains the official plugin connector
- And the image has the dark backing required for light-theme contrast

## Traceability

| Requirement | Design       | Verification  | Task       |
| ----------- | ------------ | ------------- | ---------- |
| `FR-PI-001` | `DES-PI-001` | `TEST-PI-001` | `T-PI-001` |
| `FR-PI-002` | `DES-PI-002` | `TEST-PI-002` | `T-PI-002` |
| `FR-PI-003` | `DES-PI-003` | `TEST-PI-003` | `T-PI-003` |
| `FR-PI-004` | `DES-PI-004` | `TEST-PI-004` | `T-PI-004` |
| `FR-PI-005` | `DES-PI-005` | `TEST-PI-005` | `T-PI-005` |
| `FR-PI-006` | `DES-PI-006` | `TEST-PI-006` | `T-PI-006` |

# Desktop Network Settings Spec

## Added Requirements

### Requirement: Global proxy settings are configurable

PromptHub Desktop MUST expose a global network proxy setting with these modes:

- `system`: use the operating system proxy for Electron session traffic and
  preserve startup process proxy environment variables for Node/Git traffic.
- `direct`: disable PromptHub-managed proxy routing.
- `manual`: route supported network traffic through a user-entered HTTP, HTTPS,
  or SOCKS5 proxy.

#### Scenario: Manual proxy configuration

- **Given** the user opens Settings
- **When** they select manual proxy mode and enter protocol, host, and port
- **Then** the settings store persists a normalized proxy configuration
- **And** the main process receives the same normalized configuration

#### Scenario: Update mirror source configuration

- **Given** the user opens Settings
- **When** they open Network Settings
- **Then** the existing update mirror toggle is available there
- **And** About Settings does not duplicate the mirror source control

#### Scenario: Invalid manual fields

- **Given** stored settings contain an invalid proxy mode, protocol, host, port,
  or bypass value
- **When** settings hydrate
- **Then** PromptHub normalizes to a safe default without throwing

### Requirement: Main process applies proxy settings centrally

The desktop main process MUST apply proxy settings through one network proxy
service instead of per-feature ad hoc state.

#### Scenario: Electron session proxy

- **Given** the main process receives proxy settings
- **When** the mode is `manual`
- **Then** `session.defaultSession.setProxy` is called with fixed server rules
  derived from the manual proxy URL

#### Scenario: Node-owned HTTP(S) fetches

- **Given** the mode is `manual`
- **When** Skill/MCP/Plugin remote HTTP(S) requests use PromptHub-owned request
  helpers
- **Then** the request helper uses a proxy-capable agent

### Requirement: Git imports can use the same manual proxy

PromptHub-managed Git clone and remote listing calls MUST inherit proxy
environment variables derived from the active manual proxy setting.

#### Scenario: Manual proxy is enabled before Git clone

- **Given** manual proxy mode is active
- **When** PromptHub spawns `git clone`
- **Then** the spawned process receives `HTTP_PROXY`, `HTTPS_PROXY`, and
  `ALL_PROXY` values derived from the proxy setting

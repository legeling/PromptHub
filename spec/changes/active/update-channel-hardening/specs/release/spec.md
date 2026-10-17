# Release Delta Spec

## Added Requirements

### Requirement: Preview builds must use semver prerelease versions

Desktop preview builds must use semver prerelease versions such as `0.5.6-beta.1` instead of sharing the same plain version number with the eventual stable release.

#### Scenario: Maintainer prepares a desktop preview release

- Given a desktop build intended for prerelease testing
- When the build is packaged and tagged
- Then its app version contains a prerelease component like `beta.N`
- And the corresponding GitHub release is marked as prerelease

#### Scenario: Maintainer republishes a historical beta below stable

- Given a historical preview build previously shared the same plain version as stable
- When the maintainer republishes it as a backfilled prerelease such as `0.5.5-beta.1`
- Then the docs explicitly describe it as a historical beta / manual-download testing build
- And stable-facing download links remain pointed at the stable release `0.5.5`

### Requirement: Installed preview builds default to the preview update lane

Desktop clients running a prerelease app version must default to the preview update lane unless the user explicitly changed the setting before.

#### Scenario: User launches a prerelease desktop build for the first time

- Given the installed app version contains a prerelease component
- And the user has not explicitly chosen a different update lane before
- When PromptHub hydrates settings on startup
- Then the effective update lane defaults to preview

### Requirement: Update checks must never present downgrade candidates as available updates

Desktop update checks must filter out remote versions that are less than or equal to the currently running version.

#### Scenario: Preview build checks the stable lane

- Given a user is running a newer preview build than the latest stable release
- When PromptHub checks for updates
- Then the UI does not show the older stable release as an available update

### Requirement: Preview checks must not depend on missing custom preview manifests

Desktop preview update checks must use a provider / manifest strategy that exists in released artifacts and is covered by CI verification.

#### Scenario: User checks updates on the preview lane

- Given the desktop client is configured for preview updates
- When it checks for updates
- Then it does not request a nonexistent manifest like `preview.yml`
- And CI guarantees the expected update metadata exists for the chosen strategy

### Requirement: Background update checks must not override a visible available-update state

Desktop background update polling must not force the UI back into a transient checking state while the user already has a visible available or downloaded update.

#### Scenario: User has a pending available update in the UI

- Given PromptHub already detected an available update
- When a scheduled background check runs again
- Then the top bar indicator and update dialog do not start flickering between `available` and `checking`

### Requirement: Update dialog content must stay readable within desktop viewport constraints

Desktop update dialogs must keep long release notes and upgrade guidance inside a bounded scrollable content area instead of letting the modal overflow the window.

#### Scenario: User opens an available update with long release notes

- Given PromptHub has detected an available update with markdown release notes
- When the user opens the update dialog
- Then the dialog uses a bounded modal layout that fits within the current desktop viewport
- And release notes scroll inside the content area instead of forcing the whole dialog to overflow

### Requirement: Download-stage UI must not show install-only backup confirmation copy

Desktop update dialogs must keep the `available` state focused on download guidance and reserve install acknowledgement UI for the `downloaded` state where installation can actually start.

#### Scenario: User views an available update before downloading

- Given PromptHub detected an available update that has not been downloaded yet
- When the update dialog renders the `available` state
- Then it may still expose the manual backup shortcut
- But it does not require the installation acknowledgement checkbox or install-only warning copy yet

### Requirement: Homebrew-managed updates must not show in-app install gating

Desktop update dialogs must not show manual-backup install gates for Homebrew-managed builds when the user cannot complete the upgrade inside PromptHub.

#### Scenario: Homebrew user sees an available update

- Given PromptHub is running from a Homebrew-managed installation
- And PromptHub detects an available update
- When the update dialog renders the `available` state
- Then it guides the user to Homebrew / Releases instead of showing the in-app installation backup gate

### `FR-UPDATER-005`: Signed direct macOS builds must support in-app updates

Desktop clients installed directly from PromptHub's signed and notarized macOS
release artifacts must download the matching ZIP update through
`electron-updater` and restart into the update without asking users to mount a
DMG or copy an application bundle manually.

#### Scenario: Direct-install macOS user installs a downloaded update

- Given PromptHub is running from a direct macOS installation rather than Homebrew
- And the selected release includes a signed, notarized ZIP update artifact for the current architecture
- When the user downloads and confirms installation in the update dialog
- Then PromptHub creates its pre-upgrade snapshot
- And invokes the native updater restart path
- And the dialog presents the action as an in-app installation rather than opening Downloads

#### Scenario: Homebrew macOS user installs a downloaded update

- Given PromptHub is running from a Homebrew Caskroom
- When the user requests an update
- Then PromptHub does not download or replace the application through `electron-updater`
- And it continues to direct the user to Homebrew

### `FR-UPDATER-006`: One manual check must keep one authoritative dialog state

The desktop update dialog must render only updater states produced by the real
main-process check. Development builds may report that update checks are
disabled, but they must not schedule simulated available, not-available, or
downloading states after the user's request.

#### Scenario: Developer opens the update dialog once

- Given PromptHub is running unpackaged in development mode
- When the user clicks Check updates once
- Then one update dialog reports that the development check is unavailable
- And no delayed demo status replaces that result or appears as another update prompt

### `FR-UPDATER-007`: Update notes must retain published release content during download

When the preview lookup identifies an exact published GitHub Release, the
desktop updater must present that Release body instead of replacing it with the
packaged full changelog. Safe Markdown headings, emoji, links, and images must
remain readable while untrusted image origins stay blocked.

#### Scenario: User reviews and downloads a rich preview release

- Given the exact preview Release body contains headings, emoji, badge images, and links
- When PromptHub shows the available update and begins downloading it
- Then the release notes remain visible throughout the download
- And the progress bar uses the content width and exposes one percentage
- And only approved HTTPS image origins load inside the renderer

### `FR-UPDATER-008`: Download source changes must restart visibly and remain recoverable

The download UI must expose automatic, official, and mirror source modes.
Automatic mode tries the official source first and then a bounded mirror list.
Network settings exposes the existing update-mirror toggle and a custom select
for automatic mirror selection or one of the four built-in mirrors. Selecting
a specific mirror restricts mirror attempts to that endpoint; automatic mirror
selection retains the bounded fallback list. Official mode never uses a mirror.
Both background/manual checks and downloads carry the selection. This setting
applies to desktop application updates, not CLI, Skill, or package registries.
The existing SQLite renderer-settings owner persists `updateMirrorSource` with
`useUpdateMirror`; no new table or migration is required. Missing or unknown IDs
normalize to `automatic`, preserving legacy settings and boolean IPC requests.
Disabling mirror acceleration retains the selected ID. Existing transactional
settings persistence and recovery apply; older versions ignore the added key.
Changing source during a download must cancel the active transfer, refresh
metadata for the selected source, reset visible progress to zero, and start a
new verified download. The user must also retain a manual Releases download
action throughout the transfer.

#### Scenario: User switches a stalled download to a mirror

- Given an update is downloading from the automatic or official source
- When the user selects the mirror source
- Then PromptHub cancels the active transfer before starting another one
- And the progress resets instead of retaining bytes from the previous source
- And transferred size, total size, and current speed remain visible
- And the GitHub Releases manual-download action remains available

### `FR-UPDATER-009`: macOS must surface detected updates in the menu bar

When the authoritative updater reports an available or downloaded version,
the macOS menu bar must switch to a PromptHub Template Image with an update
badge. Its native menu must replace the generic check action with the detected
version and open the existing update dialog when selected. A not-available
result restores the normal icon and generic action.

#### Scenario: User sees an available update without opening PromptHub

- Given PromptHub is running with its macOS menu bar item enabled
- When the updater reports version `1.2.3` as available
- Then the menu bar icon shows a monochrome upward update badge
- And the menu contains a localized `Version 1.2.3 available` action
- And selecting it opens the existing update dialog

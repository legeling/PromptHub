# Release Delta Spec

Current delivery target (2026-10-19): `0.6.1`, following the already published
stable `0.6.0`. The current dialog, localized release notes and download-feedback
fixes belong to this next release. Preview screenshots show `0.6.0 → 0.6.1`;
they do not establish that `0.6.1` has been published.

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

The stable channel accepts published stable releases only. The preview channel
includes both published stable and prerelease builds and selects the highest
SemVer version, independently of API ordering. Drafts and invalid versions are
excluded. `0.6.0` supersedes `0.6.0-beta.2`; `0.7.0-beta.1` must not downgrade to
`0.6.0`. Installing a stable release does not change an explicitly chosen channel.

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

Desktop update dialogs use a version/source sidebar and a release-notes pane.
The header and action footer stay fixed; only the notes pane scrolls on desktop.
At narrow widths, both columns stack into one content scroller. No nested
vertical scrollers are allowed. Content uses the selected release's real notes,
not invented summaries. Homebrew instructions remain in the content pane.

#### Scenario: User opens an available update with long release notes

- Given PromptHub has detected an available update with markdown release notes
- When the user opens the update dialog
- Then the dialog uses a bounded modal layout that fits within the current desktop viewport
- And release notes scroll inside the content area instead of forcing the whole dialog to overflow

### Requirement: Manual backup export is optional during updates

Available and downloaded updates offer an optional full backup export. Neither
manual backup history nor an acknowledgement checkbox gates installation.
The main process must still create its automatic local snapshot before invoking
the installer; snapshot failure prevents installation and remains visible.

#### Scenario: User views an available update before downloading

- Given PromptHub detected an available update that has not been downloaded yet
- When the update dialog renders the `available` state
- Then it may still expose the manual backup shortcut
- And neither download nor installation requires an acknowledgement checkbox

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

Release notes must belong to the selected version. An exact GitHub Release body
or that version's manifest notes supplies the content; the installed client's
local CHANGELOG is not a source for a future release. A versioned changelog must
contain the exact target section; missing sections show a localized unavailable
message and the Releases action, never an older beta or Unreleased content.
Packaging and GitHub Release creation use the same exact-version extractor and
fail preparation if the current package version has no CHANGELOG section. Safe
Markdown headings, emoji, links, and images remain readable while untrusted image
origins stay blocked.

The published CHANGELOG keeps bilingual source content: a bilingual category
heading followed by Chinese list entries with one nested English translation per
entry. The renderer selects Chinese for `zh`/`zh-TW`, and English for other UI
languages until corresponding body translations exist. Category labels use all
seven UI locales (features, fixes, improvements, maintenance, security, upgrade
notes, architecture). Switching UI language updates the open notes immediately.
Unpaired content and ordinary nested lists remain intact; links, images and code
retain the existing Markdown safety boundary. Main-process payloads and published
notes remain bilingual. This presentation contract requires no storage migration.

Recognized release categories use a Lucide icon beside the localized heading.
Category headings, entry titles and descriptions have distinct spacing and
typography. Entries with a leading bold title display that title on its own line;
the remaining Markdown content retains its links, code and nesting. Decorative
icons are hidden from assistive technology and colors use existing theme tokens.

#### Scenario: User reads bilingual release notes in their selected language

- Given published notes contain bilingual categories and paired Chinese/English entries
- When the user opens the update dialog or changes the application language
- Then each paired entry displays only the selected language's body
- And categories use localized headings without flattening the published grouping
- And untranslated languages display the English body with localized category labels

#### Scenario: User reviews and downloads a rich preview release

- Given the exact preview Release body contains headings, emoji, badge images, and links
- When PromptHub shows the available update and begins downloading it
- Then the release notes remain visible throughout the download
- And the progress bar uses the content width and exposes one percentage
- And only approved HTTPS image origins load inside the renderer

### `FR-UPDATER-008`: Download source changes must restart visibly and remain recoverable

Clicking Download must immediately enter the visible downloading state, before
IPC completion or the first network byte. The download action must not remain
available for duplicate clicks. Both returned failures and rejected IPC calls
must produce a visible error with the existing manual-download action. A stale
request's failure must not replace a newer source's active transfer.

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

# Desktop Delta Spec

## Modified Requirements

### Update Backup Failure Handling

The desktop update dialog must handle manual pre-upgrade backup failures inside the dialog flow.

#### Scenario: pre-upgrade backup fails

- Given the user clicks the manual backup action before download or install
- When the automatic snapshot or export step fails
- Then the dialog must surface an error state instead of leaking an unhandled promise rejection

### Rules AI Rewrite Contract

The desktop rules rewrite IPC response must continue to include both rewritten content and a non-empty summary string.

#### Scenario: AI rewrite succeeds

- Given a valid rewrite payload and AI response content
- When `rules:rewrite` resolves
- Then the result includes `content`
- And the result includes a human-readable `summary`

### Remote Skill Store Cache Compatibility

The desktop renderer must tolerate remote skill store cache entries from older or malformed persisted state when those entries omit a `skills` array.

#### Scenario: legacy remote store cache is rehydrated

- Given a remote skill store cache entry has `loadedAt` and `error` fields but no `skills` array
- When the sidebar, skill store, skill manager update indicator, or remote store loader reads the cache
- Then the entry is treated as having zero cached skills
- And the renderer does not throw while rendering counts, empty states, loading states, or update indicators
- And valid cache entries with non-empty `skills` arrays still drive counts, update indicators, and cache reuse

### Local Media Protocol Boundary

The desktop local media protocol resolver must only resolve safe media paths for the requested protocol type.

#### Scenario: local media protocol receives an unsafe or mismatched path

- Given a `local-image://` or `local-video://` URL is handled by the desktop app
- When the decoded path contains traversal segments, absolute path markers, control characters, stream separators, malformed percent encoding, or an extension outside the protocol's allowed media type
- Then the resolver returns `null`
- And no filesystem path outside the configured media directory is exposed to the protocol handler

#### Scenario: local media protocol receives a valid media path

- Given a `local-image://` URL with a supported image extension or a `local-video://` URL with a supported video extension
- When the decoded path is relative and all path segments are safe
- Then the resolver returns the resolved path under the configured media directory

### Skill Markdown URL Boundary

The desktop skill markdown URL resolver must not return unsafe protocols for rendered skill links or images.

#### Scenario: skill markdown contains an unsafe absolute URL

- Given skill markdown includes a link or image URL with an unsafe protocol such as `javascript:`, `file:`, or `data:`
- When the desktop renderer resolves that URL for markdown rendering
- Then the resolver returns an empty URL
- And the unsafe protocol is not exposed to the rendered anchor or image element

#### Scenario: skill markdown contains a safe URL

- Given skill markdown includes an HTTPS, HTTP, mailto, or tel link
- Or a safe HTTP/HTTPS image URL or `local-image://` image URL
- When the desktop renderer resolves that URL for markdown rendering
- Then the resolver preserves or resolves the safe URL

### Prompt Markdown URL Boundary

The desktop prompt markdown renderers must not render unsafe link protocols as clickable anchors.

#### Scenario: prompt markdown contains an unsafe link URL

- Given prompt markdown includes a link URL with an unsafe protocol such as `javascript:`, `file:`, or `data:`
- When the desktop renderer renders prompt preview, prompt detail, or prompt edit markdown
- Then the unsafe URL is not assigned to an anchor `href`
- And the link text remains visible as non-clickable text

#### Scenario: prompt markdown contains a safe link URL

- Given prompt markdown includes an HTTPS, HTTP, mailto, tel, or fragment link
- When the desktop renderer renders prompt markdown
- Then the safe URL remains clickable with the existing external-link attributes

### Prompt Source URL Boundary

The desktop prompt source field must only be clickable when it contains a safe external URL.

#### Scenario: prompt source contains an unsafe URL

- Given a prompt source value contains an unsafe protocol such as `javascript:`, `file:`, or `data:`
- When the prompt detail source field is rendered
- Then the source value remains visible
- And it is not rendered as a clickable anchor

#### Scenario: prompt source contains a safe URL

- Given a prompt source value contains an HTTPS, HTTP, mailto, tel, or fragment URL
- When the prompt detail source field is rendered
- Then the source value is rendered as a clickable anchor with the existing external-link attributes

### AI Test Generated Image URL Boundary

The desktop AI test surfaces and generated image download helper must only render, fetch, download, or attach generated image URLs with safe image URL schemes.

#### Scenario: image generation returns unsafe generated image URLs

- Given an image generation provider returns `javascript:`, `file:`, or another unsupported URL for a generated image
- When the AI test workbench or AI settings image-test modal processes the generation result
- Then the unsafe URL is ignored
- And no generated image element or download anchor is rendered for that URL
- And the generic generated-image download helper does not fetch or click unsupported URLs

#### Scenario: image generation returns a safe generated image URL

- Given an image generation provider returns an HTTP, HTTPS, or supported `data:image/*;base64` generated image URL
- When the user views, adds, or downloads that generated image
- Then the renderer uses the normalized safe URL
- And local Prompt image attachment still goes through the existing media save/download APIs

### Skill Source And Store URL Boundary

The desktop skill source metadata and skill store detail view must not expose unsafe explicit URL protocols as clickable links or local filesystem open actions.

#### Scenario: skill source metadata contains an unsafe explicit protocol

- Given an installed skill source value contains an unsafe protocol such as `javascript:`, `file:`, or `data:`
- When the desktop renderer derives source metadata for skill detail, platform, or code panes
- Then the unsafe value is not treated as a remote source
- And it is not treated as a local path that can be opened through Electron

#### Scenario: skill store detail contains unsafe source or store URLs

- Given remote skill store metadata contains an unsafe `source_url` or `store_url`
- When the skill store detail modal renders source metadata
- Then the unsafe value remains visible as text
- And it is not rendered as a clickable anchor

### Skill Icon URL Boundary

The desktop skill icon component must not render unsafe explicit protocols into image sources while preserving supported icon sources.

#### Scenario: skill icon metadata contains an unsafe URL

- Given a skill from local import, remote store metadata, or user editing contains an `icon_url` with an unsafe protocol such as `javascript:`, `file:`, or non-image `data:`
- When the desktop renderer displays that skill through `SkillIcon`
- Then the unsafe value is not assigned to an image `src`
- And the component falls back to the existing emoji, initial, or default icon behavior

#### Scenario: skill icon metadata contains a supported icon source

- Given a skill has an HTTP(S), relative app asset, or supported `data:image/*;base64` icon URL
- When the desktop renderer displays that skill through `SkillIcon`
- Then the supported icon URL remains renderable
- And built-in preset SVG data icons continue to work

### Image Reverse Reference Size Boundary

The desktop image prompt reverse flow must reject oversized dropped or pasted reference images before reading them into renderer memory.

#### Scenario: user drops or pastes an oversized reference image

- Given the image reverse modal is open
- When the user drops or pastes an image file larger than the supported media size limit
- Then the renderer shows a localized error
- And it does not call `arrayBuffer()` on the file
- And it does not call the Electron image save bridge
- And it does not create a preview object URL

#### Scenario: user drops or pastes a supported reference image

- Given the image reverse modal is open
- When the user drops or pastes a supported image within the size limit
- Then the existing image save, preview, and prompt reverse flow continues to work

### Variable AI Test Attachment Boundary

The desktop variable input modal must apply the same AI test image attachment boundary as the primary AI test surfaces.

#### Scenario: user selects unsupported or oversized AI test attachments

- Given the variable input modal is open in AI test mode
- When the user selects files with unsupported image MIME types or files larger than the supported AI test image size limit
- Then the renderer shows localized error feedback
- And it does not create a `FileReader` for those rejected files
- And no rejected file preview is added to the attachment list

#### Scenario: user exceeds the AI test attachment count

- Given the variable input modal is open in AI test mode
- When the selected files exceed the remaining AI test attachment slots
- Then the renderer shows the localized attachment limit error
- And only files within the remaining slots are considered for reading

### Skill Variant Source Badge Boundary

The desktop skill store and detail surfaces must classify skill source badges from explicit source semantics, not loose string prefixes.

#### Scenario: source label starts with http but is not an HTTP(S) URL

- Given a remote or installed skill has a `source_label` such as `httpx://example.com/skills` or `http-local-team`
- When the renderer builds skill variant badges
- Then the source is not classified as a Community HTTP source
- And the badge falls back to the existing Git/local/official source rules

#### Scenario: source label is an HTTP(S) URL

- Given a remote or installed skill has an HTTP or HTTPS `source_label` without an explicit branch override
- When the renderer builds skill variant badges
- Then the source is classified as a Community source

### Updater Download URL Boundary

The desktop macOS direct updater download path must only request HTTP(S) URLs.

#### Scenario: updater DMG download receives a non-HTTP redirect

- Given the macOS direct updater download follows an HTTP redirect
- When the redirect `Location` resolves to a non-HTTP(S) URL such as `file:` or `httpx:`
- Then the updater rejects the redirect before issuing another request
- And no partial installer file is treated as a successful download

#### Scenario: updater DMG download receives a relative HTTP redirect

- Given the macOS direct updater download follows an HTTP redirect
- When the redirect `Location` is relative to the current HTTP(S) request URL
- Then the updater resolves it against the current request URL
- And only continues when the resolved URL uses `http:` or `https:`

### Renderer External Link Opener Boundary

Desktop renderer links that open a new browsing context must not expose the
application window through `window.opener`.

#### Scenario: renderer opens an external link in a new tab

- Given a desktop renderer anchor uses `target="_blank"`
- When the link is rendered from prompt markdown, skill markdown, source metadata, resources, settings, or store details
- Then the anchor includes `rel="noopener noreferrer"`
- And unsafe URL protocol filtering remains in effect for user-controlled prompt and skill source links

### AI Settings Endpoint Display Robustness

The desktop AI settings UI must tolerate partially typed or invalid model API
URLs stored in configuration.

#### Scenario: configured model has an invalid API URL

- Given a configured AI model has an `apiUrl` value that cannot be parsed as a URL
- When the legacy AI settings view renders endpoint groups
- Then the settings page does not throw a render error
- And the endpoint header shows the original API URL value as a fallback label

### Remote Image Download Type Boundary

Desktop remote image downloads must only persist responses that can be
identified as supported image media.

#### Scenario: remote image response lacks image extension and image content type

- Given the desktop `image:download` IPC receives a public remote image URL
- When the final URL has no supported image extension
- And the upstream response has no supported `image/*` Content-Type
- Then the IPC returns `null`
- And no media file is written to the images directory

#### Scenario: remote image response provides supported image identity

- Given the final remote URL has a supported image extension
- Or the upstream response provides a supported image Content-Type
- When the download completes within the size limit
- Then the existing image save flow stores the file with the inferred extension

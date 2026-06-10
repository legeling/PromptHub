# Prompt Management Delta Spec

## Added Requirements

- Prompt media selectors SHOULD accept supported image/video files via drag-and-drop in create and edit dialogs.
- Dropped media files MUST be saved through content-based APIs rather than bypassing native file-picker path validation.
- Top-bar search clear controls MUST clear the current query when clicked.
- Prompt media async completions MUST NOT append media, update loading state, or show completion/failure feedback after the editing surface has unmounted.
- Prompt variable modal async completions MUST NOT append attachments, show copy success, or call completion callbacks after the variable modal has closed or unmounted.
- Prompt variable copy feedback MUST only be shown after clipboard write and caller completion callbacks succeed.
- Icon-only prompt media/tag removal controls MUST expose localized accessible names.
- Prompt editor text fields and mode toggles MUST expose programmatic labels and selected state that match the visible UI.
- Prompt variable preview controls MUST support both `{{name}}` and `{{name:defaultValue}}` placeholders consistently.
- Prompt variable filling, AI testing, and copy variable detection MUST normalize `{{name:defaultValue}}` placeholders to `name`, use defaults when no user value is supplied, and keep unresolved placeholders in `{{name}}` form.
- Prompt version history variable snapshots derived from prompt text MUST use the same `{{name}}` / `{{name:defaultValue}}` parsing semantics as prompt editing, filling, copy, and AI test flows.
- Image prompt reverse creation MUST derive saved prompt variables from reversed prompt text using the same `{{name}}` / `{{name:defaultValue}}` parsing semantics as other prompt flows.
- Image prompt reverse creation MUST NOT create duplicate prompts while a create request is pending, MUST NOT call close callbacks after the modal has closed, and MUST show localized failure feedback when prompt creation fails.
- Prompt detail, kanban, and table variable summaries/counts MUST derive displayed/shared variable names using the same `{{name}}` / `{{name:defaultValue}}` parsing semantics as other prompt flows.
- Prompt table icon-only row action controls MUST expose localized accessible names, explicit button semantics, and action-oriented favorite labels.
- Prompt list row action controls MUST expose localized accessible names, explicit button semantics, and action-oriented favorite labels.
- Prompt table column configuration controls MUST expose menu expanded state, checkbox-menu item state, explicit button semantics, and hidden decorative icons.
- Prompt list header sort, view-mode, gallery-size, and kanban-column controls MUST expose localized accessible names, selected/expanded state, and explicit button semantics.
- Prompt gallery cards MUST be keyboard-selectable and icon-only gallery action controls MUST expose localized accessible names and explicit button semantics.
- Prompt kanban pinned-section bulk action controls MUST expose localized accessible names, explicit button semantics, and hidden decorative icons.
- Prompt quick rewrite trigger controls MUST expose a localized accessible name and hide decorative icons from assistive technology.
- Prompt detail edit handoff MUST NOT leave delayed callbacks after the detail modal is closed or unmounted.
- Prompt detail variable summaries and shared JSON payloads MUST normalize `{{name:defaultValue}}` placeholders to the variable name only.
- Prompt detail header and content action controls MUST expose explicit button semantics, localized accessible names where icon-only, and hidden decorative icons.
- Prompt detail shared JSON controls MUST resolve their label from the prompt i18n namespace in every supported renderer locale.
- Prompt detail user-prompt copy MUST delegate to the parent copy workflow when provided so variable filling, usage counting, and global copy feedback remain consistent with list, gallery, kanban, and table copy actions.

## Modified Requirements

- Updating a prompt with an empty optional system prompt, English system prompt, English user prompt, description, source, or notes value MUST clear the stored value.
- Generic prompt copy actions MUST copy the active-language user prompt only. AI test flows may still receive system and user prompts separately.
- English display mode MUST prefer English prompt fields for copy when English content exists, falling back to localized content only when the English user prompt is missing.

## Scenarios

- Given a prompt has a system prompt, when the user edits it to blank and saves, then subsequent reads show no system prompt.
- Given a prompt has both system and user prompts, when the user clicks generic copy, then the clipboard contains only the user prompt without `[System]` or `[User]` labels.
- Given English mode is active and `userPromptEn` exists, when the user clicks generic copy, then the clipboard contains `userPromptEn`.
- Given search text is present in the top bar, when the user clicks the X button, then the search query becomes empty.
- Given a prompt editing surface is closed while URL image download or pasted-image processing is still pending, when the async work later resolves, then no stale media is appended and no completion feedback is shown.
- Given the variable input modal is closed while image attachment reads are pending, when the file read later resolves, then no stale attachment is appended.
- Given the variable input modal is copying filled text, when clipboard write or the caller callback fails, then no copied success feedback is shown and no copied-state timer is scheduled.
- Given a prompt has reference images or tags, when assistive technology inspects the removal controls, then each icon-only button has a meaningful localized name.
- Given the prompt editor is open, when assistive technology inspects the tag input, URL input, user prompt textarea, and edit/preview controls, then it can identify each field by label and the active edit/preview mode by pressed state.
- Given the prompt editor user prompt contains `{{name:defaultValue}}`, when no replacement value is entered, then the preview uses the default value, and when a value is entered, then the preview uses the entered value.
- Given the variable input modal user prompt contains `{{name:defaultValue}}`, when the modal previews or copies the filled prompt, then it replaces the placeholder by variable name using the entered value or default value.
- Given the AI test modal prompt contains `{{name:defaultValue}}`, when the user reviews variables or runs an AI test, then the modal shows `{{name}}`, pre-fills the default value, previews the resolved prompt, and sends the resolved prompt to the model.
- Given a prompt version has no stored variable snapshot and its prompt text contains `{{name:defaultValue}}`, when the version history table derives variables, then the derived variable snapshot contains `name` and the trimmed default value.
- Given image prompt reverse produces prompt text containing `{{name:defaultValue}}`, when the user creates the prompt, then the saved variable snapshot contains `name` and the trimmed default value.
- Given image prompt reverse has a generated draft, when the user clicks Create Prompt repeatedly while creation is pending, then only one create request is submitted.
- Given image prompt reverse has a pending create request, when the modal closes before creation resolves, then the late completion does not call the close callback or show stale feedback.
- Given image prompt reverse prompt creation fails, when the create request rejects, then the user sees localized creation-failure feedback and can retry.
- Given prompt detail, kanban, or table surfaces display or count variables from prompt text containing `{{name:defaultValue}}`, then each variable is represented once by `name` without the default-value suffix.
- Given the prompt table shows icon-only row actions, when assistive technology inspects copy, AI test, history, favorite, edit, and delete controls, then each control has a meaningful localized action name.
- Given the prompt list shows row actions, when the user activates copy or favorite, then the action buttons do not behave as form-submit controls and do not select the row.
- Given the prompt table column configuration menu is opened, when assistive technology inspects visible and hidden columns, then each configurable column is exposed as a checked or unchecked menu item.
- Given the prompt list header is rendered, when assistive technology inspects sorting, view-mode, gallery-size, or kanban-column controls, then each control exposes its localized label and current expanded or selected state.
- Given the prompt gallery is rendered, when a keyboard user focuses a card and presses Enter or Space, then the card opens detail; when assistive technology inspects the favorite action, then it receives an action-oriented localized label.
- Given the prompt kanban pinned section is visible, when assistive technology inspects Expand All, Collapse All, or Clear All controls, then each control exposes its localized action label.
- Given the prompt quick rewrite trigger is rendered, when assistive technology inspects the icon-only trigger, then it receives only the localized action label and no decorative icon content.
- Given the prompt detail modal is open, when the user clicks Edit, then the detail modal closes and the edit callback receives the prompt immediately without scheduling a delayed handoff callback.
- Given the prompt detail modal shows variables containing default values, when the variable summary or shared JSON payload is produced, then each variable is listed once by name without the default-value suffix.
- Given the prompt detail modal is open, when assistive technology inspects fullscreen, share JSON, edit, copy prompt, or copy response controls, then the controls expose stable button semantics and decorative icons are hidden.
- Given the prompt detail modal is rendered in a non-Chinese locale, when the share JSON action is inspected, then it uses the localized prompt action label rather than the Chinese fallback string.
- Given the prompt detail modal receives a parent copy handler, when the user clicks Copy Prompt, then the modal delegates to that handler instead of directly writing the clipboard.

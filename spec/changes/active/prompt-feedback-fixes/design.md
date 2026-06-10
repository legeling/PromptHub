# Design

## Overview

Keep changes scoped to renderer prompt workflows. Edit saves will explicitly send blank optional fields so existing values can be cleared. Generic copy actions will resolve the active language and copy only the user prompt. Media drag-and-drop will use browser `File` contents and existing base64 save IPC APIs instead of native file-path save APIs.

## Affected Areas

- Data model: no schema changes.
- IPC / API: no new channels; reuse existing image/video base64 save APIs.
- Filesystem / sync: no storage layout changes.
- UI / UX: prompt create/edit media sections become drop targets; top-bar clear button becomes clickable above the input.

## Tradeoffs

- Dragged files are saved via base64 APIs, which is slightly less efficient than native path copy but avoids relaxing main-process path validation.
- Generic copy now omits system prompts by default, matching the user's reported expectation for "copy user prompt".

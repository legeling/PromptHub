# Web Prompt Clipboard Copy

## Why

GitHub issue #169 reports that self-hosted web users cannot copy Markdown prompts. The web app reuses the desktop renderer, but browser clipboard access can be unavailable or rejected outside secure contexts, causing prompt copy actions to fail before any fallback is attempted.

## Scope

- Add a shared prompt clipboard helper with Clipboard API and textarea fallback behavior.
- Route prompt-related copy actions through the helper.
- Preserve Markdown text exactly when copying.
- Add regression tests for unavailable/rejected Clipboard API behavior.

## Non-Goals

- Changing prompt copy content semantics.
- Adding rich HTML clipboard output.
- Reworking browser permission UI.

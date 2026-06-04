# Issue 165 Large GitHub Skill Store

## Problem

Adding `https://github.com/sickn33/antigravity-awesome-skills` as a Git skill store fails with:

`Error invoking remote method 'skill:fetchRemoteContent': Error: Remote content exceeds size limit`

The GitHub recursive tree endpoint can return a large JSON metadata payload for big repositories. The real issue repository returns a non-truncated tree with 21,553 entries and a JSON payload of 6,329,653 bytes, which is above PromptHub's old 5MB remote content cap.

The fix is to raise the unified remote fetch cap from 5MB to 10MB.

## Scope

- Raise the main-process remote content size limit to 10MB.
- Preserve the existing GitHub skill store recursive tree discovery path.
- Keep the same unified cap behavior for text and binary remote fetches.

## Non-goals

- Do not add GitHub contents API traversal fallback.
- Do not clone full repositories in the renderer path.
- Do not add a new directory picker UI in this change.

## Risk

The higher limit increases the maximum remote response size PromptHub will read, but SSRF checks, protocol restrictions, transfer timeout, redirect limit, and the byte cap itself still apply.

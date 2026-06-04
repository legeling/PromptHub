# Restore Last Desktop Module

## Problem

The desktop app always starts in the Prompt module even when the user was last working in Skills or Rules. This forces repeated manual navigation and makes the main rail feel non-persistent.

## Scope

- Persist the last active desktop home module: `prompt`, `skill`, or `rules`.
- Restore the matching `viewMode` on launch.
- Keep transient pages such as Settings out of the persisted startup destination.

## Non-goals

- Do not persist selected prompt/skill/detail panel state.
- Do not persist scroll position.
- Do not change data loading or module contents.

## Risk

Invalid or stale persisted values must not break startup. Persisted UI state should be validated and fall back to Prompt when malformed.

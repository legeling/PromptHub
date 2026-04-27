# Proposal

## Summary

Polish the desktop update/settings UI and the Skill Store remote-error experience so warning states remain readable, visually consistent, and actionable without misleading users.

## Why

- The current preview-channel warning block breaks the visual rhythm of the About settings page and looks crowded against adjacent setting rows.
- The Skill Store rate-limit error currently tells users to add a GitHub token in settings, but PromptHub does not provide that settings flow, which creates confusion.

## Scope

### In Scope

- Refine the preview-channel enabled state presentation in the desktop About settings page.
- Improve remote-store error banner layout in Skill Store.
- Replace misleading GitHub token guidance with actionable retry / network guidance.

### Out Of Scope

- Adding GitHub token authentication support.
- Reworking the entire settings page layout.

## Risks

- Tone changes in error messaging could reduce technical detail too much.
- UI polish could accidentally weaken warning visibility if over-softened.

## Rollback / Fallback

- Revert the presentation-only adjustments while keeping the preview-confirmation behavior intact.

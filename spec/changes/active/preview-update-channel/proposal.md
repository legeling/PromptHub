# Proposal

## Summary

Add a guarded preview-update channel for PromptHub Desktop so users can explicitly opt into pre-release builds from settings, while stable users continue receiving only normal releases.

## Why

- PromptHub needs two release tracks: stable and preview.
- Pre-release builds may be unstable and should never be delivered silently to stable users.
- Users need clear warnings, backup guidance, and explicit consent before joining the preview track.

## Scope

### In Scope

- Add a preview-update opt-in flow in desktop settings.
- Require explicit risk acknowledgement before enabling preview updates.
- Show backup guidance before the user joins the preview track.
- Make update checks use stable by default and preview only after opt-in.

### Out Of Scope

- Changing GitHub release automation itself.
- Supporting more than two channels.

## Affected Flows

- Desktop settings -> about/update settings
- Manual update check
- Startup / periodic update check

## Risks

- Users may accidentally join preview if the setting is too easy to toggle.
- Incomplete copy could under-communicate upgrade risk.

## Rollback / Fallback

- Users can switch back to stable from settings at any time.
- Stable remains the default channel.

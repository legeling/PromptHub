# Proposal

## Why

The desktop Rules panel currently materializes and displays built-in global rule platforms too aggressively. Users are seeing platforms they do not actually want to track, including Claude Code, and custom root path updates can leave Rules pointing at stale target paths instead of the configured override.

## Scope

- tighten global rules visibility so desktop only shows platforms that are detectable or explicitly tracked
- allow users to stop tracking unwanted global rule platforms without deleting project rules
- ensure changing a platform root path refreshes rules metadata and target paths immediately
- add regression tests for descriptor refresh, platform visibility, and settings linkage

## Risks

- rules workspace changes affect both desktop and CLI service behavior, so default CLI listing must keep current semantics unless desktop opts into stricter filtering
- settings schema changes must stay compatible with desktop persistence and self-hosted sync/import-export snapshots

## Rollback

- revert desktop-specific tracking support and fall back to the current built-in platform enumeration

## Impacted User Flows

- opening the desktop Rules sidebar after first launch
- hiding an unwanted global rule platform from the Rules UI
- changing a platform root path in Settings and reopening/rescanning Rules
- reading/saving an existing tracked global rule after a root path override changes

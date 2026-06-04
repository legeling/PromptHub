# Proposal

## Why

GitHub issue #161 requests batch Skill operations in the desktop Skill Store. Users with large store sources need to install, update, or remove many store-backed Skills without opening each card detail one by one.

## Scope

- In scope:
  - Add a Skill Store batch management mode for the current visible catalog.
  - Support selected store Skills install, update, and removal from My Skills.
  - Preserve per-Skill pending state across list cards and detail modal.
  - Add regression coverage for selection, skipped installed entries, and removal behavior.
- Out of scope:
  - Project Skill or Agent Skill distribution operations.
  - Deleting remote store content.
  - Changing Skill filesystem, database, or sync storage layout.

## Risks

- Store lists can be virtualized, so selection must use stable store Skill identity instead of row index.
- Batch removal must only remove local My Skill entries that are matched to a store item.
- Multiple async operations must not collapse into one global spinner or allow duplicate install clicks.

## Rollback Thinking

Revert the Skill Store batch UI, card selection affordance, i18n keys, and related tests. No schema or data migration is introduced.

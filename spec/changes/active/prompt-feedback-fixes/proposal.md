# Proposal

## Why

A Windows desktop user reported several prompt-management issues: media upload does not support drag-and-drop, deleted system prompts reappear after saving, user prompt copy includes system prompt labels, English-mode copy still copies localized content, and the top search clear button does not respond.

## Scope

- In scope: desktop prompt create/edit media drag-and-drop, prompt edit payload clearing, prompt copy text behavior, language-aware copy behavior, and top-bar search clear interaction.
- Out of scope: broader prompt editor redesign, new media storage model, and non-desktop web upload semantics.

## Risks

- Copy behavior changes from combined System/User output to user-prompt-only output for the generic copy action.
- Dragged files must be saved without broadening native path access.

## Rollback Thinking

Revert renderer changes in prompt modal utilities, copy utilities, media manager, top bar, and related tests. No database migration is involved.

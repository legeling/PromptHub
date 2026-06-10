# Proposal

## Why

`GET /api/prompts` accepted unbounded `keyword`, `tags`, and `folderId` query
strings. The route filters prompt lists in memory, so very large search filters
or large tag lists can waste CPU and memory before returning an empty result.

## Scope

- In scope:
  - Add route-level length limits for prompt list `keyword`, `tags`, and
    `folderId` query values.
  - Limit comma-separated tag filters to 50 entries.
  - Include query field names in validation error messages.
  - Add route regressions for oversized keyword and tag-list filters.
  - Remove per-prompt detail lookups from `PromptService.list()` while keeping
    the existing response contract.
- Out of scope:
  - Moving prompt list filtering into SQL.
  - Changing prompt create/update tag limits.
  - Changing desktop prompt search behavior.

## Risks

Some pathological query URLs now fail with validation errors. Normal prompt list
search and filtering are unaffected.

## Rollback Thinking

Rollback is limited to removing the query limits, tag-count guard, and
regression assertions. No data migration is involved.

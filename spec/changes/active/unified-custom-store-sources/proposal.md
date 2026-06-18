# Unified Custom Store Sources

## Why

Skill Store already lets users add, edit, disable, refresh, and remove custom store sources. MCP Store and Plugin Store expose source lists, but their sources are fixed by their own implementations and do not share the Skill Store custom-source workflow. This creates inconsistent behavior and leaves destructive source removal without a secondary confirmation in the Skill custom-source UI.

## Scope

- Use the Skill Store source workflow as the product baseline.
- Provide a shared custom store source model and reusable CRUD helpers for renderer stores.
- Require a confirmation dialog before deleting a custom store source.
- Let Skill, MCP, and Plugin surfaces share the same custom-source add/edit/delete/toggle behavior where their existing loaders can support it.
- Keep each product area's existing marketplace parsing and installation semantics.

## Non-goals

- Do not replace the MCP or Plugin marketplace parser.
- Do not change installed Skill, MCP server, or Plugin deletion semantics beyond source-management confirmation.
- Do not migrate existing Skill custom source persistence out of the current renderer store in this change.

## Risks

- Plugin custom sources require enough metadata to resolve package files from a marketplace JSON URL.
- MCP arbitrary sources may only work when the target URL returns a JSON/HTML structure supported by the existing generic parser.
- Existing tests currently encode immediate Skill custom-source deletion and must be updated to assert confirmation-gated deletion.

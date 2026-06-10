# Web Settings Platform Boundary

## Why

The self-hosted Web settings API persists platform and agent preference fields that are later consumed by platform scanning and sync/export flows. Several fields accepted unbounded strings, arrays, and records, allowing accidental oversized payloads, blank ids, and invalid path placeholders to be stored.

## Scope

- Tighten `/api/settings` validation for platform preference fields.
- Cover `builtinAgentOverrides`, `customPlatformRootPaths`, `customAgentRootPaths`, `disabledPlatformIds`, `customSkillPlatformPaths`, and `skillPlatformOrder`.
- Preserve existing semantics: the Web API validates shape and bounded strings only. It does not check filesystem existence or require ids to match a built-in registry.

## Risks

- Existing clients that send blank ids or blank path strings will now receive `422 VALIDATION_ERROR`.
- Very large custom platform lists are rejected instead of persisted.

## Rollback

Revert the settings route schema and the corresponding tests. Existing valid persisted settings remain compatible.

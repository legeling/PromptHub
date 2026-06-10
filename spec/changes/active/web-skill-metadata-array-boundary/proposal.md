# Web Skill Metadata Array Boundary

## Why

The Web skill create/import/update routes accepted unbounded metadata arrays for tags, original tags, prerequisites, and compatibility values. Those arrays are persisted and exported, so oversized or blank metadata can degrade list rendering, sync/export payloads, and downstream skill workspace writes.

## Scope

- Tighten live `/api/skills` mutation validation and SkillService defensive
  validation for skill metadata arrays.
- Cover `tags`, `original_tags`, `prerequisites`, and `compatibility`.
- Cover remote skill imports whose frontmatter metadata is parsed inside the
  service layer rather than submitted directly through the route schema.
- Preserve existing content limits and permission behavior.
- Do not normalize, deduplicate, or reinterpret accepted metadata in this change.

## Risks

- Clients that send blank metadata entries, very long entries, or unusually large metadata arrays will now receive `422 VALIDATION_ERROR`.

## Rollback

Revert the route schema and route tests. No migration is required because this only rejects future malformed writes.

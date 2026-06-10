# Design

## Boundary

- Owner: `apps/web`.
- Source of truth: skill metadata persisted through `SkillService`.
- Contract: `POST /api/skills`, `POST /api/skills/import`,
  `PUT /api/skills/:id`, and `POST /api/skills/fetch-remote` imports.
- Storage: no database or filesystem layout change.

## Approach

- Add reusable string schemas for skill metadata entries.
- Limit user-facing tag arrays to 100 items, with each tag trimmed, non-empty, and at most 100 characters.
- Limit prerequisite and compatibility arrays to 50 items, with each entry trimmed, non-empty, and at most 500 characters.
- Keep accepted values as arrays of strings and let Zod trim valid entries before they reach `SkillService`.
- Add a matching `SkillService.create/update` defensive check so remote
  frontmatter metadata and future internal service callers cannot bypass the
  route parser.

## Verification

- Route tests cover rejected overlarge arrays and blank/overlong entries.
- Route tests verify valid metadata still persists and round-trips.
- Remote fetch route tests cover malformed parsed frontmatter metadata before
  import.
- Existing skill route tests verify permissions and safety endpoints still work.

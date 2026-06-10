# Design

## Overview

Keep safety reports behind the existing dedicated Web API route. The generic
Skill update schema now treats `safetyReport` as an invalid field with a clear
validation message pointing callers to `PUT /api/skills/:id/safety-report`.
As a follow-up, the dedicated route also bounds report content before
persistence so AI-generated or client-supplied reports cannot store unbounded
finding arrays or text fields.

## Affected Areas

- Data model:
  - No schema change. Existing `skills.safety_*` columns remain unchanged.
- IPC / API:
  - `PUT /api/skills/:id` rejects `safetyReport` with `422 VALIDATION_ERROR`.
  - `PUT /api/skills/:id/safety-report` remains the write path for reports.
  - `PUT /api/skills/:id/safety-report` rejects oversized report summaries,
    finding arrays, and finding text fields with `422 VALIDATION_ERROR`.
- Filesystem / sync:
  - No direct change. Workspace sync still runs after valid Skill mutations.
- UI / UX:
  - No direct UI change. Existing Web client report-saving API remains valid.

## Tradeoffs

- The service layer still accepts `safetyReport` through `SkillDB.update` for
  internal callers. This keeps the change narrow and preserves the dedicated
  `saveSafetyReport` flow while hardening the public Web route boundary.
- Size checks live in the Web route schema because they protect the public JSON
  boundary and keep existing storage/migration behavior unchanged.

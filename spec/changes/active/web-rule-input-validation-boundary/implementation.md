# Implementation

## Shipped

- Added route regressions proving unsafe Rules project ids and unsafe imported
  records return validation errors and leave the managed workspace empty.
- Added a conservative project id route schema for `POST /api/rules/projects`.
- Added Rules route error mapping for workspace snapshot validation errors,
  duplicate project roots, and required-field service guards.
- Added route regressions proving oversized rule content, rewrite
  instructions, and import record batches return validation errors before
  mutating managed workspace files.
- Added route-level bounds in `apps/web/src/routes/rules.ts`:
  - rule content and rewrite current content: 200,000 characters
  - rewrite instruction: 2,000 characters
  - rewrite file/platform labels: 200 characters
  - AI config scalar fields: bounded and `apiUrl` must be a URL
  - import records: at most 1,000 records
- Added a route regression proving `DELETE /api/rules/projects/:projectId`
  rejects unsafe project ids before touching managed workspace files.
- Reused the project id route schema for project rule deletes so create and
  delete enforce the same path-segment safety boundary.
- Added a route regression proving project rule names and root paths containing
  control characters, or root paths over the supported length, are rejected
  before creating managed workspace files.
- Added route-level bounds for project rule names and root paths:
  - project rule name: 120 characters
  - project rule root path: 1,024 characters
  - both fields must be non-empty after trimming and must not contain control
    characters.

## Verification

- Failure-first check:
  - `pnpm --filter @prompthub/web test -- --run src/routes/rules.test.ts -t "unsafe"`
  - Failed because both unsafe route requests returned `500`.
- Passing checks:
  - `pnpm --filter @prompthub/web test -- --run src/routes/rules.test.ts -t "unsafe"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/rules.test.ts`
  - `pnpm --filter @prompthub/web typecheck`
  - `pnpm --filter @prompthub/web lint`
  - `git diff --check -- apps/web/src/routes/rules.ts apps/web/src/routes/rules.test.ts spec/changes/active/web-rule-input-validation-boundary`
- Failure-first check:
  - `pnpm --filter @prompthub/web test -- --run src/routes/rules.test.ts -t "oversized rule writes"`
  - Failed because oversized rule content returned `200` and overwrote the
    rule.
- Passing checks:
  - `pnpm --filter @prompthub/web test -- --run src/routes/rules.test.ts -t "oversized rule writes"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/rules.test.ts`
  - `pnpm --filter @prompthub/web typecheck`
  - `pnpm --filter @prompthub/web lint`
  - `git diff --check -- apps/web/src/routes/rules.ts apps/web/src/routes/rules.test.ts spec/changes/active/web-rule-input-validation-boundary`
- Failure-first check:
  - `pnpm --filter @prompthub/web test -- --run src/routes/rules.test.ts -t "unsafe project rule ids on delete"`
  - Failed because `DELETE /api/rules/projects/..%2Fescape` returned `200`.
- Passing checks:
  - `pnpm --filter @prompthub/web test -- --run src/routes/rules.test.ts -t "unsafe project rule ids on delete"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/rules.test.ts`
  - `pnpm --filter @prompthub/web typecheck`
  - `pnpm --filter @prompthub/web lint`
  - `git diff --check -- apps/web/src/routes/rules.ts apps/web/src/routes/rules.test.ts spec/changes/active/web-rule-input-validation-boundary`
- Failure-first check:
  - `pnpm --filter @prompthub/web test -- --run src/routes/rules.test.ts -t "unsafe project rule names"`
  - Failed because `POST /api/rules/projects` accepted a project name
    containing a NUL character and created the project rule.
- Passing checks:
  - `pnpm --filter @prompthub/web test -- --run src/routes/rules.test.ts -t "unsafe project rule names"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/rules.test.ts`
  - `pnpm --filter @prompthub/web typecheck`
  - `pnpm --filter @prompthub/web lint`
  - `git diff --check -- apps/web/src/routes/rules.ts apps/web/src/routes/rules.test.ts spec/changes/active/web-rule-input-validation-boundary spec/issues/active/quality.md`

## Synced Docs

- Active proposal, design, delta spec, tasks, and implementation records cover
  this narrow Web Rules input validation boundary. No stable docs were synced
  because the long-lived managed rules workspace layout remains unchanged.

## Follow-ups

- None currently.

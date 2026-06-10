# Implementation

## Shipped

- Added prompt client API regression coverage for IDs containing `/`, `?`, and
  `#` across update, delete, copy, versions, rollback, and diff wrappers.
- Added skill client API regression coverage for IDs containing `/`, `?`, and
  `#` across versions and safety-report wrappers.
- Added local path-segment encoding helpers in the touched Web client API
  modules and used them for dynamic prompt and skill ID route segments.
- Added desktop bridge regression coverage for prompt, folder, skill, and
  version IDs containing `/`, `?`, and `#`.
- Updated the Web runtime desktop bridge to encode dynamic prompt, folder,
  skill, and version ID route segments before dispatch.

## Verification

- `pnpm --filter @prompthub/web test -- --run src/client/api/prompts.test.ts -t "encodes prompt ids"`
  - Result: failed before implementation, passing after implementation.
- `pnpm --filter @prompthub/web test -- --run src/client/api/endpoints.test.ts -t "encodes skill ids"`
  - Result: failed before implementation, passing after implementation.
- `pnpm --filter @prompthub/web test -- --run src/client/api/prompts.test.ts src/client/api/endpoints.test.ts`
  - Result: passing.
- `pnpm --filter @prompthub/web test -- --run src/client/desktop/install-bridge.test.ts -t "encodes entity ids"`
  - Result: failed before implementation, passing after implementation.
- `pnpm --filter @prompthub/web test -- --run src/client/desktop/install-bridge.test.ts`
  - Result: passing.
- `pnpm --filter @prompthub/web test -- --run src/client/api/prompts.test.ts src/client/api/endpoints.test.ts src/client/desktop/install-bridge.test.ts`
  - Result: passing.
- `pnpm --filter @prompthub/web typecheck`
  - Result: passing.
- `pnpm --filter @prompthub/web lint`
  - Result: passing.
- `git diff --check -- apps/web/src/client/api/prompts.ts apps/web/src/client/api/prompts.test.ts apps/web/src/client/api/endpoints.ts apps/web/src/client/api/endpoints.test.ts spec/changes/active/web-client-path-segment-encoding spec/issues/active/quality.md`
  - Result: passing.

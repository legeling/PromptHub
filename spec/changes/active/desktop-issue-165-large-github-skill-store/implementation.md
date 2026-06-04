# Implementation

## Status

Implemented.

## Notes

- The real issue repository `sickn33/antigravity-awesome-skills` has a non-truncated GitHub recursive tree with 21,553 entries and a JSON payload of 6,329,653 bytes.
- `apps/desktop/src/main/services/skill-installer-remote.ts` raises the unified remote fetch cap from 5MB to 10MB.
- The renderer GitHub store parser remains on the existing recursive tree discovery path; no contents traversal fallback was added.
- Text and binary remote fetches now use the same 10MB cap across URL shapes.

## Verification

- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/skill-installer-remote.test.ts` passed: 29 tests passed.
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/services/github-skill-store.test.ts` passed: 4 tests passed.
- `git diff --check -- apps/desktop/src/main/services/skill-installer-remote.ts apps/desktop/tests/unit/main/skill-installer-remote.test.ts spec/changes/active/desktop-issue-165-large-github-skill-store` passed.

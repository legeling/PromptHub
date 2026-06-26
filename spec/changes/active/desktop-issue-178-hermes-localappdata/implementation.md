# Implementation

## Execution Notes

- Confirmed issue #178 reproduces in the current code: Hermes Windows resolves
  to `%USERPROFILE%\.hermes` / `C:\Users\<user>\.hermes`, and
  `%LOCALAPPDATA%` remains unexpanded.
- Updated the shared Hermes Agent Windows root template to
  `%LOCALAPPDATA%\hermes`, matching Hermes Windows Native documentation.
- Added `%LOCALAPPDATA%` expansion to `resolvePlatformPath()` for platform
  scanning, distribution, and derived paths.
- Added `%LOCALAPPDATA%` expansion to `expandShellOpenPath()` so desktop open
  actions can handle the same path templates.
- Kept user overrides unchanged: explicit Hermes settings still take precedence
  over the built-in default.

## Verification

- Red:
  `PATH="/opt/homebrew/bin:$PATH" /opt/homebrew/bin/pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/skill-installer-utils.test.ts -t "LOCALAPPDATA|Hermes Agent root"`
  failed with Hermes resolving to `C:\Users\TestUser\.hermes` and
  `%LOCALAPPDATA%` remaining unexpanded.
- Red:
  `PATH="/opt/homebrew/bin:$PATH" /opt/homebrew/bin/pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/shell-open-path.test.ts -t "LOCALAPPDATA"`
  failed because `expandShellOpenPath()` returned `%LOCALAPPDATA%\hermes`.
- Green:
  `PATH="/opt/homebrew/bin:$PATH" /opt/homebrew/bin/pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/skill-installer-utils.test.ts tests/unit/main/shell-open-path.test.ts tests/unit/renderer/agent-root-paths.test.ts -t "LOCALAPPDATA|Hermes Agent root|Hermes Agent Windows Native"`
  passed, 5 matching tests.

- Green final:
  `PATH="/opt/homebrew/bin:$PATH" /opt/homebrew/bin/pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/skill-installer-utils.test.ts tests/unit/main/shell-open-path.test.ts tests/unit/renderer/agent-root-paths.test.ts`
  passed, 3 files / 83 tests. Existing stderr in
  `skill-installer-utils.test.ts` is from tests that intentionally exercise DB
  read and malformed JSON failures.
- `PATH="/opt/homebrew/bin:$PATH" /opt/homebrew/bin/pnpm --filter @prompthub/desktop exec eslint src/main/services/skill-installer-utils.ts src/main/shell-open-path.ts src/main/index.ts tests/unit/main/skill-installer-utils.test.ts tests/unit/main/shell-open-path.test.ts tests/unit/renderer/agent-root-paths.test.ts --max-warnings 0`
  passed.
- `PATH="/opt/homebrew/bin:$PATH" /opt/homebrew/bin/pnpm --filter @prompthub/desktop exec tsc --noEmit --pretty false`
  passed.
- `PATH="/opt/homebrew/bin:$PATH" apps/desktop/node_modules/.bin/tsc -p packages/shared/tsconfig.json --noEmit --pretty false`
  passed.
- `git diff --check -- packages/shared/constants/platforms.ts apps/desktop/src/main/services/skill-installer-utils.ts apps/desktop/src/main/shell-open-path.ts apps/desktop/src/main/index.ts apps/desktop/tests/unit/main/skill-installer-utils.test.ts apps/desktop/tests/unit/main/shell-open-path.test.ts apps/desktop/tests/unit/renderer/agent-root-paths.test.ts spec/knowledge/reference/agent-platforms.md spec/changes/active/desktop-issue-178-hermes-localappdata`
  passed.
- `PATH="/opt/homebrew/bin:$PATH" /opt/homebrew/bin/pnpm exec prettier --check packages/shared/constants/platforms.ts apps/desktop/src/main/services/skill-installer-utils.ts apps/desktop/src/main/shell-open-path.ts apps/desktop/tests/unit/main/skill-installer-utils.test.ts apps/desktop/tests/unit/main/shell-open-path.test.ts apps/desktop/tests/unit/renderer/agent-root-paths.test.ts spec/knowledge/reference/agent-platforms.md spec/changes/active/desktop-issue-178-hermes-localappdata/proposal.md spec/changes/active/desktop-issue-178-hermes-localappdata/design.md spec/changes/active/desktop-issue-178-hermes-localappdata/tasks.md spec/changes/active/desktop-issue-178-hermes-localappdata/implementation.md spec/changes/active/desktop-issue-178-hermes-localappdata/specs/agent-platforms/spec.md`
  passed. `apps/desktop/src/main/index.ts` was not included in this final
  Prettier check because the existing dirty file has unrelated formatting gaps;
  the issue #178 diff in that file is limited to passing `localAppDataPath` into
  `shell:openPath`.

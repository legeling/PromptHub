# Implementation

## Status

Implemented.

## Shipped

- `testAIConnection` now uses a short `Reply with exactly: OK` probe when the caller does not provide an explicit prompt.
- Chat model connection tests now cap output at 8 tokens, force non-streaming mode, disable thinking, use temperature 0, and pass a 12 second transport timeout.
- `chatCompletion` accepts an optional `timeoutMs` override and forwards it through the desktop AI transport.
- Added a regression test proving local OpenAI-compatible model tests do not inherit high `maxTokens`, streaming, or thinking settings.
- Synced the desktop behavior spec with the lightweight AI workbench test boundary.

## Verification

- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/services/ai-transport.test.ts --testNamePattern "lightweight"`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/services/ai-transport.test.ts`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/ai-settings-prototype.test.tsx --testNamePattern "test"`
- `pnpm --filter @prompthub/desktop exec tsc --noEmit --pretty false`
- `git diff --check`

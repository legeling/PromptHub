# Pi Agent Separation Implementation

## Product

Desktop

## Status

Status: release-pending. Implementation and scoped verification are complete.
The change remains active until it is included in a published release.

## Delivered

- Added Pi as built-in Agent `pi` without aliasing or replacing `oh-my-pi`.
- Registered the Pi root, Skills, extensions, rules, non-secret config files
  and read-only CLI diagnostic while leaving native MCP unsupported. The
  separate MCP manager compatibility writer does not alter this Agent
  capability boundary.
- Reused one bounded Pi-family JSONL parser behind separate roots, adapter ids,
  result identities and resume commands.
- Added Pi `settings.json` model inspection, JSONC-preserving updates, backup,
  atomic replacement, verification and rollback.
- Replaced the generic Pi `CircleDot` fallback with the official Pi badge at
  `apps/desktop/src/renderer/assets/platforms/pi.svg`, sourced from the Pi
  press kit (`https://pi.dev/press-kit`, asset `https://pi.dev/favicon.svg`).
- Replaced the generic Oh My Pi terminal fallback with the upstream
  plugin-connected mark at
  `apps/desktop/src/renderer/assets/platforms/oh-my-pi.svg` and added a dark
  rounded backing so the transparent light mark remains visible in light mode.
- Updated the stable Agent platform reference with the product relationship,
  supported boundaries, current upstream paths and official icon provenance.

## Performance And Capacity

- Built-in detection remains a bounded linear pass. Adding Pi contributes one
  registry row and one root existence check.
- Session discovery remains depth-bounded and `O(f + p)`, where `f` is the
  number of candidate JSONL files and `p` is the requested page size.
- Metadata and transcript reads retain the existing prefix/detail byte limits;
  no unbounded cache, background process or additional network call was added.
- The Pi badge is a static bundled SVG, so rendering does not add network I/O
  or depend on the upstream site being reachable.
- The Oh My Pi mark is also bundled and its local SVG hash matches the upstream
  `assets/icon.svg` at the time of verification.

## Verification

- TDD red phase: the Pi registry, capability, model and session tests failed
  before the implementation because `pi` was absent.
- `pnpm --filter @prompthub/desktop test -- --run
tests/unit/services/pi-platform.test.ts
tests/unit/services/oh-my-pi-platform.test.ts
tests/unit/services/agent-platform-capabilities.test.ts
tests/unit/services/managed-agents.test.ts
tests/unit/main/agent-model-config-pi.test.ts
tests/unit/main/agent-model-config.test.ts
tests/unit/main/agent-model-provider-adapter.test.ts
tests/unit/main/agent-session-pi.test.ts
tests/unit/main/agent-session-oh-my-pi.test.ts
tests/unit/main/agent-session-index-operations.test.ts` — passed, 86 tests.
- `pnpm --filter @prompthub/shared typecheck` — passed.
- `pnpm --filter @prompthub/core typecheck` — passed.
- `pnpm --filter @prompthub/desktop typecheck` — passed.
- `pnpm --filter @prompthub/desktop test -- --run
tests/unit/components/platform-icon.test.tsx` — passed, 16 tests; the
  regression tests verify the rendered `pi.svg` and `oh-my-pi.svg` paths,
  official geometry and light-theme backing.
- `pnpm spec:test` — passed after regenerating the active-change index.
- `pnpm verify:release:quick` — 20 of 22 checks passed. The complete desktop,
  CLI, core, shared, web, worker and mobile checks passed. The run initially
  found the now-refreshed change index and still reports pre-existing preferred
  line-limit debt in `SkillStore.tsx` and `SkillStoreDetail.tsx` (1536 lines
  each); neither file is touched by this change.

## Review

Scoped review found no blocking correctness, security or resource-lifecycle
issue. Pi and Oh My Pi keep independent default roots and storage. Both
upstreams expose `PI_CODING_AGENT_DIR`; when a process-level override is set,
per-Agent PromptHub root overrides remain necessary to disambiguate two
simultaneous installations. No process, port, lock or temporary test directory
is retained.

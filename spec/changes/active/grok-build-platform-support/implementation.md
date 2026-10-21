# Implementation

## Product

Desktop

## Status

review-pending. T-GROK-010 verification remains unchecked.

## Shipped

- Added built-in platform `grok` for Grok Build with the documented user root,
  Skill directory, Plugin discovery directory, global `AGENTS.md`, and
  `config.toml`, `pager.toml`, `settings.json`, `lsp.json`, and `sandbox.toml`
  configuration previews.
- Replaced the generic bot visual with the current Grok mark, using separate
  black and white assets for light and dark themes.
- Added regression coverage for the `config.toml` MCP discovery path and the
  intentional absence of a Grok MCP writer/preset.
- Audited the installed Grok Build documentation and recorded the project-level
  asset contract, the protected runtime/state files, and the MCP schema
  difference from the existing Codex TOML serializer.
- Confirmed against the installed Grok 0.2.93 `grok inspect --json` output that
  Grok discovers user Skills from `~/.grok/skills/` and project Skills from
  `.agents/skills/` without PromptHub-specific compatibility shims.

## Asset Boundary

- PromptHub-managed user assets: `skills/` and global `AGENTS.md` through the existing Skill and Rules workflows.
- Discovery-only assets: `plugins/`, `agents/`, and `commands/`. Grok Plugin bundle distribution is not advertised because no Grok target adapter exists yet.
- Preview-only configuration assets: `config.toml`, `pager.toml`, `settings.json`, `lsp.json`, and `sandbox.toml`.
- Recognized but not managed by this integration: `roles/`, `personas/`,
  `hooks/`, `sessions/`, `memory/`, `worktrees/`, and `logs/`.
- Protected from PromptHub writes: `auth.json`, `mcp_credentials.json`, session
  transcripts, tool-managed bundled assets, marketplace caches, and installed
  plugin runtime state.

## Verification

- `TEST-GROK-001`: `agent-root-paths.test.ts` covers documented user assets.
- `TEST-GROK-002`: `agent-root-paths.test.ts` asserts that the Grok MCP path is
  visible as `config.toml`; `mcp-library.test.ts` asserts that the MCP target
  registry does not expose the incompatible Codex adapter as Grok support.
- `TEST-GROK-003`: `platform-icon.test.tsx` asserts that Grok renders its
  light/dark brand assets instead of the generic fallback.
- `TEST-GROK-004`: `rules-workspace.test.ts` asserts that Grok's global
  `AGENTS.md` is included in the Rules workspace.
- Targeted Vitest execution: not run locally by maintainer direction. Static
  `git diff --check` remains required before handoff.

## Analyze

- Traceability complete: yes
- Conflicts/blockers resolved: yes

## Converge

- Stable workflow/knowledge/rules synced: `spec/knowledge/reference/agent-platforms.md`, `spec/knowledge/behavior/rules-workspace.md`
- Issues/releases/ADRs/indexes synced: not required
- Final change destination: `spec/changes/archive/`

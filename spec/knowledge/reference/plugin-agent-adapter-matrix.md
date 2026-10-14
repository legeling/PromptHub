# Plugin Agent Adapter Matrix

## Purpose

This reference records which Agent targets have a real plugin, extension, power, or package mechanism that PromptHub can adapt to.

PromptHub Plugin support does not mean every Agent can read Codex `.codex-plugin` packages directly. It means PromptHub can scan one Plugin inventory and either install it as a native bundle package or generate the target Agent's own bundle package format.

## Semantic Gate

PromptHub must not enable a target just because its docs use the word "plugin". A supported Plugin target must have bundle semantics:

- It can declare or contain multiple child capability classes such as skills, agents, commands, hooks, MCP servers, LSP servers, app/connectors, scripts, assets, or package-level docs.
- It has a package-level manifest, import surface, marketplace, extension, or power format that represents the bundle as one installable unit.
- It can preserve the user's mental model of "install one capability pack, then inspect or distribute its child assets".

These do not qualify as first-version Plugin targets:

- a single `SKILL.md` with no additional package inventory
- a single JS/TS hook file or function
- a runtime hook module that cannot carry or point to multiple child asset groups
- an agent platform that only exposes separate skill/rule/command/MCP directories without one package format

## Classifications

| Status        | Meaning                                                                                                                               | First Implementation UI                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `Native`      | Target can consume the source bundle package format directly, or nearly directly, through its own marketplace/install surface.        | Enabled                                                                                        |
| `Adapter`     | PromptHub can generate a target-native bundle package from the PromptHub Plugin inventory.                                            | Enabled only when package generation and the native install/load contract are both implemented |
| `RuntimeOnly` | Target has a plugin runtime, but the plugin is a hook/module/function surface rather than a bundle package.                           | Disabled/greyed out as unsupported for Plugin bundles                                          |
| `Composite`   | Target has useful customization surfaces, but no confirmed single integrated plugin package; PromptHub would have to split the parts. | Disabled/greyed out as unsupported for Plugin bundles                                          |
| `Pending`     | Public docs are insufficient or access is gated; do not promise support.                                                              | Disabled/greyed out unless a future audit proves bundle support                                |

## Actionable Targets

| Target                                | Status                          | Target-native package concept  | Marker / config                                                             | Install or load surface                                                                            | PromptHub adapter output                                                                                                   |
| ------------------------------------- | ------------------------------- | ------------------------------ | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Codex CLI / Codex app                 | `Native`                        | Codex Plugin                   | `.codex-plugin/plugin.json`; marketplace `.agents/plugins/marketplace.json` | `codex plugin marketplace ...`; `codex plugin add ...`                                             | Preserve Codex package structure, read OpenAI/PromptHub marketplace entries, and install through PromptHub or Codex CLI.   |
| Claude Code                           | `Adapter`                       | Claude Code Plugin             | `.claude-plugin/plugin.json`                                                | `/plugin`; `claude plugin ...`; `claude --plugin-dir`; `claude --plugin-url`; skills-dir loading   | Generate `.claude-plugin/plugin.json` plus root-level skills, agents, hooks, MCP/LSP configs, monitors, and assets.        |
| Cursor                                | `Adapter`                       | Cursor Plugin                  | `.cursor-plugin/plugin.json`; marketplace `.cursor-plugin/marketplace.json` | Cursor Marketplace or verified `~/.cursor/plugins/local` workflow; direct distribution disabled    | Read installed Marketplace/local packages; package generation does not claim native installation or activation.            |
| Gemini CLI                            | `Adapter`                       | Gemini Extension               | `gemini-extension.json`                                                     | `gemini extensions install <source>`; `gemini extensions link <path>`; `<home>/.gemini/extensions` | Generate one extension root with `gemini-extension.json`, context file, commands, hooks, skills/subagents, and MCP config. |
| Antigravity IDE                       | `Native` (native packages only) | Antigravity Plugin             | root `plugin.json`                                                          | `<home>/.gemini/config/plugins/<name>/`                                                            | Preserve native manifest and whole package; no version subdirectory or automatic conversion from other formats.            |
| Kiro                                  | `Adapter`                       | Kiro Power                     | `POWER.md`; optional `mcp.json`; optional `steering/`                       | Native Kiro import from local folder or GitHub; direct distribution disabled                       | Read existing package structures; package generation does not claim registration, loading, or installation.                |
| GitHub Copilot CLI / VS Code Agent UI | `Adapter`                       | Copilot / VS Code Agent Plugin | root `plugin.json`; `.plugin/plugin.json`; `.github/plugin/plugin.json`     | `copilot plugin ...`; VS Code Agent Plugins marketplace and local plugin locations                 | Package generation exists, but distribution remains disabled until PromptHub uses the native install/register workflow.    |

## Composite Or Disabled Targets

| Target                   | Status        | Reason                                                                                                                                                                           |
| ------------------------ | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenCode                 | `RuntimeOnly` | Official docs define a plugin as a JS/TS module or npm package that exports hook functions. It is useful, but not a bundle inventory format.                                     |
| Cline SDK / CLI / Kanban | `RuntimeOnly` | Official docs define plugin entrypoints through `package.json` `cline.plugins` and `AgentPlugin` files for tools/hooks/commands, not a bundle inventory.                         |
| Windsurf / Devin         | `Composite`   | Public docs describe separate Cascade skills, workflows, hooks, MCP, and IDE/plugin surfaces, but not one confirmed Agent plugin bundle format.                                  |
| Cherry Studio            | `Composite`   | The current product renamed Plugins to Skills and exposes separate Skill/agent/MCP surfaces; no confirmed single plugin package or marketplace format is modeled.                |
| ZCode                    | `Pending`     | ZCode documents multi-capability Plugins, but the public docs do not confirm a stable local package marker or installation path for PromptHub distribution.                      |
| Amp                      | `Pending`     | The public manual confirms project/user TypeScript Plugin paths, but copying executable files does not prove Amp trust or activation; no native install/rollback adapter exists. |
| Other Agent targets      | `Pending`     | Default to greyed out until official docs or source code prove an integrated package mechanism and PromptHub defines an adapter.                                                 |

Runtime-only, composite, and pending targets should remain visible but disabled in the first Plugin implementation, with UI copy that says the target does not support PromptHub Plugin bundles. Enabling runtime-only targets requires a separate wrapper design. Enabling composite targets requires a separate composite installer design that shows which target-native surfaces will be written, backed up, and rolled back.

## Adapter Notes

- Codex, Claude Code, Cursor, Gemini CLI, Antigravity IDE, Kiro, and GitHub Copilot have package manifests that can carry or point to multiple child capabilities.
- OpenCode is not a first-version PromptHub Plugin adapter under the strict semantic gate because its plugin mechanism is a JS/TS or npm hook module loaded from plugin directories or `opencode.json`.
- Cline is not a first-version PromptHub Plugin adapter under the strict semantic gate because its plugin mechanism is an `AgentPlugin` runtime entrypoint package. It can still be useful later as a runtime wrapper target.
- Cline support must remain scope-labeled. The official Cline plugin docs say the plugin feature applies to Cline SDK, CLI, and Kanban, not the VSCode or JetBrains extension runtime.
- GitHub Copilot should not be treated as instruction-only anymore. Copilot CLI and VS Code Agent Plugins now define a `plugin.json` package with component paths for agents, skills, commands, hooks, MCP servers, and LSP servers.
- Generating `plugin.json` or copying a package under `installed-plugins/` is not
  a successful Copilot installation. PromptHub keeps read-only discovery, but
  the distribution target remains disabled until a bounded
  `copilot plugin install` adapter can confirm registration and rollback.
- Cursor's public `cursor/plugins` repository is enough to model the package shape: a root `.cursor-plugin/marketplace.json`, per-plugin `.cursor-plugin/plugin.json`, and child directories such as `skills/`, `rules/`, and `mcp.json`.
- Generating a Cursor package or copying it below `~/.cursor/plugins` is not
  sufficient activation evidence. PromptHub keeps Marketplace-cache and local
  Plugin discovery read-only and disables distribution until a native
  Marketplace or verified local-plugin adapter can confirm loading and
  rollback.
- Kiro Power package shape and native import are separate contracts. PromptHub
  keeps package inventory read-only and disables direct filesystem
  distribution until a native import adapter can preview, confirm, verify
  registration, and roll back.

- Antigravity IDE and Gemini CLI are separate targets. Antigravity loads root `plugin.json` packages with optional `mcp_config.json`, `hooks.json`, `skills/`, `agents/`, and `rules/`. Its manual global installation is supported without CLI registration; CLI staging/registry and workspace installation are separate surfaces.

## Evidence

- Codex plugins: `https://developers.openai.com/codex/plugins`
- Codex build plugins: `https://developers.openai.com/codex/plugins/build`
- OpenAI marketplace: `https://raw.githubusercontent.com/openai/plugins/main/.agents/plugins/marketplace.json`
- Claude Code plugins reference: `https://code.claude.com/docs/en/plugins-reference`
- Cursor official plugin repository: `https://github.com/cursor/plugins`
- Cursor marketplace manifest: `https://raw.githubusercontent.com/cursor/plugins/main/.cursor-plugin/marketplace.json`
- Cursor Plugin reference: `https://cursor.com/docs/reference/plugins`
- Antigravity Plugins (IDE manual installation): `https://antigravity.google/docs/plugins?tab=ide`
- Gemini CLI extensions reference: `https://geminicli.com/docs/extensions/reference/`
- Kiro Powers creation docs: `https://kiro.dev/docs/powers/create/`
- Kiro Powers installation docs: `https://kiro.dev/docs/powers/installation/`
- GitHub Copilot CLI plugin reference: `https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference`
- VS Code Agent Plugins: `https://code.visualstudio.com/docs/agent-customization/agent-plugins`
- OpenCode plugins: `https://opencode.ai/docs/plugins/`
- Cline plugins: `https://docs.cline.bot/customization/plugins`
- ZCode Plugins: `https://zcode.z.ai/en/docs/plugin`
- Devin / Windsurf Cascade skills: `https://docs.devin.ai/desktop/cascade/skills`
- Devin / Windsurf Cascade hooks: `https://docs.devin.ai/desktop/cascade/hooks`

# MCP Management Design

## Ownership

- `packages/shared/types/mcp.ts`: normalized MCP types, target IDs, market template contracts.
- `packages/shared/utils/mcp-config.ts`: pure validation, normalization, projection, and merge helpers.
- `packages/core/src/mcp-source.ts`: custom MCP source inference from commands, URLs, GitHub repositories, and local source folders.
- `packages/core/src/mcp-library.ts`: filesystem-backed local MCP library under `data/mcp/library.json`.
- `apps/desktop/src/main/ipc/mcp.ipc.ts`: desktop IPC for CRUD, preview, import, and apply.
- `apps/desktop/src/preload/api/mcp.ts`: typed renderer bridge.
- `apps/desktop/src/renderer/stores/mcp.store.ts`: UI state and orchestration.
- `apps/desktop/src/renderer/components/mcp/McpManager.tsx`: MCP module UI.

## Data Boundary

MCP records are durable user data, not app settings and not SQLite prompt/skill rows. PromptHub stores them in the same `data/` area family as prompts, rules, and skills:

`<userData>/data/mcp/library.json`

Older builds wrote the library to `<userData>/config/mcp-library.json`. The MCP library service still reads that legacy file when the new data file is missing, immediately normalizes it into `data/mcp/library.json`, and keeps the legacy file as a compatibility backup.

The file contains:

- `version`
- `servers`
- `bindings`
- `updatedAt`

This avoids adding a DB migration while keeping MCP state out of React-only local storage. If sync or multi-user ownership is added later, this file can migrate into SQLite or a workspace export contract.

## Target Formats

- Codex: TOML tables under `[mcp_servers.<name>]`.
- Generic MCP clients: JSON `{ "mcpServers": { "<name>": ... } }`.
- VS Code: JSON `{ "servers": { "<name>": ... } }`.
- OpenCode: JSON `mcp` object in either global `~/.config/opencode/opencode.json` or project `<projectRoot>/opencode.json`.
- Kiro: JSON `mcpServers` object in either global `~/.kiro/settings/mcp.json` or workspace `<projectRoot>/.kiro/settings/mcp.json`.
- Kilo Code: JSONC `mcp` object in global `~/.config/kilo/kilo.jsonc` and project `<projectRoot>/kilo.jsonc`. The UI exposes one default Kilo Code target per scope so Kilo is one platform, not multiple path/format variants. Compatible custom paths such as `.kilo/kilo.jsonc` are handled by static parsing and lower-level custom path flows, not by duplicating Agent or Project MCP cards.

First version models apply targets by path and target type. Built-in path helpers cover common global locations; registered PromptHub projects derive workspace targets for OpenCode, Kiro, and one default Kilo Code `kilo.jsonc` target. Users can still apply to a custom path through lower-level CLI/API flows.

## Safety

- Normalize names to MCP-safe identifiers.
- Reject incomplete transport definitions.
- Preserve unrelated config keys during merge.
- Create a timestamped backup beside the target file before writing.
- Write target config files with same-directory temp files followed by rename so a crash does not leave a half-written agent config.
- Reject same-name target entries by default when the target file already contains an MCP server not recorded in PromptHub's binding for that target. UI flows may ask for confirmation and retry with `force`; CLI users must pass `--force`.
- Static health checks may inspect command availability, URL syntax, cwd existence, required env values, and placeholder values.
- Do not start unknown MCP server processes, call tools, or proxy traffic in this change.
- Custom source import is static. PromptHub may read metadata files such as `package.json`, `pyproject.toml`, and `Dockerfile`, but it must not install dependencies or execute repository code while creating the MCP record.
- MCP env values are local MCP-server-level configuration stored in `data/mcp/library.json`. They are projected into each selected agent target during distribution; PromptHub does not mutate the OS process environment or a global machine env store.
- `.env` import is selective: PromptHub imports only env keys inferred from the selected MCP server or keys explicitly selected by the caller. It must not bulk-import a whole process env or `.env` file.
- Required environment variables must also be editable directly in the MCP detail page. `.env` import is a bulk-fill helper, not the primary or only configuration path.
- Desktop MCP distribution UI treats Settings `disabledPlatformIds` as the single source of truth for visible/enabled agent targets. Disabled platforms are hidden from MCP Agent views, detail distribution panels, batch deploy dialogs, and stale dialog apply actions.
- Kilo Code is supported as its own MCP target. PromptHub does not alias `kilo` to Kiro; it writes Kilo's `mcp` shape and reads JSON/JSONC config files statically.

## Market Metadata

Built-in templates carry source metadata, runtime/package hints, homepage, repository, documentation URL, and required-env information where available. Source records distinguish official, verified, and community discovery sources so the UI can explain provenance without implying that every community listing is first-party.

## CLI

The CLI reads and writes the same `data/mcp/library.json` file as the desktop app. The first MCP CLI surface covers library sync and diagnostics only:

- `mcp list`
- `mcp get <id|name>`
- `mcp market`
- `mcp sources`
- `mcp install <template-id>`
- `mcp import <file>`
- `mcp check [id|name]`
- `mcp env-import <id|name> --file <.env> [--keys A,B]`
- `mcp enable <id|name>`
- `mcp disable <id|name>`
- `mcp export --target <target> [--servers a,b]`
- `mcp apply --preset <preset-id> [--servers a,b] [--force]`
- `mcp apply --target <target> --path <file> [--servers a,b] [--force]`
- `mcp remove --preset <preset-id> --servers a,b`
- `mcp remove --target <target> --path <file> --servers a,b`

Codex TOML removal treats `[mcp_servers.<name>]` as a subtree boundary. Removing
`<name>` must also remove child sections such as
`[mcp_servers.<name>.tools.<tool>]`, because Codex treats those child tables as
part of the same server configuration. Exact TOML key parsing is required so
similarly named servers remain untouched.

## UI

The MCP module follows the Skill management workbench pattern:

- Library: installed MCP servers in a dense left list, with the selected MCP editor and Agent distribution panel on the right.
- Market: Skill Store-style source channels. PromptHub Official Store is first and reserved for PromptHub-owned catalog content; third-party/community channels such as MCP Registry must load from their real remote catalog responses rather than bundled placeholder templates.
- Agent MCP: global agent config targets only. Project/workspace targets must not appear here.
- Project MCP: project-level config targets derived from registered PromptHub projects, kept separate from Agent MCP.

The selected MCP detail owns the normal distribution workflow. Users can choose a built-in or custom target, preview the generated config, apply only the selected MCP server, and see existing applied targets without leaving the detail panel.

MCP is added to desktop home modules and appears in the left rail beside Prompts, Skills, and Rules.

The New MCP modal follows the Skill creation pattern with two entry modes:

- Add from source: paste a command, URL, or filesystem path; choose an MCP config file; choose a local source folder; or drop a config/source item into the modal.
- Manual setup: fill the normalized MCP fields directly.

# MCP Management

## Problem

PromptHub can distribute Skills, Rules, and prompts, but MCP server setup is still fragmented across Codex, Claude, Cursor, VS Code, Cline, and similar agent tools. Users need one place to manage reusable MCP server definitions and apply them to multiple agents without running a gateway or copying JSON/TOML by hand.

## Scope

- Add MCP as a first-class desktop module beside Prompts, Skills, and Rules.
- Store MCP server definitions in a PromptHub-owned local configuration file.
- Provide MCP Store channels backed by real catalog sources, with PromptHub Official Store reserved for PromptHub-owned marketplace content.
- Generate target-specific config for Codex TOML, `mcpServers` JSON clients, and VS Code `servers` JSON clients.
- Apply generated config to selected global/workspace targets with a backup before modification.
- Import existing supported config files into the PromptHub MCP library.

## Non-Goals

- No MCP gateway, proxy, router, or hosted runtime.
- No version update workflow, rating system, or security scanning in this change.
- No Skill package lifecycle for MCP entries; MCP entries are configuration records, not directory packages.

## Risks

- Agent config formats differ by client and scope. The implementation must use a normalized internal model and projection functions instead of duplicating raw snippets.
- Config writes can overwrite user-managed settings. Apply operations must preserve unrelated config content and create backups.
- MCP secrets may appear in environment variables or headers. First version stores user-entered values locally and makes project/workspace distribution explicit.

## Rollback

- PromptHub MCP library data lives in `data/mcp/library.json`, with legacy reads from `config/mcp-library.json`.
- Target apply operations create timestamped `.prompthub-mcp-backup-*` files before writing.
- Users can delete MCP entries from PromptHub without touching already-applied target configs unless they explicitly remove from a target.

# Design

## Boundary

- Renderer state owns user-defined custom store sources for Skill, MCP, and Plugin stores.
- Shared source CRUD helpers live in renderer services because current Skill custom sources are renderer-persisted and MCP/Plugin built-in sources are fetched through existing IPC.
- Product adapters translate the shared source shape into `SkillStoreSource`, `McpMarketSource`, and `PluginMarketSource`.
- Plugin IPC accepts optional source overrides so preview/install can resolve custom marketplace entries with the same source list the renderer used to show them.

## Data Shape

The shared custom source shape follows the Skill Store fields:

- `id`
- `name`
- `type`: `marketplace-json`, `git-repo`, or `local-dir`
- `url`
- optional `branch`
- optional `directory`
- `enabled`
- `order`
- `createdAt`

Product adapters add product-specific fields:

- MCP: `label`, `description`, `trustLevel`, `url`
- Plugin: `displayName`, `repository`, `marketplaceFile`, `rawJsonUrl`, `trustLevel`

## Confirmation

Deletion confirmation is UI-owned. Store mutation methods remain direct state mutations so callers can compose confirmation, tests, or future assistant approvals above them.

## Compatibility

Existing Skill custom sources remain compatible because the shared shape is a superset of the existing Skill source fields.

MCP and Plugin sources are additive. Built-in sources remain available and custom sources are merged after built-ins.

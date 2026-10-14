# MCP version history

Desktop **My MCP → server detail → Versions** and the CLI share one local
library. New CLI workspaces do not require desktop initialization.

```sh
prompthub --data-dir /absolute/path/to/workspace mcp version list SERVER_ID
prompthub --data-dir /absolute/path/to/workspace mcp version create SERVER_ID --note "Baseline"
prompthub --data-dir /absolute/path/to/workspace mcp version get SERVER_ID 1
prompthub --data-dir /absolute/path/to/workspace mcp version diff SERVER_ID 1 2
prompthub --data-dir /absolute/path/to/workspace mcp version note SERVER_ID 1 --note "Reviewed"
prompthub --data-dir /absolute/path/to/workspace mcp version restore SERVER_ID 1
prompthub --data-dir /absolute/path/to/workspace mcp version delete SERVER_ID 2
```

Configuration changes create versions; favorites, tags and personal notes do not.
Restore creates the next version and does not write Agent configuration files.
The current version cannot be deleted, and deleted version numbers are not reused.
Lists are paginated (`--offset`, `--limit`). Details and comparisons redact credentials.
The self-hosted Web app keeps its existing read-only Agent MCP and opaque backup
capabilities; it does not expose desktop filesystem distribution or version editing.

## Storage and upgrade

SQLite owns current definitions, bindings, annotations, version metadata and
encrypted credentials. Immutable historical contents remain under the workspace's
`data/mcp/` directory. Desktop and CLI protect the same AES-256-GCM master key
through the operating system credential store. Linux needs an available persistent
Secret Service backend. No plaintext master-key file is created.

Startup adopts supported legacy JSON and canonical bundles once. Before upgrading,
keep a verified whole-workspace backup. Missing device credentials do not hide the
library: metadata stays available, while credential-dependent actions fail until
key access is restored. Original credential sources are retained until conversion
can complete. Backups include encrypted SQLite records and referenced history, not
retained legacy plaintext. A backup on another device does not transfer OS keys.

Rollback requires restoring the whole pre-upgrade workspace with its original
device-key access; do not open an upgraded workspace using an older application.
A damaged or missing authoritative MCP database requires a valid database backup,
not an empty catalog rebuild from historical files alone.

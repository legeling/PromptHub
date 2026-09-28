# Agent Management Platform Adapter Designs

This file is a supporting design record within
`spec/changes/active/agent-management-workbench/`. It does not create a
parallel change, registry, or source of truth. The architecture and
traceability table remain in `design.md`; platform-specific designs may live
here to keep the main design document below the project size limit.

2026-09-28 状态修订：本文中旧数据库/schema 候选、历史根和备用文件写入的描述
属于待收敛实现；[FR-AGENT-138](specs/agent-management/spec.md#fr-agent-138-one-current-contract-per-agent-capability)
已替换对应的兼容要求。原生当前合同仍须按产品和版本核实，不能迁移第三方私有数据库。
执行方案见 [当前契约设计](current-contract-design.md)。

## `DES-AGENT-038`: Cursor Current Asset And Native Plugin Boundary

### Ownership and path projection

Cursor owns `~/.cursor`. The canonical platform registry exposes only
evidence-backed user asset paths:

- `skills/` for user Skills
- `agents/` for user SubAgents
- `mcp.json` for user MCP configuration
- `plugins/` as the read-only discovery root

Project `.cursor/skills/`, `.cursor/agents/`, `.cursor/rules/`,
`.cursor/mcp.json`, and `AGENTS.md` remain project-owned assets. User Rules
are settings-owned, so PromptHub declares no `globalRuleFile`. Private
settings databases, authentication, transcripts, checkpoints, snapshots,
caches, logs, and extension/runtime state remain Cursor-owned and excluded
from generic config editing and ordinary Agent backup.

The registry is the only path fact source. Capability inventory derives
Skills, MCP, and Plugins as `partial`, Launch as `supported`, and keeps Rules,
Config Files, Provider, Sessions, Usage, and Maintenance `planned` or
unsupported according to the existing capability projection. Per-run CLI
model selection and interactive history or usage commands do not establish a
durable management contract.

### Plugin installation truth gate

Cursor's public package manifest and an on-disk package are package-shape
evidence, not activation evidence. PromptHub keeps bounded, symlink-safe,
read-only discovery below Marketplace cache and local Plugin roots, but the
shared target matrix disables direct distribution. The shared target gate
rejects a Cursor distribution before target resolution or filesystem writes.

A later adapter may enable Cursor only after it supports either a documented
Marketplace workflow or a verified local-plugin workflow with:

1. package preview and explicit confirmation
2. bounded execution or filesystem work
3. native load/activation verification after reload
4. uninstall or exact rollback on failure

This batch changes no Cursor database, credential, runtime file, or project
asset and requires no data migration. The existing scanner remains bounded by
its depth, entry, and package limits; changing the canonical Plugin root does
not add another scan or increase asymptotic cost.

## `DES-AGENT-039`: Cherry Studio Current Data And Skill Boundary

Cherry Studio's public path registry at revision
`9785c652a6d477fcf3ab86719f4bdd1e57736bbd` defines the current Electron
user-data database as `Data/cherrystudio.sqlite` and the installed Skill
library as `Data/Skills`. PromptHub references that contract without copying
or vendoring upstream source.

The canonical PromptHub registry keeps the platform-specific default user-data
root, normalizes the Skill relative path to `Data/Skills`, and adds only the
verified macOS application launch allowlist. A relocated Cherry user-data
directory remains an explicit built-in Agent root override; this batch does
not parse `boot-config.json`, private settings, or runtime databases to infer
it.

The existing Skill adapter already supports current `skills` / `agent_skills`
and compatible legacy `agent_global_skill` / `agent_skill` schemas. Database
selection becomes:

1. `Data/cherrystudio.sqlite`
2. `Data/agent.db`
3. `Data/agents.db`
4. root `cherrystudio.sqlite`

Only existing files are opened. No database is created as a side effect of
probing, no schema migration runs, and an unsupported schema fails closed. The
current path is first so an obsolete compatible database cannot receive a
write while Cherry Studio reads the v2 database. Selection is bounded by four
constant-time existence checks and one schema probe; Skill package processing
retains its existing bounded behavior.

Provider, MCP, agent/session, credential, memory, IndexedDB, Local Storage,
cache, and runtime state remain Cherry-owned. The Plugin target stays
`composite` and disabled because the current Skills system is not evidence of
a single native Plugin package. Hardening the existing database-backed Skill
write into a cross-filesystem transaction remains a separate Skills-owner
follow-up and is not falsely claimed here.

## `DES-AGENT-040`: Windsurf Public Transcript Adapter

Current official Cascade Hooks documentation defines an opt-in
`post_cascade_response_with_transcript` hook whose output is a local JSONL file
at `~/.windsurf/transcripts/<trajectory_id>.jsonl`. Transcript files use
`0600` permissions, the product retains at most 100 files, and the step schema
may evolve. PromptHub reuses this public contract without copying upstream
source and does not inspect proprietary protobuf sessions below
`~/.codeium/windsurf/cascade`.

The adapter owns no data. It scans only direct, non-symlinked `*.jsonl` files
under the transcript root, with the shared 2,000-file ceiling even though the
native producer currently retains 100. Listing sorts by modification time and
reads metadata only for the requested page. Metadata reads at most 256 KiB per
selected file; detail reads at most 2 MiB and bounds each visible entry to
64 KiB. For a page of `p` items, work is `O(n log n + p * b)`, where `n <=
2,000` and `b <= 256 KiB`; memory remains bounded by the selected page and one
file prefix.

Only two documented visible step shapes are projected:

- `user_input.user_response` -> `user`
- `planner_response.response` -> `assistant`

Other step types, including `code_action`, commands, tool arguments, results,
file contents, and unknown future records, are ignored rather than serialized
to the renderer. Malformed JSON lines increment `parseErrors`. Symlinks,
out-of-root paths, invalid trajectory ids, and files removed between list/read
fail closed. The adapter never writes, repairs, prunes, or chmods source files.

The public contract has no stable resume command or project/model metadata, so
those fields remain null. Windsurf Sessions becomes `partial`, not fully
supported. Provider, Usage, generic Config Files, Maintenance, proprietary
runtime sessions, and Plugin installation remain unavailable. Existing
Skills, MCP, global Rules, launch, and disabled composite Plugin declarations
do not change.

## `DES-AGENT-041`: Kiro CLI Settings, Sessions, And Power Boundary

Kiro keeps one canonical root resolved from `KIRO_HOME` or `~/.kiro`.
PromptHub adds the documented `settings/cli.json` and macOS application path
to the platform registry while retaining the existing Skills, MCP, agents,
and Power package paths. The multi-file `steering/` directory is intentionally
not assigned to the single-file `globalRuleFile` field; a later Rules-owned
directory adapter must define its selection and mutation contract. The
registry is the path source of truth; renderer code does not add a second Kiro
allowlist.

The model adapter is deliberately partial. It reads and writes only
`chat.defaultModel` through the existing JSONC mutation pipeline, reports the
credential state as `platform-managed`, and emits no endpoint. Existing
bounded read, symlink rejection, backup, atomic replacement, digest check,
reread verification, and rollback behavior remain mandatory. Time and memory
are `O(b)` in the bounded settings file size; no network call is introduced.

The session adapter scans only direct `sessions/cli/*.json` metadata sidecars
and opens the matching `<session_id>.jsonl`. It caps the inventory at 2,000
files, metadata at 256 KiB, detail at 2 MiB, and visible entries at 64 KiB.
Metadata ids must match safe filenames, symlinks and out-of-root paths fail
closed, and malformed records increment diagnostics without aborting later
valid records. Listing costs `O(n log n + p * b)` for `n <= 2,000`; detail
memory is bounded by one file prefix.

Only locally verified `Prompt` and `AssistantMessage` records contribute
visible `text` content. `ToolResults`, `thinking`, `toolUse`, future record
kinds, and non-text content are ignored. This runtime evidence is
version-tolerant rather than a claimed public stable schema, so Sessions is
`partial`, mutations are forbidden, and `resume` remains null.

Kiro Power installation is native-product registration, not a directory copy.
The existing read-only Power package inventory may remain partial, but the
distribution target is disabled and fails before package resolution or
filesystem writes. A future native import adapter requires its own confirmed
contract, preview, user consent, activation verification, and rollback.

## `DES-AGENT-042`: Grok Build Provider And Model Adapter

### Public contract and ownership

Grok Build owns the root resolved from `GROK_HOME` or `~/.grok`. PromptHub
reuses the public `config.toml` contract without copying or vendoring Grok
Build or CC Switch source:

- `[models].default` selects the active alias
- `[model.<alias>]` declares `model`, `base_url`, `name`, `env_key`,
  `api_backend`, and optional `context_window`
- `api_backend` maps to PromptHub's direct protocols:
  `chat_completions` -> `openai-chat`, `responses` -> `openai-responses`, and
  `messages` -> `anthropic-messages`

The adapter reads one bounded user config file and performs no project config
mutation. Built-in aliases without a matching `[model.<alias>]` entry remain
platform-native. Grok sessions, OIDC state, `auth.json`,
`mcp_credentials.json`, caches, logs, memory, and runtime files remain
Grok-owned.

### Credential boundary

PromptHub does not place managed secrets in Grok `config.toml`. A custom
Provider Profile stores only the environment-key name and Grok resolves the
value from its process environment. Connection/model probes may read that
environment value in the Electron main process, but the value never crosses
IPC, enters the Profile DB, snapshots, logs, errors, export, or ordinary
backup.

An imported model that contains `api_key` or sensitive custom headers is
redacted and read-only. PromptHub may select a native built-in alias without
claiming ownership of its session or `XAI_API_KEY`, but it must not convert
native inline authentication into a mutable Profile. The Profile form hides
the managed-secret control for Grok and requires `env_key` for custom direct
Providers.

### Mutation, recovery, and cost

The adapter validates the absolute root and contained `config.toml`, rejects
symlinks and oversized/malformed input, parses with the existing TOML parser,
and preserves unrelated semantic fields. Activation:

1. reads and hashes the current file
2. reconciles only the selected alias fields and active default
3. writes an encrypted full-file backup when a source file exists
4. checks the digest again immediately before write
5. atomically replaces the file
6. reparses and verifies the public projection
7. restores the encrypted backup or removes a newly created file on failure

The read/write path is `O(b)` time and memory for one bounded config of size
`b`; Provider lookup is constant-time by alias. Network probes retain the
existing SSRF, redirect, timeout, retry, response-size, abort, and redaction
limits. No unbounded process, port, watcher, cache, or queue is introduced.

## `DES-AGENT-043`: Amp Asset And MCP Projection

Amp remains a canonical `SkillPlatform`; no Amp-specific asset store is added.
The platform root is corrected to the documented `.config/amp` path on all
operating systems, while the former Windows `%APPDATA%\amp` root is retained
only as a compatibility fallback. Skills and `AGENTS.md` remain projected by
the existing Skills and Rules owners.

The MCP owner gains an `amp` target with global
`<home>/.config/amp/settings.json` and workspace
`<project>/.amp/settings.json`. The shared JSON adapter treats
`amp.mcpServers` as one literal top-level key. Existing bounded JSON/JSONC
read, per-entry reconciliation, backup, atomic write, verification and rollback
remain unchanged; unrelated dotted settings are copied through. The operation
is `O(n)` in the bounded settings file and does not add scanning or network
fan-out.

The capability inventory marks Amp Provider as unsupported rather than planned:
the public product exposes Amp-owned modes/models, not a user-owned Provider
projection. Sessions, Usage, raw Config Files, Launch, Maintenance and Plugin
distribution remain planned. Although system and project Plugin paths are
documented, merely copying executable TypeScript would not prove native trust
or activation; no Plugin target is enabled in this batch.

## `DES-AGENT-062`: Qwen Definition Discovery

### Ownership and product surface

This design completes the remaining discovery portion of `FR-AGENT-029`
without introducing another asset store. Qwen Code remains the owner of:

- user SubAgents in `<QWEN_HOME>/agents/*.md`
- project SubAgents in `<project>/.qwen/agents/*.md`
- user commands in `<QWEN_HOME>/commands/**/*.md`
- project commands in `<project>/.qwen/commands/**/*.md`

PromptHub exposes one Qwen-only Definitions tab containing SubAgents and
Commands. It is a bounded, read-only inventory and does not copy definitions
into SQLite, Skills, Rules, Plugins, backup, or sync. Extension-owned child
agents and commands are excluded because their parent extension remains the
only lifecycle owner. Commands remain discovery-first and are not inferred to
be Skills or Plugins.

The renderer selects only `user` or `project`, a known project id, and an
entry's validated relative path. It never supplies an absolute filesystem
root. The main process resolves the user root through the canonical `qwen`
platform context and resolves project ids from the existing `skillProjects`
setting. No project path or definition body crosses the IPC contract.

### Parsing and renderer-safe projection

Both definition kinds use Markdown with optional YAML frontmatter parsed by
the existing strict YAML core-schema parser. SubAgents require a non-empty
`name`, `description`, and body; their optional `model`, `approvalMode`,
`tools`, and `disallowedTools` fields are projected after type and size
validation. Commands require a non-empty body, derive their command name from
the relative path (`review/frontend.md` becomes `review:frontend`), and may
project a bounded frontmatter description.

The public entry contains only scope, kind, relative path, normalized metadata,
status, warnings, byte size, and modification time. Definition bodies, shell
expansions, prompts, absolute paths, and unknown frontmatter never enter the
renderer. Metadata containing credential-like material is replaced with a
redacted marker and a warning rather than echoed. Invalid files remain visible
with stable status so users can locate and repair them in Qwen Code or their
editor.

### Filesystem, capacity, and failure boundary

The scanner reads direct SubAgent files and recursively reads Command
directories to a maximum depth of eight. One request is bounded to:

- 200 returned definitions
- 1,000 visited directory entries
- 256 KiB per file
- 2 MiB cumulative file content

Only regular `.md` files are accepted. Symlink files/directories, null bytes,
absolute or parent-traversing relative paths, containment escapes, permission
errors, malformed YAML, duplicate keys, oversized content, and concurrent
disappearance are isolated and reported without failing unrelated entries.
Missing directories produce an empty inventory.

For `n <= 1,000` visited entries and `b <= 2 MiB` read bytes, scanning is
`O(n + b)` and deterministic sorting is `O(r log r)` for `r <= 200` returned
entries. Memory is bounded by one file plus the capped result set. The
implementation starts no watcher, process, port, queue, cache, or network
request. The Open action re-resolves and re-validates the selected file in the
main process immediately before invoking the OS shell.

# Pi Agent Separation Design

## Analyze Gate

No blocking conflict exists. The stable platform registry already treats Oh My
Pi as an independent product. Official Pi documentation establishes a
different default root (`~/.pi/agent`), executable (`pi`), JSON settings,
extension directory and JSONL session store. The existing canonical platform
registry and Agent workbench remain the source of truth.

## `DES-PI-001`: Independent Registry Entry

Add platform id `pi` beside `oh-my-pi`. Detection remains a single bounded
linear pass over built-ins, so the additional entry changes work from `O(n)` to
`O(n + 1)` with one filesystem existence check. No alias or cross-product
deduplication is introduced.

## `DES-PI-002`: Path-Owned Capabilities

Pi derives:

- root: `~/.pi/agent`
- Skills: `skills`
- extensions: `extensions`
- global instructions: `AGENTS.md`
- editable configuration: `settings.json`, `models.json`, `AGENTS.md`
- CLI diagnostic: `pi --version`

`auth.json`, sessions and package caches are excluded from editable config.
Pi now declares `mcpRelativePath: mcp.json`; the current capability boundary is
`FR-AGENT-111` in the Agent workbench requirements. Upstream Pi 1.2.0 defines
native user/project MCP files, while the MCP manager preserves distinct
adapter/shared candidates. File projection remains partial without native
runtime consumption evidence and never executes/installs `pi-mcp-adapter`.

## `DES-PI-003`: Parameterized Pi-Family Session Reader

Keep one parser for the shared version-3 JSONL family, parameterized by platform
id, adapter id, executable and resume arguments. Each adapter receives a
separate resolved root. Scans remain depth-bounded, prefix-bounded and
symlink-safe; list work is `O(f + p)` for `f` candidate files and `p` requested
metadata rows, while transcript memory remains bounded by the existing detail
limit.

Pi recognizes the upstream `model_change.provider` plus
`model_change.modelId` shape. Oh My Pi retains its existing identity and resume
contract.

## `DES-PI-004`: Pi JSON Model Projection

Extend the existing main-owned JSONC adapter with Pi's documented
`defaultProvider` and `defaultModel` keys. Model selection is normalized as
separate provider and model fields in the shared UI contract; a qualified
`provider/model` update is split back into the two native fields. Provider
credentials and `models.json` contents are not projected.

## `DES-PI-005`: Bundled Official Badge

Bundle the official Pi badge from `https://pi.dev/favicon.svg` at
`apps/desktop/src/renderer/assets/platforms/pi.svg` and map `pi` to it in
`PlatformIcon`. Keep the renderer asset local so the Agent workbench has no
runtime network dependency. If the asset cannot load, use Lucide's semantic
`Pi` icon as the failure fallback; Oh My Pi retains its own terminal fallback.
Record the source and local path in `spec/knowledge/reference/agent-platforms.md`.

## `DES-PI-006`: Bundled Oh My Pi Mark

Bundle the official Oh My Pi mark from
`https://github.com/can1357/oh-my-pi/blob/main/assets/icon.svg` at
`apps/desktop/src/renderer/assets/platforms/oh-my-pi.svg` and map
`oh-my-pi` to it in `PlatformIcon`. The upstream SVG is transparent with a
light mark, so apply a small dark rounded backing and padding to the image in
the renderer; do not recolor or redraw the upstream mark. Keep the terminal
Lucide icon only as the load-failure fallback.

## Failure And Recovery

- Missing directories produce an undetected Agent or an empty session list.
- Malformed or oversized settings return the existing stable invalid status.
- Unsafe session ids, traversal and symlinks remain rejected.
- Failed or concurrently changed model writes restore the original file.

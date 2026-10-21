# Implementation

## Product

Web

## Status

in progress. Native transcript, usage and appearance adapters and their acceptance remain open.

## Implemented

- Added shared Agent service contracts for the eleven stable service domains.
- Added `packages/core` orchestration that bounds results to 200 items and
  separates service availability from browser-inapplicable native actions.
- Added authenticated manifest and domain routes under
  `/api/agents/:agentId/services` plus matching browser bridge methods.
- Added a Web Agent service workspace that replaces Electron-dependent panels
  in the browser while leaving the Desktop presentation unchanged.
- Connected existing Skill, Rule, MCP/Plugin snapshot, Provider DB,
  Appearance, Config summary, Qwen Definition, Session index, and Maintenance
  sources.
- Added bounded configuration probes (16 concurrent, 200 declarations),
  bounded directory/Definition scans, Unicode filename support, and symlink
  rejection.
- Updated Web Agent capabilities and all seven renderer locales.
- Extracted Config validation/redaction/write orchestration, encrypted backup,
  Provider profile orchestration, and secret storage from Desktop into
  `packages/core`; Desktop keeps thin safeStorage adapters.
- Added administrator-only Config list/read/write routes. Config saves use
  optimistic revisions, format validation, secret placeholder preservation,
  AES-256-GCM rollback backups, atomic replacement, verification, and rollback.
- Added administrator-only Provider profile CRUD, copy, archive, export, and
  delete routes backed by the existing SQLite profile tables. Credentials use
  the encrypted server secret store and are never returned to the browser.
- Added bounded Session index search/pagination and redacted preview details,
  rendered through the existing Session workspace without exposing server
  source paths or fabricating native resume support.
- Split Agent HTTP bridge logic into `install-agent-bridge.ts` so the existing
  Web bridge stays below the project source-file size limit.
- Removed browser-inapplicable Provider native import/activation copy and host
  file-manager actions while retaining server-side Config editing.

## Remaining Gap

- Provider native-config import, activation, and provider/model connectivity
  tests remain Desktop-only; browser-safe Profile management is complete.
- Session index browsing is available; native transcript parsing, annotations,
  full export, and resume adaptation remain pending. Usage remains a truthful
  partial service until its server probe adapter is extracted from Electron
  main.
- Appearance is browse-only; import/export and supported server runtime apply
  actions remain pending.

## Verification

- Web typecheck and lint passed.
- The full Web Vitest suite passed.
- Focused Agent coverage passed 28 tests; inventory and shared service shim
  reached 100% statements/branches/functions/lines, and Agent routes reached
  98.37% statements with 100% functions.
- Desktop typecheck, lint, and the affected Agent component tests passed,
  including Web-specific Provider copy and hidden file-manager actions.
- The Web client/server production build passed. Vite still reports the
  pre-existing authenticated workspace chunk-size warning; the Agent workspace
  chunk is 223.98 kB before gzip and remains split from the workspace shell.
- Tests confirmed the route suite creates no backup in `apps/web/data`.
- A production self-hosted browser smoke test confirmed the service matrix,
  Provider form/empty state, Config secret redaction, hidden native actions,
  and indexed Session workspace; authenticated Agent requests returned 200.
- No new DB scope, cloud account model, or connected-device protocol was added.

## Converge

- Not ready to archive. The stable Web boundary is synchronized for the shipped
  read-service slice, but deep domain operations and their rollback/security
  tests remain open above.

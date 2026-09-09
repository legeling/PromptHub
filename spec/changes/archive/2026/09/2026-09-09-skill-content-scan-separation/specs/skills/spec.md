# Content scanning delta

## FR-SCS-001 Business independence

All normal operations succeed or fail only on their own data, authorization and
filesystem/transport contracts, regardless of content findings, scanner availability,
legacy scan flags or historical reports. Content scanners are not lifecycle stages.

## FR-SCS-002 Explicit opt-in

Standalone scanning defaults disabled. Old automatic/channel/trust settings cannot
enable it. A scan requires an explicit user action after enablement; the CLI scan
command is an explicit per-invocation opt-in. Static scanning is the default method;
AI assistance must be explicitly selected and configured.

## FR-SCS-003 Content-only assessment

Equal content yields equal findings independent of source host, source availability,
channel, marketplace metadata or source reputation. Static scanning performs no
network requests. AI receives content, not source-trust metadata, and never executes
the content. Mere presence of scripts, sudo references or explanatory text does not
establish malicious behavior. Findings and unavailable/incomplete analysis are
reported honestly; static results are not labeled as AI.

## FR-SCS-004 Independent integrity protections

Path traversal, unsafe archive extraction, escaping filesystem entries, invalid
package structure and nonrepresentable payloads remain rejected by their owning
operation. Optional analysis budgets cannot reduce backup/version/package capacity.

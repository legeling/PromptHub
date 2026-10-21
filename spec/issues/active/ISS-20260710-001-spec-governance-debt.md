# ISS-20260710-001: Spec Governance Debt

## Status

- State: open
- Created: 2026-07-10
- Updated: 2026-10-21
- Owner surface: internal documentation governance
- Authority: [document routing](../../rules/document-routing-rules.md)

## Initial inventory and reconciliation (2026-10-21, historical snapshot)

The tracked repository contains 1579 Markdown documents: 1163 under change
archives, 275 in 49 original active change directories, 34 knowledge documents,
8 rule documents and 6 workflow entries. The completed directory is a navigation
entry, not a second archive. Counts describe this dated audit, not a size gate.

All 49 original active directories were inspected for status, remaining tasks
and recorded implementation/verification evidence. Ten records had completed
scope but still appeared active: nine Prompt/UI changes and 0.6.0 version
alignment. They first received explicit terminal status. The subsequent lifecycle cleanup
below moved all twelve completed records into completed/.
The [generated inventory](../../changes/index.md) owns current counts and names.

Other records retain their unfinished implementation, migration, native-device,
external-service or publication-attribution work. Phase-first, nonstandard and
missing status headers were normalized so the index exposes these distinctions.
Existing verification records were reviewed; this audit does not rerun product
acceptance or assert that historical test results cover current main.

## Corrected stale entrypoints

- The system topic still required five artifacts and physical archival for every
  non-trivial change. It now defers to the current risk-based documentation rule.
  The same obsolete acceptance criteria from this issue are retired.
- Completed records retained under active paths are now discoverable through the
  completed entry and generated index; directory location alone is not status.
- GitHub's public release list on 2026-10-21 selects 0.6.0. The unavailable
  original 0.6.1 release and paused replacement are distinguished from historical
  publication evidence. Public downloads and website metadata follow 0.6.0;
  local product manifests and replacement work retain 0.6.1.
- The two Skill proposals that still said “not implemented” now point to their
  implementation/acceptance status. #191 closure is separated from unfinished
  broader safety-report acceptance. Old contribution version labels are historical.

## Remaining debt

- Review publication attribution for release-pending records against the actual
  containing tag and scoped acceptance. A later release number alone is not proof.
- Large Agent/platform and resource plans contain historical implementation
  paragraphs and old task checkboxes. Resolve them within their owning feature
  work; do not mark all tasks done from aggregate CI or move open acceptance into
  an archive. Foundation, settings authority, legacy recovery, MCP conflict work,
  image generation, protocol bridge and Web parity remain open.
- Seven localized READMEs repeat long product summaries, and the platform reference
  is 1749 lines. Future edits should keep one authority per topic and use links;
  this audit does not remove translated user guidance or split files mechanically.
- Historical change specs are not a current architecture source. In particular,
  early file/SQLite ownership and pre-merge Skill recovery descriptions must be
  read through the current stable topic and its later confirmed decisions.

## Acceptance for subsequent cleanup

- Current entrypoints agree with the authoritative topic and actual delivery state.
- Remaining tasks name concrete implementation, acceptance or external prerequisites.
- Completed/superseded work leaves the active index; references and evidence remain.
- No duplicate requirement documents, empty compliance files or forced ID scaffolding.
- Run the existing spec governance checks and relevant link/release consistency checks.

## Verification (2026-10-21)

- `pnpm verify:release:quick --surface governance --quiet`: exit 0; CI configuration, spec governance/index/traceability and source-size checks.
- `pnpm exec node --test scripts/version-alignment.test.mjs website/scripts/release-metadata.test.mjs`: 9/9 passed.
- Changed Markdown: 197 local file/site-route targets resolved; scoped `git diff --check` passed. The first link pass treated absolute website routes as filesystem paths; the corrected check uses the existing Astro route and public-asset layout.
- GitHub API: latest is v0.6.0 with the six advertised platform installer filenames; v0.6.1 returns 404. The first latest request timed out; the bounded recheck succeeded.
- No product functional suites, GUI, website production build, packaging or publication were run. Existing dependency environments were reused.

## Lifecycle and product organization (2026-10-21)

- Active contains only 37 unfinished changes. Twelve terminal records moved to completed/ with their full evidence and stable IDs; inbound references and sibling links were updated. New completion moves are required by the documentation rule and checked by the index generator.
- Every active/completed record declares its owning Product. The generated active list groups Shared, Desktop, CLI, Web, Cloudflare, Mobile and Delivery; cross-product work has one Shared owner. Historical archives remain collapsed in the index.
- The document homepage and behavior index now route by product and shared module. CLI distribution/integration and Cloudflare runtime contracts were extracted from Desktop/Web into their own topics without duplicating definitions.
- Completed Prompt/UI requirements were consolidated into the existing Desktop and Prompt workspace topics. Old batch-selection design is explicitly historical; current 2.5 semantics remain authoritative.
- The obsolete file-first storage design is archived. Its current references now route through storage architecture to the accepted Foundation contract and domain owners; no new migration or data cleanup is implied. The completed 2026-09-09 rule migration record also moved out of current policy.
- This closes the classification, terminal-directory and known obsolete-design gaps from this request. Remaining product acceptance and publication attribution stay with their active owners.

### Lifecycle verification

- `pnpm spec:test`: 7/7 governance tests passed, generated index matched, and 13 active changes with opted-in traceability passed. Tests exercise real temporary-directory moves, reject terminal active/nonterminal completed records, and check product grouping and invalid categories.
- All 60 files in the twelve moved directories remain present with their original requirement/design/test/task IDs. The archived storage design body and completed rule-migration body were preserved byte-for-byte.
- 492 local Markdown targets and cross-file heading anchors in affected spec documents resolved; scoped whitespace checks passed.
- No application behavior or data was changed; application suites, GUI and release builds were not run. The index reads only plan/task/implementation metadata plus directory names, linear in record count for the fixed product categories.

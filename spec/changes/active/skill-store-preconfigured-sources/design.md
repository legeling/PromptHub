# Design

## Boundary

ClawHub is a built-in remote Skill Store source, not a user custom source type. It is selected by source id `clawhub` and loaded by `store-remote-sync`.

Preconfigured public stores must still pass the main-process remote fetch SSRF
guard. Only their known public hosts are trusted for compatibility/reserved DNS
address mappings:

- `skills.sh`
- `www.skills.sh`
- `clawhub.ai`
- `www.clawhub.ai`

This does not allow arbitrary private-network access from renderer code.

## Data

No schema change. ClawHub entries are normalized into `RegistrySkill`:

- `source_id`: built from `sourceType=clawhub`, canonical ClawHub URL, and slug.
- `source_label`: `ClawHub`.
- `store_url`: canonical ClawHub page URL.
- `content_url`: `https://clawhub.ai/api/v1/skills/{slug}/file?path=SKILL.md`.
- `content`: fetched `SKILL.md` when available, otherwise a safe Markdown fallback from metadata.

## API

Use public read endpoints:

- `GET /api/v1/skills?limit=&sort=trending`
- `GET /api/v1/skills/{slug}/file?path=SKILL.md`

skills.sh is loaded from the public leaderboard HTML and then from each skill
detail page. The store reads `totalSkills` from the skills.sh page payload when
available and treats PromptHub's page size as the batch boundary. It loads one
batch of 24 detail pages at a time and exposes an offset cursor for continued
browsing. When the user scrolls near the end of the list, PromptHub loads the
next batch and appends it to the visible catalog.

Search is index-first for skills.sh. The loader parses lightweight entries from
the page anchors and embedded Next payload (`source`, `skillId`, `name`) before
fetching detail pages. When the user searches, PromptHub filters that lightweight
index first and fetches only the current batch of matching details. This keeps
search usable without eagerly downloading thousands of `SKILL.md` files.

Persisted entries from older builds that lack pagination metadata are treated as
stale and reloaded automatically. This prevents users from being stuck on the
old 22-item skills.sh cache after upgrading.

Large preconfigured stores use a native browse flow rather than page-number
navigation. Stores with a known total show total/matched count plus loaded
progress such as `46 / 9603`. Stores without a known total, such as the current
ClawHub API, show loaded-count language (`Loaded 24`) and the sidebar uses a
plus suffix (`24+`) when more cursor pages are available. The scroll surface
automatically requests the next batch near the bottom. Page numbers remain
internal metadata, not the primary UI.

The Store catalog uses the original responsive card grid for small loaded
catalogs so card sizing stays consistent with the pre-virtualized UI. Once the
loaded catalog crosses the virtualization threshold, Imported and Available
section headers plus card rows are flattened into one virtual row model, so
users can keep browsing large stores without mounting every card in the DOM. The
virtualizer uses the Skill Store scroll surface as its scroll element and
accounts for any content rendered above the catalog through `scrollMargin`.
The threshold is intentionally above normal first-browse batches so skills.sh and
ClawHub do not switch card widths/styles after a few scroll loads.

Preconfigured external public stores do not use PromptHub's generic inferred
category chips unless that source actually follows the same taxonomy. skills.sh
uses source-specific browse filters backed by its public pages instead: `All`,
`Trending`, `Hot`, `Official`, `Audits`, and selected `/topic/<slug>` pages such
as React, Next.js, Design & UI, Mobile, Agent Workflows, Databases, Testing, and
Marketing. These filters load the matching skills.sh page index and then reuse
the same detail-fetch pipeline. ClawHub's list API does not provide a stable
category taxonomy, so it still hides category chips.

External stores that do not expose native category metadata must not receive a
guessed PromptHub category from broad keyword matching. skills.sh and ClawHub
entries use the neutral `general` value only to satisfy the current
`RegistrySkill` contract, and the Store detail UI hides that category for these
sources. This avoids misleading labels such as every API/web/code skill showing
as `Dev` when the source store did not classify the item.

skills.sh search is index-first for the selected skills.sh browse filter. The
remote-store cache key records both the source-specific filter and the search
query (`filter:query`), so switching from All to Official or a Topic cannot
reuse stale results from another skills.sh view.

When a skills.sh filter or search query changes, the UI must treat any cached
remote entry whose `query` does not match the current `filter:query` as stale
for rendering. The selected chip/search value changes immediately, old cards are
hidden immediately, and the loading state is shown while the matching source
page is fetched. This is a view-layer staleness check and must not write a fake
empty cache entry just to clear the screen.

skills.sh and ClawHub both expose a store-local search input in the Store
surface. The input keeps a local draft while the user types and commits to the
shared `storeSearchQuery` after a short debounce; Enter/form submit commits
immediately, and clear resets immediately. This makes the control feel realtime
without reloading the remote pipeline on every typed character. skills.sh uses
the committed value for index-first remote search inside the selected skills.sh
filter. ClawHub uses its public `/api/v1/search?q=...` endpoint for committed
queries and keeps `/api/v1/skills?sort=recommended` only for browse mode.

## Multi-File Package Materialization

Skill Store installation must treat public skills as directory packages when a
trusted package source exists. The install pipeline uses this precedence:

1. `package_url`: download the remote archive, extract it into a temporary
   directory, locate a contained `SKILL.md`, then copy that full directory into
   the managed local repo.
2. Git package location: when `source_url` is a supported Git repository and the
   entry provides `source_directory` / `canonical_skill_path` or a discoverable
   `SKILL.md`, clone the repo and copy the resolved skill directory.
3. Single-file fallback: only write `SKILL.md` when neither a package archive nor
   a resolvable Git package location is available.

This keeps script-backed skills from silently degrading to a markdown-only
install when the registry exposes a package artifact. ClawHub entries currently
provide `package_url` through `https://clawhub.ai/api/v1/download?slug=...`, so
ClawHub install/update flows must use the ZIP path before any single-file
fallback. skills.sh entries usually expose a GitHub repository; entries under
the standard `owner/skills/<skillName>` layout provide `source_directory` and
`canonical_skill_path`, while non-standard layouts deliberately let the main
process locate the package after cloning instead of guessing a renderer-side
path.

Archive extraction is a main-process responsibility. The renderer may carry
`package_url` metadata, but it must not parse or trust archive contents. The
main process must:

- fetch archive bytes through the existing remote-fetch boundary and byte cap;
- reject path traversal, absolute paths, ignored skill repo entries, and entries
  that resolve outside the temporary extraction directory;
- copy only a directory that contains `SKILL.md`;
- compute and persist `directory_fingerprint` after the managed repo is written;
- remove temporary extraction directories on success or failure.

Failure behavior must be atomic from the user's perspective. If a registry skill
row is created but package materialization fails for a package-backed source,
the created DB row must be rolled back instead of leaving an installed-looking
skill with only stale summary content. Update flows use the same package
materialization path and then `syncFromRepo()` so DB content, version snapshots,
and local files are derived from the actual managed repo.

The installed content hash remains based on resolved `SKILL.md` content, while
`directory_fingerprint` records the full package tree. This lets PromptHub keep
existing update checks for text changes and separately detect local package
drift across scripts/assets.

Safety scan remains pre-install and uses the exposed `SKILL.md` plus source
metadata. Full archive safety review is a separate hardening layer; until that
exists, package extraction must rely on strict path boundaries and the existing
managed repo ignore rules.

For non-`All` skills.sh filters, the visible total is the parsed result count
from that source page. PromptHub must not reuse any global `totalSkills` value
embedded elsewhere in a topic page, because that produces false counts such as a
Next.js topic showing thousands of skills while only a small topic page is being
browsed.

The skills.sh lightweight index and fetched detail pages are cached in memory
for the current app session. Continued browsing or searching the same index does
not re-fetch the homepage or already fetched details. A manual/automatic refresh
clears the skills.sh runtime cache and reloads from the network.

Store-card source badges use the selected store tone, not each skill's upstream
source inference. This keeps all skills.sh badges visually consistent even when
some skills originate from official GitHub repositories.

ClawHub uses the cursor-paginated public `/api/v1/skills` list with the
`recommended` browse sort. The `trending` sort is treated as a leaderboard-style
view and must not be used as the main browse source because it can return only
the first batch without a continuation cursor. The app keeps the cursor history
in the remote store entry and appends the next batch while browsing. ClawHub
currently does not expose a total count in the list response, so the UI does not
invent one.

ClawHub remote-store cache entries record the active browse sort in `query`.
Entries from older builds that lack this marker are treated as stale and are
reloaded automatically, so users are not stuck on a persisted 24-item ClawHub
cache after upgrading.

When the ClawHub search query is non-empty, the remote-store cache `query`
records the normalized search text. Query mismatches are stale and trigger a new
ClawHub search request. ClawHub search results are not filtered again by the
local keyword matcher because the public search endpoint owns result relevance.

Continued-scroll loading is not the same UI state as manual refresh or initial
load. `loadingSourceId` drives refresh/initial loading surfaces, while
continuation loading uses a separate source id so scrolling near the bottom only
shows the bottom `Loading more...` status and does not spin the refresh button or
show a header refresh badge.

## Verification

- Service test for ClawHub response mapping.
- Component test for built-in ClawHub source loading.
- Main-process remote-fetch test for ClawHub host trust.
- Component test proving skills.sh loads beyond the first 24 candidates even
  when a few detail fetches fail.
- Component test proving skills.sh loads one batch first, records total/batch
  metadata, and appends the next batch when the user scrolls near the bottom.
- Component test proving ClawHub cursor browsing appends the next batch without
  displaying a fake total page count.
- Component test proving stale pre-cursor ClawHub caches are reloaded instead of
  showing a false end-of-results state.
- Component test proving external public stores with unreliable category facets
  do not show the generic PromptHub category chip row.
- Component test proving skills.sh renders source-specific official filters and
  loads the selected official skills.sh browse page instead of using inferred
  local categories.
- Component test proving a skills.sh filter switch immediately hides stale cards
  and shows loading before the newly selected source page resolves.
- Component test proving skills.sh and ClawHub render store-local search inputs
  that debounce automatic commits while keeping Enter/form submit immediate.
- Service/component tests proving ClawHub committed search queries call
  `/api/v1/search?q=...` instead of filtering only the loaded browse cursor.
- Component test proving store detail category metadata is labelled and
  localized instead of showing a raw token such as `dev`.
- Service/component tests proving skills.sh and ClawHub do not infer fake `dev`
  categories and their detail modals hide category metadata when the source has
  no native taxonomy.
- Component test proving continued-scroll loading does not display the manual
  refresh badge while the next batch is still pending.
- Component test proving the Store catalog renders through the virtual catalog
  surface while preserving continued-scroll loading.
- Sidebar test for visible built-in source entry.

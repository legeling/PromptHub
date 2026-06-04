# Implementation

## Shipped

- Added ClawHub as built-in remote source id `clawhub`.
- Added a tolerant ClawHub parser that accepts array, `skills`, `items`, `data`, or `results` list wrappers.
- Added per-skill `SKILL.md` fetch through ClawHub's public file endpoint.
- Added sidebar and Store surface labels/counts for ClawHub.
- Added i18n keys for ClawHub labels, hints, and loading text across all desktop locales.
- Renamed the built-in `community` source's visible label and badges to
  `skills.sh` so users see the actual integrated store instead of a generic
  placeholder name.
- Added `clawhub.ai` and `www.clawhub.ai` to the main-process remote fetch
  trusted-host set so the preconfigured ClawHub store is not blocked when DNS
  maps through compatibility/reserved address ranges.
- Updated built-in public store loading so skills.sh is no longer capped by the
  first 24 text-matching anchors and no longer needs to fetch all available
  detail pages eagerly.
- Replaced the eager preconfigured-store loading approach with continued browse
  metadata. skills.sh now records `totalCount`, loads 24 details per batch, and
  appends the next batch when users scroll near the end. ClawHub keeps cursor
  history for continued browsing and does not display a fake total page count.
- Added skills.sh lightweight index parsing from both anchor links and embedded
  Next payload data. Searching skills.sh now filters this index first and fetches
  only the matching batch of detail pages instead of searching only
  already-loaded cards or eagerly downloading every detail.
- Replaced page-number primary navigation with a native scroll flow. The header
  shows loaded/total progress for stores with totals, and the bottom status
  communicates loading/end state.
- Added row virtualization for the Store catalog. Imported and Available
  sections share one virtual row model once the loaded catalog is large enough,
  keeping DOM rendering bounded while preserving section headers and responsive
  card rows. Small catalogs keep the original Tailwind responsive grid so cards
  do not visually change for 24-item stores.
- Changed no-total stores such as ClawHub to display loaded-count semantics
  instead of presenting the loaded batch as a total. The sidebar uses `24+` when
  a cursor indicates more results are available.
- Added app-session caching for the skills.sh lightweight index and fetched
  details. Continued browsing and index-based search reuse cached data until
  refresh.
- Fixed store-card source badge tone so all skills from the selected store use
  the same source badge color.
- Removed the unsupported `nonSuspiciousOnly=true` parameter from the ClawHub
  list request. The current public ClawHub API returns an empty `items` list
  when that parameter is present.
- Changed ClawHub browsing from `sort=trending` to the cursor-paginated
  `sort=recommended` flow. The service now also accepts pagination cursors from
  top-level, `pagination`, `pageInfo`, or `meta` fields.
- Marked ClawHub remote-store entries with the active browse sort and reload old
  entries that lack the marker, so persisted 24-item caches from earlier builds
  do not keep showing a false end-of-results state.
- Hid PromptHub's generic category chips for skills.sh and ClawHub because those
  external stores do not currently provide reliable category facets. Hidden
  category state is ignored for these stores, so a category selected elsewhere
  cannot silently filter their results.
- Added skills.sh source-specific filters backed by skills.sh's public browse
  pages: All, Trending, Hot, Official, Audits, and selected Topic pages.
  Switching a skills.sh filter now fetches that source page index rather than
  applying PromptHub's inferred category taxonomy.
- Changed skills.sh remote-store cache query markers to `filter:search`, so
  official/topic filters and search results do not reuse stale entries from a
  different skills.sh view.
- Changed non-All skills.sh filters to report the parsed page result count
  instead of any unrelated global `totalSkills` value embedded in the page.
- Removed the empty filter-toolbar band when the selected store has no visible
  filters, and aligned TopBar store-search result counting with the same hidden
  category rules.
- Raised the catalog virtualization threshold so normal continued browsing
  batches keep the original responsive card grid instead of switching to wider
  virtual rows after only a few scroll loads.
- Split continued-scroll loading from refresh loading. Scrolling near the bottom
  now uses a separate continuation loading state, keeps the refresh button/header
  badge idle, and only shows the bottom `Loading more...` status.
- Added a view-layer staleness gate for skills.sh `filter:search` state. When a
  user clicks a skills.sh filter, the selected chip updates immediately, cached
  cards from the previous filter are hidden immediately, and the loading state
  remains visible until the new filter entry is loaded.
- Added store-local search inputs for skills.sh and ClawHub. Both controls write
  to `storeSearchQuery`; skills.sh uses the value for index-first filtered
  loading, while ClawHub now uses the public `/api/v1/search?q=...` endpoint
  for committed queries.
- Changed store-local search inputs to keep a local draft and commit through a
  short debounce, while Enter/form submit still commits immediately and clear
  still resets immediately.
- Restyled the store-local search input as a full-width, low-noise control
  aligned with the store content area instead of a narrow capped input.
- Removed the store-local search input's focused inner ring and blue border
  shift so typing does not add an extra focus rectangle inside the control.
- Changed the store-local search field from native `search` input to plain text
  input so WebKit does not render a second built-in clear button beside the
  custom clear control.
- Changed ClawHub search cache semantics so browse entries use
  `query=recommended`, search entries use the normalized query text, and query
  mismatches trigger a fresh remote search instead of filtering stale browse
  results locally.
- Hid the TopBar search while the Skill Store catalog is active. Store search now
  has one visible owner: the full-width store-local search control inside the
  Store surface.
- Unified the built-in Skill Store source icons in the Sidebar so official,
  Claude Code, OpenAI Codex, skills.sh, and ClawHub all use the same store icon;
  custom sources still use the link icon.
- Changed the Skill Store detail footer to label and localize category metadata
  (`分类：开发工具`, `Category: Development`) instead of exposing raw tokens such
  as `dev`.
- Stopped assigning inferred categories to skills.sh and ClawHub entries. These
  stores currently do not expose a stable native category taxonomy, so parsed
  entries use neutral `general` internally and Store detail hides category
  metadata for those source labels/URLs.
- Documented that skills.sh and ClawHub currently materialize the exposed
  `SKILL.md` only. Full scripts/assets package installation remains a separate
  follow-up design item.

## Verification

- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/services/clawhub-store.test.ts`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-store-remote.test.tsx --testNamePattern "ClawHub|OpenAI Codex"`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/sidebar.test.tsx --testNamePattern "preconfigured community|nested store source"`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/sidebar.test.tsx`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/sidebar.test.tsx --testNamePattern "preconfigured community|nested store source"`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-store-remote.test.tsx --testNamePattern "shows the update action only after an update check finds a store update"`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/skill-installer-remote.test.ts`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-store-remote.test.tsx --testNamePattern "skills.sh preconfigured|ClawHub"`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/services/skills-sh-store.test.ts tests/unit/services/clawhub-store.test.ts`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-store-remote.test.tsx --testNamePattern "skills.sh lazily|ClawHub"`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/services/skills-sh-store.test.ts tests/unit/services/clawhub-store.test.ts tests/unit/services/skill-store-search.test.ts`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-store-remote.test.tsx`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/services/skills-sh-store.test.ts tests/unit/services/clawhub-store.test.ts tests/unit/services/skill-store-search.test.ts`
- `pnpm --filter @prompthub/desktop typecheck`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/services/skills-sh-store.test.ts tests/unit/services/clawhub-store.test.ts tests/unit/components/skill-store-remote.test.tsx --testNamePattern "fake category|external stores without native|labels the store detail category|maps detail page content|maps ClawHub"`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/services/skills-sh-store.test.ts tests/unit/services/clawhub-store.test.ts tests/unit/services/skill-store-search.test.ts`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-store-remote.test.tsx`
- `pnpm --filter @prompthub/desktop typecheck`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-store-remote.test.tsx --testNamePattern "debounces built-in"`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/sidebar.test.tsx --testNamePattern "preconfigured community"`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/services/clawhub-store.test.ts --testNamePattern "search endpoint"`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-store-remote.test.tsx --testNamePattern "ClawHub store search"`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/top-bar.test.tsx --testNamePattern "hides the top search"`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/top-bar.test.tsx`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-store-remote.test.tsx`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/services/clawhub-store.test.ts`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/services/skills-sh-store.test.ts tests/unit/services/clawhub-store.test.ts tests/unit/services/skill-store-search.test.ts`
- `pnpm --filter @prompthub/desktop typecheck`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-store-remote.test.tsx --testNamePattern "skills.sh lazily|searches the skills.sh|ClawHub"`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-store-card.test.tsx`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-store-remote.test.tsx --testNamePattern "skills.sh lazily|searches the skills.sh|stale skills.sh|ClawHub"`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-store-remote.test.tsx`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/sidebar.test.tsx --testNamePattern "preconfigured community|nested store source|ClawHub|skills.sh"`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-store-remote.test.tsx --testNamePattern "skills.sh|ClawHub"`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-store-remote.test.tsx --testNamePattern "auto-loads"`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/stores/skill.store.test.ts --testNamePattern "skills.sh"`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/services/skills-sh-store.test.ts tests/unit/services/clawhub-store.test.ts tests/unit/services/skill-store-search.test.ts`
- `pnpm --filter @prompthub/desktop typecheck`
- `node -e 'const fs=require("fs"); ["en","zh","zh-TW","ja","fr","de","es"].forEach((l)=>JSON.parse(fs.readFileSync(`apps/desktop/src/renderer/i18n/locales/${l}.json`,"utf8"))); console.log("ok")'`
- `git diff --check`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-store-remote.test.tsx`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/top-bar.test.tsx --testNamePattern "store search|hidden category"`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/sidebar.test.tsx --testNamePattern "preconfigured community|ClawHub|skills.sh"`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/services/clawhub-store.test.ts tests/unit/services/skills-sh-store.test.ts tests/unit/services/skill-store-search.test.ts`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/services/skills-sh-store.test.ts tests/unit/services/clawhub-store.test.ts tests/unit/services/skill-store-search.test.ts`

# Tasks

- [x] Add ClawHub store parser/service.
- [x] Add built-in ClawHub source to remote store sync.
- [x] Add ClawHub sidebar/store labels and counts.
- [x] Add TDD coverage for parser and built-in load path.
- [x] Allow ClawHub through the remote fetch trusted-host guard without
      broadening private-network access.
- [x] Increase preconfigured store preload coverage so skills.sh is not limited
      to roughly the first 22 successful detail pages.
- [x] Add browse metadata for preconfigured stores (`totalCount`, `nextCursor`,
      `pageSize`, `pageIndex`) and continued-scroll loading.
- [x] Make skills.sh search index-first so search can find unloaded indexed
      entries without fetching every detail page up front.
- [x] Invalidate stale pre-pagination skills.sh cache entries automatically.
- [x] Add visible loaded/total progress and bottom continuation status.
- [x] Cache skills.sh lightweight index and detail fetches during the app
      session; clear them on refresh.
- [x] Replace explicit load-more/page buttons with native scroll continuation
      for skills.sh and ClawHub.
- [x] Keep ClawHub as cursor-only pagination without inventing a total page
      count.
- [x] Replace page-number primary navigation with native scroll continuation
      for large stores.
- [x] Append continued browse batches while preserving already-loaded cards and
      cached detail results.
- [x] Virtualize large Store catalog rendering with one row model for section
      headers and card rows.
- [x] Preserve the original responsive card grid for small loaded catalogs.
- [x] Show loaded-count semantics for stores that do not expose a total count.
- [x] Make store-card source badge color follow the selected store, not each
      skill's upstream source.
- [x] Fix ClawHub list URL so the current public API returns skills instead of
      an empty `items` list.
- [x] Use ClawHub's cursor-paginated browse sort instead of the non-continuable
      trending leaderboard sort.
- [x] Treat old ClawHub first-page caches without the browse-sort marker as
      stale so users are not stuck at 24 skills.
- [x] Hide generic category chips for skills.sh and ClawHub until those stores
      expose reliable category facets.
- [x] Add skills.sh source-specific browse filters for Trending, Hot, Official,
      Audits, and selected official Topic pages instead of using PromptHub
      inferred categories.
- [x] Key skills.sh cache/search by `filter:query` so source-specific filters
      and search results cannot reuse stale entries from another view.
- [x] Use the current skills.sh filter page result count for non-All filters so
      Topic pages do not show unrelated global totals.
- [x] Remove the empty category-toolbar band when a selected source has no
      visible store filters.
- [x] Keep medium-sized public store catalogs on the original card grid and
      reserve virtualization for larger loaded inventories.
- [x] Split continued-scroll loading state from manual refresh state so scroll
      loading does not trigger the refresh animation.
- [x] Hide stale skills.sh cards immediately when the selected source-specific
      filter/search query changes.
- [x] Add store-local search controls for skills.sh and ClawHub.
- [x] Make store-local search update with a short debounce instead of requiring
      Enter or reloading immediately on every typed character.
- [x] Route ClawHub store search through `/api/v1/search?q=...` instead of
      filtering only the loaded browse cursor.
- [x] Make the store-local search field full-width and visually lighter.
- [x] Hide the TopBar search in the Skill Store catalog so the store-local
      search is the only visible store search control.
- [x] Label and localize store-detail category metadata instead of showing raw
      category tokens.
- [x] Stop assigning inferred `dev` categories to skills.sh and ClawHub entries
      when those stores do not provide native category metadata.
- [x] Hide category metadata in Store detail for external stores without a
      reliable taxonomy.
- [x] Use one consistent store icon for all built-in Skill Store sources.
- [ ] Design full multi-file package materialization for script-backed
      skills.sh/ClawHub skills.
- [x] Run targeted tests and typecheck.

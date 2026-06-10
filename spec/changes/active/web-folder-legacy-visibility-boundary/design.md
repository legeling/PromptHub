# Design

## Boundary

`FolderService` owns Web folder authorization and storage normalization. The
route schema may accept legacy `isPrivate`, but the service must persist a
single coherent visibility state.

## Approach

- Add a small resolver that maps `visibility` first, then falls back to
  `isPrivate === false ? "shared" : "private"` for creates.
- For updates, resolve the next visibility from `visibility`, then legacy
  `isPrivate`, then the current row.
- When visibility is provided directly or through `isPrivate`, persist both the
  `visibility` column and the derived `is_private` value.

## Compatibility

Explicit `visibility` wins over `isPrivate` to keep current clients stable.
Legacy `isPrivate: false` behaves like shared visibility and therefore remains
admin-only.

## Verification

Use Web folder route tests to prove legacy create and update requests cannot
leave `visibility` and `isPrivate` contradictory.

# Proposal

## Why

The self-hosted Web client API wrappers encoded media filenames before placing
them in route path segments, but prompt and skill IDs were interpolated raw.
If a caller passes an ID-like value containing `/`, `?`, or `#`, the wrapper
generates a structurally different URL before the backend can validate the ID.

## Scope

- Encode prompt IDs in Web client prompt route wrappers.
- Encode skill IDs in Web client skill route wrappers.
- Add client API regressions for path-significant characters.

## Risks

Low. Normal UUID-style IDs produce the same URL. The change only hardens wrapper
URL construction for path-significant characters.

## Rollback

Revert the wrapper helper and corresponding client API tests.

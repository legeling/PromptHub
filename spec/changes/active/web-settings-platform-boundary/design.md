# Design

## Boundary

- Owner: `apps/web`.
- Source of truth: per-user settings persisted through `SettingsService`.
- Contract: `PUT /api/settings` request body schema.
- Storage: no schema or file layout change.

## Approach

- Add bounded reusable string schemas for platform ids, absolute/custom paths, and relative asset paths.
- Limit platform records and arrays to a conservative maximum of 64 entries.
- Reuse existing custom-agent path limits where they already model the same string category:
  - absolute/custom paths: 1024 characters
  - relative asset/config paths: 512 characters
  - config relative path arrays: 16 entries
- Validate only non-empty trimmed strings and collection size. Do not normalize or resolve paths in the Web route.

## Verification

- Black-box route tests assert invalid platform settings return `422`.
- Regression tests assert rejected settings are not persisted.
- Existing supported preference persistence test asserts valid platform settings still round-trip.
- Typecheck, lint, and diff whitespace checks verify integration quality.

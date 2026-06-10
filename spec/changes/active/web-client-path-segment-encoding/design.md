# Design

## Boundary

Browser-facing API wrappers must build URLs with encoded path segments. Backend
routes remain responsible for authorization, validation, and not-found handling.

## Approach

- Add a small `encodePathSegment()` helper in each touched client API module.
- Use it for prompt IDs in prompt CRUD/version wrapper URLs.
- Use it for skill IDs in skill version and safety-report wrapper URLs.

## Impact

- Data model: none.
- API contract: no server route changes.
- UI: prevents malformed client-generated URLs for unusual ID-like values.
- Sync/filesystem: none.

## Verification

- Failure-first client API tests prove raw `/`, `?`, and `#` are encoded before
  request dispatch.
- Run focused client API tests plus Web typecheck and lint.

# Design

## Boundary

`SettingsService.set()` owns persistence merge behavior. Route validation keeps
type and size checks; service-level merge logic determines how accepted patches
combine with existing settings.

## Approach

- Add a focused helper for known nested patch objects.
- Deep-merge only `sync` and `device`, because their schemas intentionally allow
  partial updates and their defaults contain sibling fields.
- Keep all other settings keys using existing replacement semantics.

## Verification

Add a route regression that first stores complete `sync` and `device` settings,
then submits partial nested patches and verifies siblings remain intact.

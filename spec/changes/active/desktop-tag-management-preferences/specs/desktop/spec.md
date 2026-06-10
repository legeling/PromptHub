# Delta Spec

## Added

### Requirement: Prompt tag management is accessible from the prompt tag section

The desktop prompt sidebar must expose a direct management entry from the prompt tag section gear button.

### Requirement: Prompt tag click behavior is configurable

The desktop app must provide a persistent preference controlling whether prompt tag clicks behave as single-select replacement or multi-select toggles.

## Modified

### Requirement: Prompt tag management supports full CRUD-like authoring needs

Prompt tag management must support creating tags in addition to renaming and deleting existing tags.

### Requirement: Persisted prompt tag preferences are normalized during hydration

Renderer settings hydration must normalize current-version persisted prompt tag preferences before UI code consumes them. `tagFilterMode` must fall back to `multi` unless it is `single` or `multi`, and `promptTagCatalog` must be a deduplicated list of non-empty strings.

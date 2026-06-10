# Data Path Change Delta

## Requirements

- When a selected target directory already contains PromptHub data, the app must not copy current data into it by default.
- Users must be able to switch to an existing data directory without modifying that directory.
- Destructive overwrite must create a target backup before replacing target data.
- Legacy `data:migrate` must remain safe and refuse to overwrite existing target data.
- Data path migration must not dereference symlinks from the current data root into the target data root.
- Data path inspection must not classify symlinked marker directories or database files as real PromptHub data.
- Data path preview and apply must reject a target data root that is itself a symlink.

## Scenarios

- Empty target: migrate current data and require restart.
- Existing copied target: switch path only and require restart.
- Existing target with overwrite: back up target, then copy current data.
- Already-active target: report success without scheduling another restart.
- Source tree with symlinks: copy regular PromptHub data and skip symlink entries instead of importing external target content.
- Target containing only symlinked PromptHub marker names: report no existing PromptHub data so the UI does not recommend switching to an external link target.
- Target path is a symlink: reject preview/apply before switching or copying data.

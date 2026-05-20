# Delta Spec

## Added

- desktop settings persist hidden platforms so Agent Management can act as the single source of truth for platform visibility across Skills and Rules

## Modified

- desktop Rules UI only shows global platforms that are currently detectable on disk and not disabled in Settings
- Skills platform integration surfaces only show detected platforms that are not disabled in Settings
- global rule metadata refreshes its target path when the platform root directory changes
- changing a platform root path invalidates cached Rules descriptors and reloads them from disk

## Removed

- implicit assumption that every built-in global rule platform should remain visible once materialized

## Scenarios

- user disables Claude Code in Settings and it disappears from both the Rules sidebar and Skill platform integration surfaces
- user sets a custom OpenCode root path and the Rules sidebar/detail reflect the new `AGENTS.md` target path after refresh

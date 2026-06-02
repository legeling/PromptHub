# Implementation

## Shipped Changes

- Renamed desktop settings labels for app settings, model services, and data/sync.
- Merged desktop language and notifications into `GeneralSettings`.
- Restored a standalone web runtime language entry via `LanguageSettings`.
- Kept `Agent管理` unchanged.
- Added a `SettingsPage`-level optional second settings column for desktop `数据与同步` subsections.
- Changed `DataSettings` to receive the active subsection and render only the corresponding content panel.
- Widened the non-AI desktop settings content shell from the previous narrow 4xl layout to a responsive 5xl/6xl/7xl shell with larger wide-screen padding.
- Grouped secondary About content such as open source links, community links, contact, and developer settings into a responsive two-column grid on wide displays.

## Verification

- `pnpm --filter @prompthub/desktop lint`
- `pnpm --filter @prompthub/desktop build`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/settings-page.test.tsx tests/unit/components/about-settings.test.tsx`
- `pnpm --filter @prompthub/desktop typecheck`

## Follow-up

- Consider reusing the optional second settings column for other dense settings areas such as `模型服务`.

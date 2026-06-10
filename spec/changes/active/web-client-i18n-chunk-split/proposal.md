# Proposal

## Why

`apps/web` embeds the desktop renderer UI for the authenticated workspace, but
the web entry also owns setup/login/auth routing. Before this change the web
client statically loaded the desktop workspace and statically imported all
desktop locale JSON files during initial bootstrap.

The production build exposed two concrete issues:

- Vite warned that the same desktop locale JSON modules were both dynamically
  imported by the desktop renderer i18n module and statically imported by the
  web client i18n module, preventing clean chunk placement.
- The initial web entry chunk included the desktop workspace before the user
  reached an authenticated route, increasing setup/login bootstrap cost.

## Scope

- In scope:
  - Load web i18n locale bundles asynchronously and merge desktop + web
    translations per language.
  - Keep English loaded as the fallback resource for every initial language.
  - Wait for web i18n readiness before mounting the web React tree.
  - Lazy-load the authenticated desktop workspace route.
  - Verify build output and relevant route/i18n tests.
- Out of scope:
  - Reworking desktop renderer i18n internals.
  - Eliminating all web chunk-size warnings; desktop workspace and
    SkillFileEditor remain large authenticated-route chunks.

## Risks

- Delaying mount on i18n readiness could regress startup if locale loading
  fails.
- Lazy-loading the workspace route could show a loading fallback for
  authenticated users while the desktop bundle loads.
- Multiple i18n initializers in the embedded desktop/web runtime could race if
  web initialization does not complete before render.

## Rollback Thinking

- Revert `apps/web/src/client/i18n.ts`, `main.tsx`, and `App.tsx` to the
  previous static import behavior if async locale loading or route splitting
  causes runtime regressions.

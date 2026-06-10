# Tasks

- [x] Move reusable settings readers into an Electron-free main-process module.
- [x] Update `SkillInstaller` to use the new helper instead of importing from IPC code.
- [x] Exclude `githubToken` from renderer persisted state.
- [x] Scrub legacy same-version persisted `githubToken` fields during renderer hydration.
- [x] Load `githubToken` and startup settings from main process after settings hydration.
- [x] Update regression tests for settings readers, renderer store behavior, and `SkillInstaller` token loading.
- [x] Add a same-version hydration regression test for leaked renderer localStorage tokens.
- [x] Add a same-version hydration regression test for malformed shortcut mode settings.
- [x] Add a same-version hydration regression test for malformed appearance, motion, font size, and language settings.
- [x] Add a same-version hydration regression test for malformed prompt workflow settings and source history.
- [x] Add a main-process regression test for malformed shortcut mode IPC payloads.
- [x] Run lint and targeted tests.

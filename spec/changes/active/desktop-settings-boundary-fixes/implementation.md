# Implementation

## Shipped Changes

- Added `settings-readers.ts` as an Electron-free helper for reading startup settings and GitHub token from SQLite.
- Updated `settings.ipc.ts`, `main/index.ts`, and `skill-installer.ts` to use the shared helper.
- Removed `githubToken` from renderer persisted state using zustand `partialize`.
- Added same-version hydration cleanup so old zustand snapshots that already contain
  `githubToken` are cleared from both renderer state and localStorage.
- Added `loadSettingsFromMainProcess()` and called it during `App.tsx` startup after settings hydration.
- Updated tests to cover the new boundaries.

## Verification

- `pnpm --filter @prompthub/desktop lint`
- `pnpm --filter @prompthub/desktop cli:build`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/main/github-token-setting.test.ts tests/unit/main/settings-startup.test.ts tests/unit/stores/settings-github-token.test.ts tests/unit/stores/settings-startup.test.ts tests/unit/main/skill-installer.test.ts`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/stores/settings-github-token.test.ts -t "same-version persisted tokens"` first reproduced the hydration leak, then passed after the merge scrub.
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/stores/settings-github-token.test.ts`
- `pnpm --filter @prompthub/desktop typecheck`
- `pnpm --filter @prompthub/desktop lint`
- `git diff --check -- apps/desktop/src/renderer/stores/settings.store.ts apps/desktop/tests/unit/stores/settings-github-token.test.ts spec/changes/active/desktop-settings-boundary-fixes spec/issues/active/quality.md`

## 2026-06-10 same-version shortcut mode hydration

- 发现：`shortcutModes` 作为整个对象存入 renderer localStorage；current-version
  hydrate 会用 persisted object 覆盖默认对象。如果快照只包含部分 action，默认 key
  会丢失；如果包含非法 mode 或未知 action，`App.tsx` 的本地快捷键分支会把非法值当成
  “不是 local”，导致 `newPrompt` / `search` / `settings` 等本地快捷键静默失效。
- 处理：
  - 将默认 shortcut modes 提成 `DEFAULT_SHORTCUT_MODES` 单一常量。
  - 新增 `normalizeShortcutModes()`，只保留已知 action，非法 mode 回退到该 action 的默认值。
  - `persist.merge` 与 `migrate` 都复用该 normalizer，初始化也复用同一默认常量。
- 验证：
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/stores/settings-shortcuts.test.ts`
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/shortcuts-settings.test.tsx`
  - `pnpm --filter @prompthub/desktop typecheck`
  - `pnpm --filter @prompthub/desktop lint`
  - `git diff --check -- apps/desktop/src/renderer/stores/settings.store.ts apps/desktop/tests/unit/stores/settings-shortcuts.test.ts apps/desktop/tests/unit/components/shortcuts-settings.test.tsx spec/changes/active/desktop-settings-boundary-fixes spec/issues/active/quality.md`

## 2026-06-10 same-version appearance settings hydration

- 发现：`themeMode` 会决定 dark class / system theme listener 是否生效，`fontSize`
  会写入 `--base-font-size`，`motionPreference` 会写入 `<html data-motion>`，
  `language` 会触发 i18n 切换；current-version localStorage hydrate 不会触发
  `migrate`，坏快照中的非法值会让首屏主题、基础字号、减少动画偏好或语言状态失效。
- 处理：
  - 新增 `normalizeAppearanceSettings()`，覆盖 theme mode、font size、motion preference
    与 language。
  - `setThemeMode()` / `setFontSize()` / `setMotionPreference()` 和 zustand `merge` /
    `migrate` 复用同一规范化路径。
  - 非法 theme mode 回 `system`，非法 font size 回 `medium`，非法 motion preference
    回 `standard`，非法 language 走既有语言归一化并回 `en`。
- 验证：
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/stores/settings-appearance.test.ts`
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/stores/settings-language.test.ts`
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/appearance-settings.test.tsx`
  - `pnpm --filter @prompthub/desktop typecheck`
  - `pnpm --filter @prompthub/desktop lint`
  - `git diff --check -- apps/desktop/src/renderer/stores/settings.store.ts apps/desktop/tests/unit/stores/settings-appearance.test.ts apps/desktop/tests/unit/stores/settings-language.test.ts apps/desktop/tests/unit/components/appearance-settings.test.tsx spec/changes/active/desktop-settings-boundary-fixes spec/issues/active/quality.md`

## 2026-06-10 same-version prompt workflow hydration

- 发现：`creationMode` 决定顶部新建按钮打开手动创建还是 Quick Add，`translationMode`
  会进入 Skill 文档翻译 prompt，`closeAction` 会同步给 Electron 主进程，`sourceHistory`
  会在 Create/Edit Prompt 来源建议中直接调用 `toLowerCase()`。current-version
  localStorage hydrate 不会触发 `migrate`，非法模式或混杂 source history 会导致错误流程、
  错误提示词路径，或打开来源建议时渲染崩溃。
- 处理：
  - 新增 `normalizePromptWorkflowSettings()`，覆盖 creation mode、translation mode、
    image reverse 默认参考图、close action 和 source history。
  - `setCreationMode()` / `setTranslationMode()` / `setImageReverseAttachReferenceByDefault()` /
    `setCloseAction()` / `addSourceHistory()` 与 `merge` / `migrate` 复用对应规范化逻辑。
  - `sourceHistory` 现在只保留非空字符串，trim、去重，并限制最多 20 条。
- 验证：
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/stores/settings-prompt-workflow.test.ts`
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/prompt-modal-structure.test.tsx -t "source suggestion"`
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/top-bar.test.tsx`
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/ai-settings-legacy.test.tsx -t "translation"`
  - `pnpm --filter @prompthub/desktop typecheck`
  - `pnpm --filter @prompthub/desktop lint`
  - `git diff --check -- apps/desktop/src/renderer/stores/settings.store.ts apps/desktop/tests/unit/stores/settings-prompt-workflow.test.ts apps/desktop/tests/unit/components/prompt-modal-structure.test.tsx apps/desktop/tests/unit/components/top-bar.test.tsx apps/desktop/tests/unit/components/ai-settings-legacy.test.tsx spec/changes/active/desktop-settings-boundary-fixes spec/issues/active/quality.md`

## 2026-06-10 main-process shortcut mode normalization

- 发现：主进程快捷键模式还有独立的 `config/shortcut-mode.json`，并通过
  `shortcuts:setMode` IPC 写入；此前读取文件和 IPC handler 都直接展开 / 赋值整包对象。
  畸形 mode、未知 action 或缺失默认 action 会覆盖 `showApp` 的 global 默认值，使全局
  显示/隐藏应用快捷键被坏配置静默禁用。
- 处理：
  - 主进程 `shortcuts.ts` 新增 `DEFAULT_SHORTCUT_MODES` 与 `normalizeShortcutModes()`。
  - `loadShortcutModes()` 和 `shortcuts:setMode` IPC 都复用该 normalizer，只保留已知
    action，非法 mode 回退到默认值。
  - IPC 保存前也写入规范化后的 modes，避免坏配置继续留在主进程配置文件中。
- 验证：
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/main/shortcuts.test.ts`
  - `pnpm --filter @prompthub/desktop typecheck`
  - `pnpm --filter @prompthub/desktop lint`
  - `git diff --check -- apps/desktop/src/main/shortcuts.ts apps/desktop/tests/unit/main/shortcuts.test.ts spec/changes/active/desktop-settings-boundary-fixes spec/issues/active/quality.md`

## Follow-up

- Consider moving GitHub token storage to encrypted main-process storage in a future change.

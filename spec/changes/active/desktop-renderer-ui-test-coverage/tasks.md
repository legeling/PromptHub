# Tasks

## Wave 1 — UI primitives

- [x] `tests/unit/main/menu.test.ts` follow-up official Help menu external
      link regression for repository documentation and issue reporting actions
- [x] `tests/unit/main/external-links.test.ts` follow-up main-process external
      window-open protocol allowlist regression for renderer `target="_blank"`
      links
- [x] `tests/unit/main/shell-open-path.test.ts` follow-up main-process
      directory-open regression for missing paths, URL-like path input, and
      shell path token expansion boundaries
- [x] `tests/unit/main/image-ipc.test.ts` follow-up image / video OS-open
      failure propagation from Electron `shell.openPath`
- [x] `tests/unit/main/image-ipc.test.ts` follow-up image / video media
      clear partial-failure handling for non-file entries
- [x] `tests/unit/main/local-media-protocol.test.ts` follow-up local-image /
      local-video protocol path traversal and malformed encoding regressions
- [x] `tests/unit/utils/media-url.test.ts` follow-up desktop local-video URL
      encoding parity with local-image and web media routes
- [x] `tests/unit/utils/media-url.test.ts` and
      `tests/unit/stores/settings-background-image.test.ts` follow-up local
      media protocol URL idempotency and encoded background-image normalization
- [x] `tests/unit/utils/media-url.test.ts` follow-up web media API route
      idempotency for already resolved image and video sources
- [x] `tests/unit/main/updater-install.test.ts` follow-up macOS manual updater
      installer open failure propagation from Electron `shell.openPath`
- [x] `tests/unit/main/updater-install.test.ts` follow-up stale downloaded
      updater installer path reveal and Downloads fallback open failure
      regressions
- [x] `tests/unit/components/modal.test.tsx` follow-up icon-only close button
      accessible-name regression plus shared dialog role / aria-modal /
      title-description association regressions and open / close focus
      management regressions
- [x] `tests/unit/components/select.test.tsx` follow-up outside-click listener
      lifecycle and listbox / option accessibility regressions
- [x] `tests/unit/components/resizable-header.test.tsx` follow-up drag cleanup
      and body style restoration regression
- [x] `tests/unit/components/toast.test.tsx` follow-up localized system
      notification title and icon-only close button accessible-name regressions
- [x] `tests/unit/components/context-menu.test.tsx` follow-up Escape close
      regression and submenu expanded-state semantics
- [x] `tests/unit/components/platform-icon.test.tsx` follow-up platform PNG
      asset integrity regression and bad Amp / Roo HTML-as-PNG asset removal
- [x] `tests/unit/components/confirm-dialog.test.tsx` follow-up alertdialog
      role / aria-modal / title-description association and close focus
      restoration regressions
- [x] `tests/unit/components/close-dialog.test.tsx` follow-up app-close
      alertdialog role / aria-modal / title-description association and focus
      entry / restoration regressions
- [x] `tests/unit/components/unsaved-changes-dialog.test.tsx` follow-up
      unsaved-changes alertdialog role / aria-modal / title-description
      association and save-first focus restoration regressions
- [x] `tests/unit/components/checkbox.test.tsx` follow-up no-visible-label
      accessible-name regression
- [x] `tests/unit/components/input.test.tsx` follow-up visible label and
      error-description accessibility regressions
- [x] `tests/unit/components/textarea.test.tsx` follow-up visible label and
      error-description accessibility regressions
- [x] `tests/unit/components/image-preview-modal.test.tsx`
- [x] `tests/unit/components/data-recovery-dialog.test.tsx` follow-up
      recovery action non-submit semantics, decorative-icon accessibility, and
      recovery source selection state accessibility regressions
      regressions
- [x] `tests/unit/components/background-image-backdrop.test.tsx` current
      wallpaper layer rendering boundary verified
- [x] `tests/unit/components/collapsible-thinking.test.tsx` follow-up
      disclosure semantics and clean i18n-backed test rendering, plus explicit
      decorative loading spinner semantics
- [x] `tests/unit/components/spinner.test.tsx` follow-up explicit decorative
      override for labeled inline spinners
- [x] `tests/unit/components/password-input.test.tsx` follow-up shared
      password visibility toggle accessible-name regression

## Wave 2 — Domain views

- [x] `tests/unit/components/prompt-list-view.test.tsx` follow-up keyboard
      row selection and icon-only action accessible-name regressions
- [x] `tests/unit/components/prompt-kanban-view.test.tsx` follow-up
      icon-only card action accessible names and pinned-section disclosure
      semantics, plus card / pinned bulk action non-submit and
      decorative-icon regressions
- [x] `tests/unit/components/prompt-table-view.test.tsx` follow-up copied
      timer cleanup, row-selection accessibility, and pagination
      accessibility / page-clamp / stale-selection / cross-page
      select-all regressions
- [x] `tests/integration/components/main-content-inline-edit.integration.test.tsx`
      follow-up copied/shared timer cleanup regression, selected prompt detail
      action non-submit / decorative-icon semantics, and table pagination
      non-submit semantics
- [x] `tests/integration/components/main-content-selection-restore.integration.test.tsx`
      follow-up prompt card primary selection keyboard accessibility and
      decorative-icon semantics
- [x] `tests/unit/utils/download-generated-image.test.ts` follow-up
      generated image object URL cleanup regression
- [x] `tests/unit/components/prompt-list-header.test.tsx`
- [x] `tests/unit/components/column-config-menu.test.tsx`
- [x] `tests/unit/components/folder-modal.test.tsx` follow-up folder modal
      header close accessible-name, non-submit, icon-picker accessible names /
      pressed state, parent-folder disclosure expanded-state semantics, and
      decorative-icon semantics
- [x] `tests/unit/components/private-folder-unlock-modal.test.tsx`
      follow-up private folder unlock close accessible-name, non-submit, and
      decorative-icon semantics
- [x] `tests/unit/components/tag-manager-modal.test.tsx` follow-up
      prompt tag click-mode select field-label accessible-name and option-role
      regression
- [x] `tests/unit/components/create-prompt-modal.test.tsx` follow-up core
      field label association and prompt-type pressed-state accessibility
      regressions, plus prompt creation action non-submit and decorative-icon
      semantics
- [x] `tests/unit/components/edit-prompt-modal.test.tsx` follow-up core
      field label association and prompt-type pressed-state accessibility
      regressions, plus prompt edit action non-submit and decorative-icon
      semantics
- [x] `tests/unit/components/prompt-modal-structure.test.tsx` follow-up
      source suggestion blur timer cleanup, discarded create-modal draft reset,
      stale edit-modal AI rewrite / translation result regressions, and
      edit-modal bilingual translation action accessible names
- [x] `tests/unit/components/import-prompt-modal.test.tsx` follow-up stale
      import completion regression, plus import action non-submit and
      decorative-icon semantics
- [x] `tests/unit/components/quick-add-modal.test.tsx` follow-up delayed
      focus timer cleanup and stale generated draft regressions, plus quick-add
      action non-submit and decorative-icon semantics
- [x] `tests/unit/components/prompt-detail-modal.test.tsx` follow-up
      copy/share feedback timer cleanup regression
- [x] `tests/unit/components/prompt-version-history-modal.test.tsx`
      follow-up version timeline / action non-submit semantics, view /
      version selection state, decorative-icon accessibility, and version
      variable normalization regressions
- [x] `tests/unit/components/prompt-quick-rewrite-dialog.test.tsx`
      follow-up closed-dialog AI rewrite result regressions
- [x] `tests/unit/components/prompt-editor.test.tsx` follow-up prompt editor
      field labels / async image handling plus rendered action decorative-icon
      semantics
- [x] `tests/unit/components/variable-input-modal.test.tsx` follow-up copied
      timer cleanup regression, plus AI-test output format non-submit /
      pressed-state and decorative-icon semantics, including hidden image
      upload file input accessible-name regression
- [x] `tests/unit/components/ai-test-workbench.test.tsx` follow-up copy
      response timer cleanup and stale single-model / compare / image AI
      result regressions, plus AI test workbench action non-submit and
      decorative-icon semantics, including reference image selection and hidden
      image upload file input accessible names
- [x] `tests/unit/components/ai-workbench-base-fields.test.tsx` follow-up
      provider / protocol select field-label accessible-name regressions, plus
      fetch-model action non-submit and decorative-icon semantics
- [x] `tests/unit/components/available-models-list.test.tsx` follow-up
      fetched model category disclosure state, list action non-submit
      semantics, model search input accessible-name, distinguishable category /
      model action names and pressed state, and decorative-icon accessibility
      regressions
- [x] `tests/unit/components/ai-workbench-image-params-section.test.tsx`
      follow-up image parameter select field-label accessible-name regressions
- [x] `tests/unit/components/ai-workbench-advanced-section.test.tsx`
      follow-up translation-mode and scenario-route select field-label
      accessible-name regressions, plus configure action non-submit and
      decorative-icon semantics
- [x] `tests/unit/components/ai-workbench-endpoint-form-modal.test.tsx`
      follow-up endpoint provider-type and protocol select field-label
      accessible-name regressions
- [x] `tests/unit/components/ai-workbench-model-form-modal.test.tsx`
      follow-up AI workbench model form advanced disclosure / test draft /
      cancel / save action non-submit and decorative-icon semantics
- [x] `tests/unit/components/ai-workbench-header-section.test.tsx`
      follow-up AI workbench header test-default / add-model / import legacy
      action non-submit and decorative-icon semantics
- [x] `tests/unit/components/ai-workbench-endpoints-section.test.tsx`
      follow-up endpoint section action non-submit and decorative-icon
      accessibility regressions
- [x] `tests/unit/components/ai-settings-legacy.test.tsx` follow-up
      legacy chat / image provider select, text input, and advanced parameter
      slider field-label accessible-name regressions, plus configured model /
      picker / translation action non-submit and decorative-icon semantics,
      including fetch-model, advanced disclosure expanded-state, and
      custom-parameter delete residual icons
- [x] `tests/unit/components/ai-settings-prototype.test.tsx` follow-up
      image quality select test updated to field-label trigger and option-role
      semantics, plus default-test action non-submit and decorative-icon
      semantics
- [x] `tests/unit/components/platform-workbench-prototype.test.tsx`
      follow-up future workspace prototype navigation / resource selection
      pressed-state, non-submit, search filtering, and decorative-icon semantics
- [x] `tests/unit/components/image-prompt-reverse-modal.test.tsx` follow-up
      pasted preview object URL cleanup and closed-modal image input async
      result / AI reverse result regressions, plus reverse modal action
      non-submit and decorative-icon semantics
- [x] `tests/unit/hooks/use-prompt-media-manager.test.ts` follow-up URL
      download timeout cleanup plus URL/select/drop/paste closed-modal async
      result regressions
- [x] `tests/unit/utils/persist-hydration.test.ts` follow-up synchronous
      persist hydration callback regression
- [x] `tests/unit/components/skill-store-card.test.tsx` follow-up
      native non-submit card primary action, quick-install propagation,
      no hidden outer-wrapper click target, primary card icon / badge
      decorative semantics, and batch selection decorative icon regressions
- [x] `tests/unit/components/skill-gallery-card.test.tsx` follow-up
      keyboard-activatable gallery card primary action, explicit icon-action
      accessible names, non-submit semantics, pressed state, and
      decorative-icon regressions
- [x] `tests/unit/components/skill-list-view-actions.test.tsx` follow-up
      native keyboard-activatable list-row primary action, explicit row action
      accessible names, selection pressed state, non-submit semantics, and
      decorative-icon regressions
- [x] `tests/unit/components/skill-store-custom-sources.test.tsx` follow-up
      custom source row / form / edit-modal accessibility and stale branch
      loading / duplicate refresh / invalid add-save / invalid edit-save /
      header action / category filter / batch action semantics regressions
- [x] `tests/unit/components/skill-store-remote.test.tsx` follow-up store
      search field decorative icon accessibility and remote retry
      non-submit regression
- [x] `tests/unit/components/skill-batch-tag-dialog.test.tsx` follow-up
      tag input label association and batch tag mode pressed-state
      accessibility regressions
- [x] `tests/unit/components/skill-batch-deploy-dialog.test.tsx`
      follow-up batch deploy state accessibility and duplicate deploy click
      regressions, plus platform target icon decorative semantics
- [x] `tests/unit/components/skill-store-detail-timers.test.tsx` follow-up
      install/uninstall timer cleanup, duplicate install / remove / update
      / translation / safety scan action click regressions, and detail header
      / translation / refresh-translation / safety action / footer action
      semantics, including title-backed refresh action accessible names
- [x] `tests/unit/components/skill-detail-view-timers.test.tsx` follow-up
      copy/export timer cleanup, detail action non-submit / decorative-icon
      semantics, close accessible-name, and platform selection / uninstall
      action separation / platform icon decorative regressions
- [x] `tests/unit/components/skill-i18n-smoke.test.tsx` follow-up
      full skill detail copy/export timer cleanup and SkillManager toolbar /
      batch action / pagination non-submit and decorative-icon regressions,
      including title-backed batch toolbar action accessible names and copied
      distribution delete checkbox accessible names
- [x] `tests/unit/components/skill-full-detail-async-actions.test.tsx`
      follow-up full skill detail duplicate AI translation / safety scan /
      source update / notes save / snapshot / delete confirmation click
      / platform install / platform uninstall / project deploy / project
      removal regressions, plus full detail header / tab action non-submit
      and decorative-icon semantics, including personal notes, snapshot modal,
      safety rescan residual button icons, title-backed source update /
      snapshot action accessible names, and copied distribution delete checkbox
      accessible names
- [x] `tests/unit/components/skill-quick-install.test.tsx` follow-up delayed
      auto-close timer cleanup, duplicate install click, and platform target
      icon decorative semantics regressions
- [x] `tests/unit/components/skill-icon-picker.test.tsx` follow-up preset icon
      option pressed-state and button-contained media decorative semantics
      regressions
- [x] `tests/unit/components/skill-platform-panel.test.tsx` follow-up
      global install mode pressed-state and platform target keyboard-toggle
      / project removal action separation accessibility regressions, plus
      advanced project import disclosure expanded-state semantics
- [x] `tests/unit/components/skill-file-editor.test.tsx` follow-up file tree
      file selection / delete action separation, toolbar non-submit, and
      modal close accessibility regressions, plus directory disclosure and
      image preview zoom decorative-icon semantics
- [x] `tests/unit/components/skill-render-boundary.test.tsx` follow-up
      recovery action non-submit semantics and decorative error/retry icon
      accessibility regressions
- [x] `tests/unit/components/create-skill-scan-source-chooser.test.tsx`
      follow-up local import source action non-submit semantics and decorative
      source / loading icon accessibility regressions
- [x] `tests/unit/components/create-skill-modal.test.tsx` follow-up
      create-skill chooser / manual / scan / GitHub action non-submit
      semantics and decorative-icon accessibility regressions, including
      GitHub and local scan result cards, manual AI polish action accessible
      name, and hidden `.md` upload file input accessible-name regression
- [x] `tests/unit/components/skill-version-history-modal.test.tsx`
      follow-up version timeline / view / file disclosure state semantics and
      decorative history icon accessibility regressions
- [x] `tests/unit/components/project-skill-preview-sidebar-i18n.test.tsx`
      follow-up project deploy target list synchronization regression after
      adding new target folders
- [x] `tests/unit/components/skill-library-import-modal.test.tsx`
      follow-up project import preference overwrite regression and import
      settings state accessibility / duplicate confirm / duplicate target
      picker / closed-modal picker result regressions
- [x] `tests/unit/components/rules-manager.test.tsx` follow-up rules
      workbench action non-submit and decorative-icon semantics across draft,
      history, and snapshot-preview controls, including history disclosure
      expanded-state semantics
- [x] `tests/unit/components/rules-sidebar-panel.test.tsx` follow-up rules
      sidebar platform, project, rescan, create-folder, select, and remove
      action non-submit semantics, section disclosure expanded-state semantics,
      and decorative-icon accessibility regressions
- [x] `tests/unit/components/skill-agents-view.test.tsx` follow-up agent
      action non-submit and decorative-icon semantics, including platform icon
      accessible-name isolation
- [x] `tests/unit/components/skill-projects-view.test.tsx` follow-up
      project form duplicate save and stale save completion regressions during
      create-and-scan, plus project action non-submit, icon-only add-project
      accessible-name, and decorative-icon semantics
- [x] `tests/unit/components/general-settings.test.tsx` follow-up
      shared toggle switch semantics and accessible-name regressions
- [x] `tests/unit/components/appearance-settings.test.tsx` follow-up
      appearance option non-submit semantics, selection state, readable font
      button names, decorative-icon accessibility regressions, and wallpaper
      adjustment slider accessible-name regressions
- [x] `tests/unit/components/about-settings.test.tsx` follow-up about-page
      update / community action non-submit semantics and decorative-icon
      accessibility regressions
- [x] `tests/unit/components/settings-modal.test.tsx` follow-up legacy
      settings modal non-submit action semantics, selection state, switch
      semantics, and decorative-icon accessibility regressions
- [x] `tests/unit/components/settings-page.test.tsx` follow-up settings
      navigation non-submit semantics, active-state accessibility, and
      decorative-icon regressions
- [x] `tests/unit/components/web-workspace-settings.test.tsx` follow-up
      self-hosted workspace navigation card non-submit and decorative-icon
      semantics
- [x] `tests/unit/components/skill-settings.test.tsx` follow-up
      install-method / platform-order / agent configuration / safety setting
      action non-submit semantics and decorative-icon accessibility regressions
- [x] `tests/unit/components/data-settings.test.tsx` follow-up native
      recovery / sync / backup input and sync cadence select field-label
      accessible-name regressions, plus rendered data action non-submit and
      decorative-icon semantics, including manual recovery path removal and
      title-backed import action accessible names, plus selective-export scope
      keyboard accessibility and upgrade backup disclosure expanded-state
      semantics
- [x] `tests/unit/components/language-settings.test.tsx` follow-up language
      select accessible-name and option semantics regressions
- [x] `tests/unit/components/security-settings.test.tsx` follow-up master
      password action non-submit semantics, change-password disclosure state,
      decorative status icon accessibility, and password input labels
- [x] `tests/unit/components/web-device-settings.test.tsx` follow-up device
      sync cadence select accessible-name and persistence regressions, plus
      rendered device action non-submit and decorative-icon semantics
- [x] `tests/unit/components/shortcuts-settings.test.tsx` follow-up
      shortcut loading failure handling, late-load unmount guard, and conflict
      / failed persistence / shortcut-control accessible-name regressions, plus
      shortcut clear action non-submit and decorative-icon semantics
- [x] `tests/unit/components/top-bar.test.tsx` follow-up create-menu
      outside-click listener lifecycle regression, top-bar action non-submit
      semantics, rules search keyboard / button navigation, and
      search input / search-navigation / update action accessible-name and
      decorative-icon accessibility regressions
- [x] `tests/unit/components/title-bar.test.tsx` follow-up Windows window
      control non-submit semantics, decorative-icon accessibility, and
      localized restore label regression
- [x] `tests/unit/components/update-dialog.test.tsx` follow-up update action
      non-submit semantics and decorative-icon accessibility regressions
- [x] `tests/unit/components/cli-settings.test.tsx` follow-up standalone CLI
      settings install / npm fallback / refresh action non-submit and
      decorative-icon semantics
- [x] `tests/unit/components/sidebar.test.tsx` follow-up Sidebar navigation /
      prompt type / folder / tag / skill store source action non-submit
      semantics, title-backed action accessible names, and decorative-icon
      accessibility regressions
- [x] `tests/unit/components/sortable-tree-timers.test.tsx` follow-up
      delayed drag reset timer cleanup regression
- [x] `tests/unit/components/sortable-tree-item.test.tsx` follow-up
      tree folder selection keyboard accessibility, expand / edit action
      non-submit, accessible-name, pressed-state, and decorative-icon semantics
- [x] `tests/unit/components/local-image.test.tsx` follow-up clickable
      local image semantics, fallback keyboard accessibility, localized prompt
      preview action names, and non-semantic click scan reduction
- [x] `tests/unit/components/rules-manager.test.tsx` follow-up sync conflict
      overlay dismiss semantics, explicit localized accessible name, and
      non-semantic click scan reduction
- [x] `tests/unit/components/prompt-table-view.test.tsx` follow-up table row
      action event isolation without a non-semantic wrapper click handler
- [x] `tests/unit/components/image-preview-modal.test.tsx` follow-up image
      click/backdrop close behavior while removing redundant content
      stop-propagation wrapper
- [x] `tests/unit/components/modal.test.tsx`,
      `tests/unit/components/confirm-dialog.test.tsx`,
      `tests/unit/components/unsaved-changes-dialog.test.tsx`,
      `tests/unit/components/close-dialog.test.tsx`, and
      `tests/unit/components/image-preview-modal.test.tsx` follow-up shared
      backdrop presentation semantics without adding keyboard tab stops
- [x] `tests/unit/components/folder-modal.test.tsx` and
      `tests/unit/components/private-folder-unlock-modal.test.tsx` follow-up
      folder modal backdrop presentation semantics across primary and nested
      folder dialogs
- [x] `tests/unit/components/quick-add-modal.test.tsx`,
      `tests/unit/components/image-prompt-reverse-modal.test.tsx`,
      `tests/unit/components/create-skill-modal.test.tsx`,
      `tests/unit/components/edit-skill-modal.test.tsx`, and
      `tests/unit/components/skill-file-editor.test.tsx` follow-up final
      prompt / skill modal backdrop presentation semantics and renderer
      non-semantic click scan close-out
- [x] `tests/unit/components/rules-manager.test.tsx` and
      `tests/unit/components/skill-list-view-actions.test.tsx` follow-up
      decorative icon semantics for remaining button-contained icons
- [x] `tests/unit/components/skill-file-editor.test.tsx` follow-up new-file /
      new-folder / rename dialog textbox accessible-name regressions
- [x] `tests/unit/components/rules-manager.test.tsx` follow-up AI rewrite
      instruction and rule-content editor textbox accessible-name regressions
- [x] `tests/unit/components/tag-manager-modal.test.tsx` follow-up tag search /
      create / rename textbox accessible-name regressions
- [x] `tests/unit/components/edit-prompt-modal.test.tsx` follow-up inline AI
      rewrite textbox accessible-name regression
- [x] `tests/unit/components/skill-projects-view.test.tsx` follow-up project
      root path and scan path textbox accessible-name regressions
- [x] `tests/unit/components/skill-full-detail-async-actions.test.tsx`
      follow-up personal notes and snapshot note textbox accessible-name
      regressions
- [x] `tests/unit/components/platform-workbench-prototype.test.tsx`
      follow-up prototype resource search textbox accessible-name regression
- [x] `tests/unit/components/skill-icon-picker.test.tsx` follow-up icon upload
      file input accessible-name regression
- [x] Desktop Vitest timeout stabilization for heavy jsdom renderer suites
- [x] `tests/unit/main/data-layout-migration.test.ts` follow-up legacy layout
      migration symlink rejection for root entries and nested directory entries
- [x] `tests/unit/main/upgrade-backup.test.ts` and
      `tests/unit/main/upgrade-backup-restore.test.ts` follow-up pre-upgrade
      backup / legacy backup migration / restore symlink rejection and
      partial-snapshot cleanup
- [x] `tests/unit/main/data-recovery.test.ts` follow-up database recovery
      asset-directory merge symlink skipping
- [x] `tests/unit/main/data-recovery.test.ts` follow-up recovery candidate
      detection symlink skipping for workspace prompts and renderer storage
- [x] `tests/unit/main/data-recovery.test.ts` follow-up recovery database-file
      symlink rejection for directory candidates, standalone backup files, and
      restore sources
- [x] `tests/unit/components/mcp-batch-deploy-dialog.test.tsx` and
      `tests/unit/stores/mcp.store.test.ts` follow-up MCP delete-state,
      disabled-target, selection, non-submit, decorative-media, and duplicate
      batch deploy click regressions
- [x] `tests/unit/components/plugin-agent-target-picker.test.tsx` and
      `tests/unit/stores/plugin.store.test.ts` follow-up Plugin delete-cache,
      Agent target distribution, copy/symlink mode, non-submit,
      decorative-media, clear-selection, and duplicate distribution click
      regressions

## Verification

- [x] `pnpm --filter @prompthub/desktop test -- --run` passes (0 failures)
- [x] `pnpm --filter @prompthub/desktop lint` passes
- [x] File-level component test count ≥ 65 (current 102, target ≥65)
- [x] Renderer title-backed button scan reports 0 buttons with `title` and no
      explicit `aria-label` / `aria-labelledby`
- [x] Renderer non-semantic clickable scan reports 0 `div` / `span` / `li` /
      `tr` / `section` / `article` elements with `onClick` and no explicit
      `role`
- [x] Renderer button-contained icon scan reports 0 icon components / `svg`
      elements inside buttons without explicit accessibility treatment
- [x] Renderer native input / textarea accessible-name hint scan reduced the
      current candidate set from 94 to 89 after targeted textbox fixes
- [x] Renderer native input / textarea accessible-name hint scan reduced the
      current candidate set from 9 to 7 after binding the appearance wallpaper
      adjustment slider labels
- [x] Renderer native input / textarea accessible-name hint scan reduced the
      current candidate set from 7 to 5 after binding skill copied-distribution
      delete checkbox names and descriptions
- [x] Renderer native input / textarea accessible-name hint scan reduced the
      current candidate set from 5 to 0 after giving hidden image, `.md`, and
      icon upload file inputs explicit accessible names
- [x] Renderer dialog role scan reports 0 `dialog` / `alertdialog` elements
      without `aria-modal`
- [x] Renderer custom Input / Textarea accessible-name hint scan reduced the
      current 40-line candidate set from 8 to 7 after the edit prompt AI
      rewrite textbox fix; tag manager fixes were verified by role/name tests
      because those inputs already had placeholder fallbacks and did not appear
      in the 40-line scan
- [x] Renderer custom Input / Textarea accessible-name hint scan reduced the
      current 40-line candidate set from 7 to 3 after project path, scan path,
      personal notes, and snapshot note textbox fixes
- [x] Renderer custom Input / Textarea accessible-name hint scan reduced the
      current 40-line candidate set from 3 to 2 after the platform workbench
      search fix, and a structured follow-up scan reports 0 actual custom
      Input / Textarea calls without a label / id / aria name / placeholder
- [x] AI test response Markdown links use the same safe protocol filtering as
      prompt Markdown and downgrade unsafe protocols to text
- [x] AI test generated-image downloads reuse the shared generated-image
      download helper so remote blobs, temporary anchors, and object URLs are
      cleaned up on click failure
- [x] Appearance settings background-image selection reports save failures
      instead of silently clearing the loading state
- [x] About settings web update checks report network / malformed release
      lookup / unknown current-version failures instead of silently returning
      to idle or latest
- [x] Skill code pane local source card uses a keyboard-accessible button
      instead of an anchor without `href`
- [x] Skill code pane local source open failures report a user-visible toast
      instead of failing silently
- [x] Update dialog release-note Markdown links use the same safe protocol
      filtering as prompt Markdown and downgrade unsafe protocols to text
- [x] `pnpm verify:release:quick` release-harness closeout performed; the only
      rerun failure was the network-bound web Docker runtime deps integration
      test, and that test passed when rerun with registry/network access
- [ ] No `as any`, no `@ts-ignore`, no `toMatchSnapshot()` for dynamic data
      across the active test surface; final scan still finds legacy matches in
      older main-process, service, store, and integration tests, while the
      release-harness `AISettingsPrototype` fix did not add new matches
- [x] Update `implementation.md` with the actual coverage delta and any tests
      we had to drop or rewrite during execution

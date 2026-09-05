import { changeLanguage } from "../../i18n";
import { isPrereleaseVersion } from "../../../utils/version";
import type {
  SettingsActionContext,
  SettingsActionGroup,
} from "./settings-action-context";
import {
  applyBackgroundImageVars,
  clampBackgroundImageBlur,
  clampBackgroundImageOpacity,
  FONT_SIZES,
  hexToHs,
  MORANDI_THEMES,
  normalizeBackgroundImageFileName,
  normalizeFontSize,
  normalizeMotionPreference,
  normalizeThemeMode,
} from "./settings-appearance";
import {
  normalizeCloseAction,
  normalizeCreationMode,
  normalizeDesktopHomeModules,
  normalizeLanguage,
  normalizeSkillListPageSize,
  normalizeSkillTagFilterIncludeFrontmatter,
  normalizeSourceHistory,
  normalizeTagsSectionHeight,
  normalizeTranslationMode,
} from "./settings-normalizers";

type GeneralActionKey =
  | "setCreationMode"
  | "setTranslationMode"
  | "setImageReverseAttachReferenceByDefault"
  | "addSourceHistory"
  | "setThemeMode"
  | "setDarkMode"
  | "setThemeColor"
  | "setCustomThemeHex"
  | "setRenderMarkdown"
  | "setMotionPreference"
  | "setEditorMarkdownPreview"
  | "setFontSize"
  | "applyBackgroundImageSelection"
  | "setBackgroundImageEnabled"
  | "setBackgroundImageFileName"
  | "setBackgroundImageOpacity"
  | "setBackgroundImageBlur"
  | "setClipboardImportEnabled"
  | "setAutoSave"
  | "setShowLineNumbers"
  | "setLaunchAtStartup"
  | "setMinimizeOnLaunch"
  | "setCloseAction"
  | "persistCloseAction"
  | "setDebugMode"
  | "setShortcutMode"
  | "setEnableNotifications"
  | "setShowCopyNotification"
  | "setShowSaveNotification"
  | "setLocalSessionIndexEnabled"
  | "setTagFilterMode"
  | "addPromptTagCatalogEntry"
  | "renamePromptTagCatalogEntry"
  | "deletePromptTagCatalogEntry"
  | "setLanguage"
  | "setDataPath"
  | "setAutoCheckUpdate"
  | "setUseUpdateMirror"
  | "setUpdateChannel"
  | "inferUpdateChannel"
  | "setTagsSectionHeight"
  | "setIsTagsSectionCollapsed"
  | "setResourceTagsSectionHeight"
  | "setIsResourceTagsSectionCollapsed"
  | "setSkillTagsSectionHeight"
  | "setIsSkillTagsSectionCollapsed"
  | "setSkillListPageSize"
  | "setSkillTagFilterIncludeFrontmatter"
  | "toggleDesktopHomeModule"
  | "reorderDesktopHomeModules"
  | "applyTheme";

function setDocumentThemeColor(hue: number, saturation: number): void {
  document.documentElement.style.setProperty("--theme-hue", String(hue));
  document.documentElement.style.setProperty(
    "--theme-saturation",
    String(saturation),
  );
}

function setDocumentFontSize(fontSize: string): void {
  const font = FONT_SIZES.find((candidate) => candidate.id === fontSize);
  if (font) {
    document.documentElement.style.setProperty(
      "--base-font-size",
      `${font.value}px`,
    );
  }
}

function resolveIsDark(themeMode: "system" | "light" | "dark"): boolean {
  return themeMode === "system"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : themeMode === "dark";
}

function createWorkflowActions(context: SettingsActionContext) {
  const { get, setTouched } = context;
  return {
    setCreationMode: (mode) =>
      setTouched({ creationMode: normalizeCreationMode(mode) }),
    setTranslationMode: (mode) =>
      setTouched({ translationMode: normalizeTranslationMode(mode) }),
    setImageReverseAttachReferenceByDefault: (enabled) =>
      setTouched({
        imageReverseAttachReferenceByDefault:
          typeof enabled === "boolean" ? enabled : true,
      }),
    addSourceHistory: (source) => {
      const normalized = source.trim();
      if (!normalized) return;
      const history = normalizeSourceHistory(get().sourceHistory);
      const filtered = history.filter((item) => item !== normalized);
      setTouched({ sourceHistory: [normalized, ...filtered].slice(0, 20) });
    },
  } satisfies SettingsActionGroup<
    | "setCreationMode"
    | "setTranslationMode"
    | "setImageReverseAttachReferenceByDefault"
    | "addSourceHistory"
  >;
}

function createThemeModeActions(context: SettingsActionContext) {
  const { get, setTouched } = context;
  return {
    setThemeMode: (mode) => {
      const themeMode = normalizeThemeMode(mode);
      const isDarkMode = resolveIsDark(themeMode);
      setTouched({ themeMode, isDarkMode });
      document.documentElement.classList.toggle("dark", isDarkMode);
    },
    setDarkMode: (isDarkMode) => {
      setTouched({
        isDarkMode,
        themeMode: isDarkMode ? "dark" : "light",
      });
      document.documentElement.classList.toggle("dark", isDarkMode);
    },
    setThemeColor: (colorId) => {
      const theme =
        colorId === "custom"
          ? { id: "custom", ...hexToHs(get().customThemeHex) }
          : MORANDI_THEMES.find((candidate) => candidate.id === colorId);
      if (!theme) return;
      setTouched({
        themeColor: theme.id,
        themeHue: theme.hue,
        themeSaturation: theme.saturation,
      });
      setDocumentThemeColor(theme.hue, theme.saturation);
    },
  } satisfies SettingsActionGroup<
    "setThemeMode" | "setDarkMode" | "setThemeColor"
  >;
}

function createCustomThemeActions(context: SettingsActionContext) {
  const { get, setTouched } = context;
  return {
    setCustomThemeHex: (hex) => {
      const color = hexToHs(hex);
      setTouched({
        customThemeHex: `#${hex.replace(/^#/, "")}`,
        themeColor: "custom",
        themeHue: color.hue,
        themeSaturation: color.saturation,
      });
      setDocumentThemeColor(color.hue, color.saturation);
    },
    setRenderMarkdown: (enabled) => setTouched({ renderMarkdown: enabled }),
    setMotionPreference: (preference) =>
      setTouched({ motionPreference: normalizeMotionPreference(preference) }),
    setEditorMarkdownPreview: (enabled) =>
      setTouched({ editorMarkdownPreview: enabled }),
    setFontSize: (size) => {
      const fontSize = normalizeFontSize(size);
      setTouched({ fontSize });
      setDocumentFontSize(fontSize);
    },
  } satisfies SettingsActionGroup<
    | "setCustomThemeHex"
    | "setRenderMarkdown"
    | "setMotionPreference"
    | "setEditorMarkdownPreview"
    | "setFontSize"
  >;
}

function applyCurrentBackgroundImage(context: SettingsActionContext): void {
  const state = context.get();
  applyBackgroundImageVars({
    backgroundImageFileName: state.backgroundImageFileName,
    backgroundImageOpacity: state.backgroundImageOpacity,
    backgroundImageBlur: state.backgroundImageBlur,
  });
}

function createBackgroundImageActions(context: SettingsActionContext) {
  const { get, setTouched } = context;
  return {
    applyBackgroundImageSelection: (fileName) => {
      const backgroundImageFileName =
        normalizeBackgroundImageFileName(fileName);
      if (!backgroundImageFileName) return;
      const { backgroundImageOpacity, backgroundImageBlur } = get();
      setTouched({
        backgroundImageEnabled: true,
        backgroundImageFileName,
        backgroundImageOpacity,
        backgroundImageBlur,
      });
      applyBackgroundImageVars({
        backgroundImageFileName,
        backgroundImageOpacity,
        backgroundImageBlur,
      });
    },
    setBackgroundImageEnabled: (backgroundImageEnabled) => {
      if (get().backgroundImageEnabled !== backgroundImageEnabled) {
        setTouched({ backgroundImageEnabled });
      }
    },
    setBackgroundImageFileName: (fileName) => {
      const backgroundImageFileName =
        normalizeBackgroundImageFileName(fileName);
      if (get().backgroundImageFileName === backgroundImageFileName) return;
      setTouched({ backgroundImageFileName });
      applyCurrentBackgroundImage(context);
    },
  } satisfies SettingsActionGroup<
    | "applyBackgroundImageSelection"
    | "setBackgroundImageEnabled"
    | "setBackgroundImageFileName"
  >;
}

function createBackgroundImageTuningActions(context: SettingsActionContext) {
  const { get, setTouched } = context;
  return {
    setBackgroundImageOpacity: (opacity) => {
      const backgroundImageOpacity = clampBackgroundImageOpacity(opacity);
      if (get().backgroundImageOpacity === backgroundImageOpacity) return;
      setTouched({ backgroundImageOpacity });
      applyCurrentBackgroundImage(context);
    },
    setBackgroundImageBlur: (blur) => {
      const backgroundImageBlur = clampBackgroundImageBlur(blur);
      if (get().backgroundImageBlur === backgroundImageBlur) return;
      setTouched({ backgroundImageBlur });
      applyCurrentBackgroundImage(context);
    },
  } satisfies SettingsActionGroup<
    "setBackgroundImageOpacity" | "setBackgroundImageBlur"
  >;
}

function createAppearanceActions(context: SettingsActionContext) {
  return {
    ...createThemeModeActions(context),
    ...createCustomThemeActions(context),
    ...createBackgroundImageActions(context),
    ...createBackgroundImageTuningActions(context),
  };
}

function createEditorActions(context: SettingsActionContext) {
  const { setTouched } = context;
  return {
    setClipboardImportEnabled: (clipboardImportEnabled) =>
      setTouched({ clipboardImportEnabled }),
    setAutoSave: (autoSave) => setTouched({ autoSave }),
    setShowLineNumbers: (showLineNumbers) => setTouched({ showLineNumbers }),
    setEnableNotifications: (enableNotifications) =>
      setTouched({ enableNotifications }),
    setShowCopyNotification: (showCopyNotification) =>
      setTouched({ showCopyNotification }),
    setShowSaveNotification: (showSaveNotification) =>
      setTouched({ showSaveNotification }),
    setLocalSessionIndexEnabled: (localSessionIndexEnabled) =>
      setTouched({ localSessionIndexEnabled }),
  } satisfies SettingsActionGroup<
    | "setClipboardImportEnabled"
    | "setAutoSave"
    | "setShowLineNumbers"
    | "setEnableNotifications"
    | "setShowCopyNotification"
    | "setShowSaveNotification"
    | "setLocalSessionIndexEnabled"
  >;
}

function createDesktopIntegrationActions(context: SettingsActionContext) {
  const { get, persistSettingsToMain, setTouched, syncSettingsToMain } =
    context;
  return {
    setLaunchAtStartup: (launchAtStartup) => {
      setTouched({ launchAtStartup });
      window.electron?.setAutoLaunch?.(launchAtStartup, get().minimizeOnLaunch);
      void syncSettingsToMain({ launchAtStartup });
    },
    setMinimizeOnLaunch: (minimizeOnLaunch) => {
      setTouched({ minimizeOnLaunch });
      window.electron?.setMinimizeToTray?.(minimizeOnLaunch);
      if (get().launchAtStartup) {
        window.electron?.setAutoLaunch?.(true, minimizeOnLaunch);
      }
      void syncSettingsToMain({ minimizeOnLaunch });
    },
    setCloseAction: (action) => {
      const closeAction = normalizeCloseAction(action);
      setTouched({ closeAction });
      window.electron?.setCloseAction?.(closeAction);
      void syncSettingsToMain({ closeAction });
    },
    persistCloseAction: async (action) => {
      const previousCloseAction = get().closeAction;
      const closeAction = normalizeCloseAction(action);
      setTouched({ closeAction });
      window.electron?.setCloseAction?.(closeAction);
      try {
        await persistSettingsToMain({ closeAction });
      } catch (error) {
        setTouched({ closeAction: previousCloseAction });
        window.electron?.setCloseAction?.(previousCloseAction);
        throw error;
      }
    },
    setDebugMode: (debugMode) => {
      setTouched({ debugMode });
      window.electron?.setDebugMode?.(debugMode);
    },
  } satisfies SettingsActionGroup<
    | "setLaunchAtStartup"
    | "setMinimizeOnLaunch"
    | "setCloseAction"
    | "persistCloseAction"
    | "setDebugMode"
  >;
}

function createShortcutActions(context: SettingsActionContext) {
  const { get, setTouched } = context;
  return {
    setShortcutMode: (key, mode) => {
      const shortcutModes = { ...get().shortcutModes, [key]: mode };
      setTouched({ shortcutModes });
      window.electron?.setShortcutMode?.(shortcutModes);
    },
  } satisfies SettingsActionGroup<"setShortcutMode">;
}

function savePromptTagCatalog(
  context: SettingsActionContext,
  promptTagCatalog: string[],
): void {
  context.setTouched({ promptTagCatalog });
  void context.syncSettingsToMain({ promptTagCatalog });
}

function createTagCatalogActions(context: SettingsActionContext) {
  const { get, setTouched } = context;
  return {
    setTagFilterMode: (tagFilterMode) => setTouched({ tagFilterMode }),
    addPromptTagCatalogEntry: (tag) => {
      const normalized = tag.trim();
      if (!normalized || get().promptTagCatalog.includes(normalized)) return;
      const promptTagCatalog = [...get().promptTagCatalog, normalized].sort(
        (left, right) => left.localeCompare(right),
      );
      savePromptTagCatalog(context, promptTagCatalog);
    },
    renamePromptTagCatalogEntry: (oldTag, newTag) => {
      const oldValue = oldTag.trim();
      const newValue = newTag.trim();
      if (!oldValue || !newValue || oldValue === newValue) return;
      const promptTagCatalog = Array.from(
        new Set(
          get().promptTagCatalog.map((tag) =>
            tag === oldValue ? newValue : tag,
          ),
        ),
      ).sort((left, right) => left.localeCompare(right));
      savePromptTagCatalog(context, promptTagCatalog);
    },
  } satisfies SettingsActionGroup<
    | "setTagFilterMode"
    | "addPromptTagCatalogEntry"
    | "renamePromptTagCatalogEntry"
  >;
}

function createTagCatalogRemovalAction(context: SettingsActionContext) {
  const { get } = context;
  return {
    deletePromptTagCatalogEntry: (tag) => {
      const promptTagCatalog = get().promptTagCatalog.filter(
        (item) => item !== tag.trim(),
      );
      savePromptTagCatalog(context, promptTagCatalog);
    },
  } satisfies SettingsActionGroup<"deletePromptTagCatalogEntry">;
}

function changeLanguageSafely(language: string): void {
  void changeLanguage(language).catch((error) => {
    console.error("Failed to change language:", error);
  });
}

function createReleaseActions(context: SettingsActionContext) {
  const { get, setTouched, syncSettingsToMain } = context;
  return {
    setLanguage: (language) => {
      const normalized = normalizeLanguage(language);
      setTouched({ language: normalized });
      changeLanguageSafely(normalized);
      void syncSettingsToMain({ language: normalized });
    },
    setDataPath: (dataPath) => setTouched({ dataPath }),
    setAutoCheckUpdate: (autoCheckUpdate) => setTouched({ autoCheckUpdate }),
    setUseUpdateMirror: (useUpdateMirror) => setTouched({ useUpdateMirror }),
    setUpdateChannel: (updateChannel) =>
      setTouched({ updateChannel, updateChannelExplicitlySet: true }),
    inferUpdateChannel: (version) => {
      const state = get();
      if (state.updateChannelExplicitlySet) return;
      const updateChannel = isPrereleaseVersion(version) ? "preview" : "stable";
      if (state.updateChannel !== updateChannel) setTouched({ updateChannel });
    },
  } satisfies SettingsActionGroup<
    | "setLanguage"
    | "setDataPath"
    | "setAutoCheckUpdate"
    | "setUseUpdateMirror"
    | "setUpdateChannel"
    | "inferUpdateChannel"
  >;
}

function createSidebarTagActions(context: SettingsActionContext) {
  const { get, setTouched } = context;
  return {
    setTagsSectionHeight: (height) =>
      setTouched({ tagsSectionHeight: normalizeTagsSectionHeight(height) }),
    setIsTagsSectionCollapsed: (isTagsSectionCollapsed) =>
      setTouched({ isTagsSectionCollapsed }),
    setResourceTagsSectionHeight: (height) => {
      const resourceTagsSectionHeight = normalizeTagsSectionHeight(height);
      setTouched({
        resourceTagsSectionHeight,
        skillTagsSectionHeight: resourceTagsSectionHeight,
      });
    },
    setIsResourceTagsSectionCollapsed: (isResourceTagsSectionCollapsed) =>
      setTouched({
        isResourceTagsSectionCollapsed,
        isSkillTagsSectionCollapsed: isResourceTagsSectionCollapsed,
      }),
    setSkillTagsSectionHeight: (height) =>
      get().setResourceTagsSectionHeight(height),
    setIsSkillTagsSectionCollapsed: (collapsed) =>
      get().setIsResourceTagsSectionCollapsed(collapsed),
    setSkillListPageSize: (skillListPageSize) =>
      setTouched({
        skillListPageSize: normalizeSkillListPageSize(skillListPageSize),
      }),
    setSkillTagFilterIncludeFrontmatter: (value) =>
      setTouched({
        skillTagFilterIncludeFrontmatter: normalizeSkillTagFilterIncludeFrontmatter(
          value,
        ),
      }),
  } satisfies SettingsActionGroup<
    | "setTagsSectionHeight"
    | "setIsTagsSectionCollapsed"
    | "setResourceTagsSectionHeight"
    | "setIsResourceTagsSectionCollapsed"
    | "setSkillTagsSectionHeight"
    | "setIsSkillTagsSectionCollapsed"
    | "setSkillListPageSize"
    | "setSkillTagFilterIncludeFrontmatter"
  >;
}

function updateDesktopHomeModules(
  context: SettingsActionContext,
  modules: string[],
): void {
  const desktopHomeModules = normalizeDesktopHomeModules(modules);
  const current = context.get().desktopHomeModules;
  const changed =
    desktopHomeModules.length !== current.length ||
    desktopHomeModules.some((item, index) => item !== current[index]);
  if (changed) context.setTouched({ desktopHomeModules });
}

function createDesktopHomeActions(context: SettingsActionContext) {
  const { get } = context;
  return {
    toggleDesktopHomeModule: (moduleId) => {
      const current = get().desktopHomeModules;
      if (current.includes(moduleId) && current.length === 1) return;
      const modules = current.includes(moduleId)
        ? current.filter((item) => item !== moduleId)
        : [...current, moduleId];
      updateDesktopHomeModules(context, modules);
    },
    reorderDesktopHomeModules: (modules) =>
      updateDesktopHomeModules(context, modules),
  } satisfies SettingsActionGroup<
    "toggleDesktopHomeModule" | "reorderDesktopHomeModules"
  >;
}

function applyDesktopIntegrations(context: SettingsActionContext): void {
  const state = context.get();
  if (state.minimizeOnLaunch) window.electron?.setMinimizeToTray?.(true);
  if (state.debugMode) window.electron?.setDebugMode?.(true);
  if (state.closeAction) window.electron?.setCloseAction?.(state.closeAction);
}

function createApplyThemeAction(context: SettingsActionContext) {
  const { get } = context;
  return {
    applyTheme: () => {
      const state = get();
      document.documentElement.classList.toggle(
        "dark",
        resolveIsDark(state.themeMode),
      );
      setDocumentThemeColor(state.themeHue, state.themeSaturation);
      setDocumentFontSize(state.fontSize);
      applyBackgroundImageVars(state);
      applyDesktopIntegrations(context);
    },
  } satisfies SettingsActionGroup<"applyTheme">;
}

export function createGeneralSettingsActions(
  context: SettingsActionContext,
): SettingsActionGroup<GeneralActionKey> {
  return Object.assign(
    {},
    createWorkflowActions(context),
    createAppearanceActions(context),
    createEditorActions(context),
    createDesktopIntegrationActions(context),
    createShortcutActions(context),
    createTagCatalogActions(context),
    createTagCatalogRemovalAction(context),
    createReleaseActions(context),
    createSidebarTagActions(context),
    createDesktopHomeActions(context),
    createApplyThemeAction(context),
  );
}

import type { Settings } from "@prompthub/shared/types";
import { normalizeNetworkProxySettings } from "@prompthub/shared/utils/network-proxy";
import type { StoreApi } from "zustand";
import {
  applyBackgroundImageVars,
  clampBackgroundImageBlur,
  clampBackgroundImageOpacity,
  DEFAULT_BACKGROUND_IMAGE_BLUR,
  DEFAULT_BACKGROUND_IMAGE_OPACITY,
  normalizeAppearanceSettings,
  normalizeBackgroundImageBlur,
  normalizeBackgroundImageFileName,
} from "./settings-appearance";
import {
  normalizeAIModelDefaults,
  normalizeAIProtocol,
  normalizePersistedAIModels,
  normalizePersistedAIProviders,
} from "./settings-ai";
import {
  buildMainProcessSyncSettings,
  clampSyncProvider,
  deriveLegacyCustomPlatformRootPaths,
  inferLegacySyncProvider,
  migrateResourceTagSectionSettings,
  migrateTraeCnPlatformState,
  normalizeCustomAgentSettings,
  normalizeDesktopHomeModules,
  normalizeLanguage,
  normalizePlatformVisibilitySettings,
  normalizePromptTagCatalog,
  normalizePromptWorkflowSettings,
  normalizeShortcutModes,
  normalizeSidebarTagSectionHeights,
  normalizeSkillListPageSize,
  normalizeSkillTagFilterIncludeFrontmatter,
  normalizeSyncProvider,
  normalizeSyncTimingSettings,
  normalizeTagFilterMode,
} from "./settings-normalizers";
import { normalizeBuiltinAgentOverrides } from "../../services/agent-root-paths";
import { normalizeSkillProjects } from "../../services/skill-project-settings";
import {
  SUPPORTED_LANGUAGES,
  type SettingsState,
  type SupportedLanguage,
} from "./settings-types";
import { normalizeAgentIdentityPreferences } from "../../services/agent-identity";
import {
  isSkillSafetyChannel,
  isSkillSafetyPolicyValue,
  normalizeSkillSafetyStoreId,
  type SkillSafetyChannel,
  type SkillSafetyPolicyValue,
} from "../../services/skill-safety-policy";

type PersistedSettingsState = Partial<Omit<SettingsState, "githubToken">>;

const DESKTOP_RENDERER_PREFERENCE_FIELDS = new Set<keyof SettingsState>([
  "creationMode",
  "themeMode",
  "isDarkMode",
  "themeColor",
  "themeHue",
  "themeSaturation",
  "customThemeHex",
  "fontSize",
  "backgroundImageEnabled",
  "backgroundImageFileName",
  "backgroundImageOpacity",
  "backgroundImageBlur",
  "renderMarkdown",
  "editorMarkdownPreview",
  "motionPreference",
  "showLineNumbers",
  "tagFilterMode",
  "tagsSectionHeight",
  "isTagsSectionCollapsed",
  "resourceTagsSectionHeight",
  "isResourceTagsSectionCollapsed",
  "skillTagsSectionHeight",
  "isSkillTagsSectionCollapsed",
  "desktopHomeModules",
  "skillListPageSize",
  "skillTagFilterIncludeFrontmatter",
  "translationMode",
  "imageReverseAttachReferenceByDefault",
]);

export function getPersistedLanguageSetting(
  persistedState: unknown,
): SupportedLanguage | null {
  if (!persistedState || typeof persistedState !== "object") return null;
  const language = (persistedState as { language?: unknown }).language;
  return typeof language === "string" &&
    SUPPORTED_LANGUAGES.includes(language as SupportedLanguage)
    ? (language as SupportedLanguage)
    : null;
}

export function stripEphemeralSettings(
  state: SettingsState,
): PersistedSettingsState {
  const { githubToken: _githubToken, ...persistedState } = state;
  if (
    typeof window !== "undefined" &&
    window.__PROMPTHUB_WEB__ !== true &&
    window.api?.settings?.rendererPersistence
  ) {
    return Object.fromEntries(
      Object.entries(persistedState).filter(([key, value]) =>
        DESKTOP_RENDERER_PREFERENCE_FIELDS.has(key as keyof SettingsState) &&
        typeof value !== "function",
      ),
    ) as PersistedSettingsState;
  }
  return persistedState;
}

function scrubPersistedGithubToken(): void {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem("prompthub-settings");
    if (!raw) return;
    const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
    if (!parsed.state || !("githubToken" in parsed.state)) return;
    delete parsed.state.githubToken;
    localStorage.setItem("prompthub-settings", JSON.stringify(parsed));
  } catch {
    // Malformed legacy storage is ignored; the in-memory token is still cleared.
  }
}

function normalizeSharedSettingsState(next: SettingsState): void {
  next.githubToken = "";
  normalizeAppearanceSettings(next, normalizeLanguage);
  normalizePromptWorkflowSettings(next);
  next.aiApiProtocol = normalizeAIProtocol(
    next.aiApiProtocol,
    next.aiProvider,
    next.aiApiUrl,
  );
  next.aiProviders = normalizePersistedAIProviders(next.aiProviders);
  next.aiModels = normalizePersistedAIModels(next.aiModels);
  normalizeAIModelDefaults(next);
  next.tagFilterMode = normalizeTagFilterMode(next.tagFilterMode);
  next.promptTagCatalog = normalizePromptTagCatalog(next.promptTagCatalog);
  next.skillProjects = normalizeSkillProjects(next.skillProjects);
  next.shortcutModes = normalizeShortcutModes(next.shortcutModes);
  next.skillListPageSize = normalizeSkillListPageSize(next.skillListPageSize);
  next.skillTagFilterIncludeFrontmatter =
    normalizeSkillTagFilterIncludeFrontmatter(
      next.skillTagFilterIncludeFrontmatter,
    );
  normalizeSkillTrustSettings(next);
  next.networkProxy = normalizeNetworkProxySettings(next.networkProxy);
  next.agentIdentityPreferences = normalizeAgentIdentityPreferences(
    next.agentIdentityPreferences,
  );
}

function normalizeMergedAgentSettings(next: SettingsState): void {
  normalizeCustomAgentSettings(next, { migrateLegacyScanPaths: false });
  normalizePlatformVisibilitySettings(next);
  migrateTraeCnPlatformState(next);
}

function normalizeMergedPresentationSettings(
  next: SettingsState,
  persistedState: unknown,
): void {
  migrateResourceTagSectionSettings(next, persistedState);
  normalizeSidebarTagSectionHeights(next);
  next.desktopHomeModules = normalizeDesktopHomeModules(
    next.desktopHomeModules,
  );
  delete (next as unknown as Record<string, unknown>).desktopHomeLayout;
  next.backgroundImageFileName = normalizeBackgroundImageFileName(
    next.backgroundImageFileName,
  );
  next.backgroundImageOpacity = clampBackgroundImageOpacity(
    typeof next.backgroundImageOpacity === "number"
      ? next.backgroundImageOpacity
      : DEFAULT_BACKGROUND_IMAGE_OPACITY,
  );
  next.backgroundImageBlur = clampBackgroundImageBlur(
    typeof next.backgroundImageBlur === "number"
      ? next.backgroundImageBlur
      : DEFAULT_BACKGROUND_IMAGE_BLUR,
  );
}

function normalizeSyncProviderState(next: SettingsState): void {
  normalizeSyncTimingSettings(next);
  next.syncProvider = clampSyncProvider(
    normalizeSyncProvider(next.syncProvider),
    {
      webdavEnabled: next.webdavEnabled === true,
      selfHostedSyncEnabled: next.selfHostedSyncEnabled === true,
      s3StorageEnabled: next.s3StorageEnabled === true,
    },
  );
}

function normalizeMergedState(
  next: SettingsState,
  persistedState: unknown,
): SettingsState {
  normalizeSharedSettingsState(next);
  normalizeMergedAgentSettings(next);
  normalizeMergedPresentationSettings(next, persistedState);
  normalizeSyncProviderState(next);
  return next;
}

export function mergeSettingsState(
  persistedState: unknown,
  currentState: SettingsState,
): SettingsState {
  const next = {
    ...currentState,
    ...(persistedState as Partial<SettingsState>),
  };
  if (
    persistedState &&
    typeof persistedState === "object" &&
    "githubToken" in persistedState
  ) {
    scrubPersistedGithubToken();
  }
  return normalizeMergedState(next, persistedState);
}

function ensureObjectSetting(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeLegacyAgentOverrideShape(
  next: SettingsState,
  version: number,
): void {
  normalizeCustomAgentSettings(next, { migrateLegacyScanPaths: version < 12 });
  next.builtinAgentOverrides = normalizeBuiltinAgentOverrides(
    ensureObjectSetting(next.builtinAgentOverrides),
  );
  next.customPlatformRootPaths = ensureObjectSetting(
    next.customPlatformRootPaths,
  ) as SettingsState["customPlatformRootPaths"];
  next.customSkillPlatformPaths = ensureObjectSetting(
    next.customSkillPlatformPaths,
  ) as SettingsState["customSkillPlatformPaths"];
}

function migrateLegacyRuleTrackingState(next: SettingsState): void {
  const legacy = next as Partial<SettingsState> & {
    trackedRulePlatformIds?: unknown;
    rulePlatformTrackingInitialized?: unknown;
  };
  if (!Array.isArray(next.disabledPlatformIds)) {
    next.disabledPlatformIds = Array.isArray(legacy.trackedRulePlatformIds)
      ? legacy.trackedRulePlatformIds
      : [];
  }
  delete legacy.rulePlatformTrackingInitialized;
  delete legacy.trackedRulePlatformIds;
}

function migrateLegacyPlatformPaths(
  next: SettingsState,
  version: number,
): void {
  if (
    version < 7 &&
    Object.keys(next.customPlatformRootPaths).length === 0 &&
    Object.keys(next.customSkillPlatformPaths).length > 0
  ) {
    next.customPlatformRootPaths = { ...next.customSkillPlatformPaths };
  }
  if (
    Object.keys(next.builtinAgentOverrides).length === 0 &&
    Object.keys(next.customPlatformRootPaths).length > 0
  ) {
    next.builtinAgentOverrides = normalizeBuiltinAgentOverrides(
      Object.fromEntries(
        Object.entries(next.customPlatformRootPaths).map(
          ([platformId, rootPath]) => [platformId, { rootPath }],
        ),
      ),
    );
  }
  next.customPlatformRootPaths = deriveLegacyCustomPlatformRootPaths(
    next.builtinAgentOverrides,
  );
  if (version <= 11 && next.disabledPlatformIds.length > 0) {
    next.disabledPlatformIds = [];
  }
}

function normalizeLegacyAgentSettings(
  next: SettingsState,
  version: number,
): void {
  normalizeLegacyAgentOverrideShape(next, version);
  migrateLegacyRuleTrackingState(next);
  migrateLegacyPlatformPaths(next, version);
  normalizePlatformVisibilitySettings(next);
  migrateTraeCnPlatformState(next);
}

function normalizeSkillTrustSettings(next: SettingsState): void {
  if (typeof next.autoScanInstalledSkills !== "boolean") {
    next.autoScanInstalledSkills = false;
  }
  if (typeof next.autoScanStoreSkillsBeforeInstall !== "boolean") {
    next.autoScanStoreSkillsBeforeInstall = false;
  }
  next.skillSafetyChannelPolicies = Object.fromEntries(
    Object.entries(next.skillSafetyChannelPolicies ?? {}).filter(
      (entry): entry is [SkillSafetyChannel, SkillSafetyPolicyValue] =>
        isSkillSafetyChannel(entry[0]) && isSkillSafetyPolicyValue(entry[1]),
    ),
  );
  next.skillSafetyStorePolicies = Object.fromEntries(
    Object.entries(next.skillSafetyStorePolicies ?? {})
      .map(([storeId, policy]) => [
        normalizeSkillSafetyStoreId(storeId),
        policy,
      ])
      .filter(
        (entry): entry is [string, SkillSafetyPolicyValue] =>
          Boolean(entry[0]) && isSkillSafetyPolicyValue(entry[1]),
      )
      .slice(0, 512),
  );
  next.trustedSkillUpdateSourceKeys = Array.isArray(
    next.trustedSkillUpdateSourceKeys,
  )
    ? Array.from(
        new Set(
          next.trustedSkillUpdateSourceKeys
            .filter((key): key is string => typeof key === "string")
            .map((key) => key.trim().slice(0, 512))
            .filter(Boolean),
        ),
      ).slice(-512)
    : [];
}

function normalizeMigratedCoreState(
  next: SettingsState,
  persistedState: unknown,
  version: number,
): void {
  next.githubToken = "";
  normalizeAppearanceSettings(next, normalizeLanguage);
  normalizePromptWorkflowSettings(next);
  next.aiApiProtocol = normalizeAIProtocol(
    next.aiApiProtocol,
    next.aiProvider,
    next.aiApiUrl,
  );
  next.aiModels = normalizePersistedAIModels(next.aiModels);
  next.aiProviders = normalizePersistedAIProviders(next.aiProviders);
  migrateResourceTagSectionSettings(next, persistedState);
  normalizeSidebarTagSectionHeights(next);
  normalizeAIModelDefaults(next);
  next.promptTagCatalog = normalizePromptTagCatalog(next.promptTagCatalog);
  next.tagFilterMode = normalizeTagFilterMode(next.tagFilterMode);
  next.shortcutModes = normalizeShortcutModes(next.shortcutModes);
  next.skillListPageSize = normalizeSkillListPageSize(next.skillListPageSize);
  next.skillTagFilterIncludeFrontmatter =
    normalizeSkillTagFilterIncludeFrontmatter(
      next.skillTagFilterIncludeFrontmatter,
    );
  normalizeLegacyAgentSettings(next, version);
  next.skillProjects = normalizeSkillProjects(next.skillProjects);
  normalizeSkillTrustSettings(next);
  next.networkProxy = normalizeNetworkProxySettings(next.networkProxy);
  next.agentIdentityPreferences = normalizeAgentIdentityPreferences(
    next.agentIdentityPreferences,
  );
}

function normalizeMigratedPresentationState(
  next: SettingsState,
  version: number,
): void {
  if (typeof next.backgroundImageEnabled !== "boolean") {
    next.backgroundImageEnabled = true;
  }
  next.desktopHomeModules = normalizeDesktopHomeModules(
    next.desktopHomeModules,
    {
      includeNewDefaults: version < 17,
      migratePreviousDefaultOrder: version < 17,
    },
  );
  delete (next as unknown as Record<string, unknown>).desktopHomeLayout;
  if (typeof next.updateChannelExplicitlySet !== "boolean") {
    next.updateChannelExplicitlySet = false;
  }
}

function normalizeMigratedSyncProvider(
  next: SettingsState,
  version: number,
): void {
  normalizeSyncTimingSettings(next);
  next.syncProvider =
    version < 9
      ? inferLegacySyncProvider(next)
      : clampSyncProvider(normalizeSyncProvider(next.syncProvider), {
          webdavEnabled: next.webdavEnabled === true,
          selfHostedSyncEnabled: next.selfHostedSyncEnabled === true,
          s3StorageEnabled: next.s3StorageEnabled === true,
        });
}

function normalizeLegacyAiProtocol(next: SettingsState, version: number): void {
  if (version >= 8) return;
  next.aiApiProtocol = normalizeAIProtocol(
    next.aiApiProtocol,
    next.aiProvider,
    next.aiApiUrl,
  );
  next.aiModels = next.aiModels.map((model) => ({
    ...model,
    apiProtocol: normalizeAIProtocol(
      model.apiProtocol,
      model.provider,
      model.apiUrl,
    ),
  }));
}

function normalizeMigratedBackgroundImage(
  next: SettingsState,
  version: number,
): void {
  next.backgroundImageFileName = normalizeBackgroundImageFileName(
    next.backgroundImageFileName,
  );
  next.backgroundImageOpacity = clampBackgroundImageOpacity(
    typeof next.backgroundImageOpacity === "number"
      ? next.backgroundImageOpacity
      : DEFAULT_BACKGROUND_IMAGE_OPACITY,
  );
  next.backgroundImageBlur = normalizeBackgroundImageBlur(
    typeof next.backgroundImageBlur === "number"
      ? next.backgroundImageBlur
      : DEFAULT_BACKGROUND_IMAGE_BLUR,
    version,
  );
}

export function migrateSettingsState(
  state: unknown,
  version: number,
): SettingsState {
  if (!state || typeof state !== "object") return state as SettingsState;
  const next = { ...(state as SettingsState) };
  normalizeMigratedCoreState(next, state, version);
  normalizeMigratedPresentationState(next, version);
  normalizeMigratedSyncProvider(next, version);
  normalizeLegacyAiProtocol(next, version);
  normalizeMigratedBackgroundImage(next, version);
  return next;
}

export function rehydrateSettingsState(
  state: SettingsState | undefined,
  setState: StoreApi<SettingsState>["setState"],
  syncSettingsToMain: (settings: Partial<Settings>) => Promise<void>,
  shouldSyncLanguage: boolean,
): void {
  const syncProvider = clampSyncProvider(
    normalizeSyncProvider(state?.syncProvider),
    {
      webdavEnabled: state?.webdavEnabled === true,
      selfHostedSyncEnabled: state?.selfHostedSyncEnabled === true,
      s3StorageEnabled: state?.s3StorageEnabled === true,
    },
  );
  if (state && state.syncProvider !== syncProvider) setState({ syncProvider });
  applyBackgroundImageVars({
    backgroundImageFileName: state?.backgroundImageFileName,
    backgroundImageOpacity: state?.backgroundImageOpacity,
    backgroundImageBlur: state?.backgroundImageBlur,
  });
  const mainProcessSettings: Partial<Settings> = {
    builtinAgentOverrides: state?.builtinAgentOverrides || {},
    agentIdentityPreferences: normalizeAgentIdentityPreferences(
      state?.agentIdentityPreferences,
    ),
    customAgents: state?.customAgents || [],
    customAgentRootPaths: state?.customAgentRootPaths || [],
    customPlatformRootPaths: state?.customPlatformRootPaths || {},
    disabledPlatformIds: state?.disabledPlatformIds || [],
    customSkillPlatformPaths: state?.customSkillPlatformPaths || {},
    skillPlatformOrder: state?.skillPlatformOrder || [],
    skillProjects: state?.skillProjects || [],
    networkProxy: normalizeNetworkProxySettings(state?.networkProxy),
    sync: buildMainProcessSyncSettings(syncProvider),
  };
  if (shouldSyncLanguage && state?.language) {
    mainProcessSettings.language = state.language;
  }
  void syncSettingsToMain(mainProcessSettings);
}

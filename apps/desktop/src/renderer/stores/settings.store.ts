import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  BuiltinAgentOverrideConfig,
  Settings,
} from "@prompthub/shared/types";
import type { AIProtocol } from "@prompthub/shared/types";
import { normalizeNetworkProxySettings } from "@prompthub/shared/utils/network-proxy";
import {
  normalizeBuiltinAgentOverrides,
  normalizeCustomAgents,
} from "../services/agent-root-paths";
import { createAgentSettingsActions } from "./settings/settings-agent-actions";
import { createAISettingsActions } from "./settings/settings-ai-actions";
import {
  attachProviderIdsToAIModels,
  buildAISettingsSyncPayload,
  normalizeAIProtocol,
  normalizeModelRouteDefaults,
  normalizePersistedAIModels,
  normalizePersistedAIProviders,
} from "./settings/settings-ai";
import { createDefaultSettingsValues } from "./settings/settings-defaults";
import { createGeneralSettingsActions } from "./settings/settings-general-actions";
import {
  buildMainProcessSyncSettings,
  clampSyncProvider,
  deriveLegacyCustomPlatformRootPaths,
  getCustomAgentRootPaths,
  normalizeAgentRootPaths,
  normalizeSyncProvider,
} from "./settings/settings-normalizers";
import {
  getPersistedLanguageSetting,
  mergeSettingsState,
  migrateSettingsState,
  rehydrateSettingsState,
  stripEphemeralSettings,
} from "./settings/settings-persistence";
import { createSyncSettingsActions } from "./settings/settings-sync-actions";
import { applyBackgroundImageVars } from "./settings/settings-appearance";
import type {
  AIModelConfig,
  AIProviderConfig,
  ModelRouteDefaults,
  SettingsState,
} from "./settings/settings-types";
import {
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from "./settings/settings-types";
import { normalizeAgentIdentityPreferences } from "../services/agent-identity";

export {
  FONT_SIZES,
  getRenderedBackgroundImageBlur,
  getRenderedBackgroundImageOpacity,
  MORANDI_THEMES,
} from "./settings/settings-appearance";
export { AI_SCENARIO_MODEL_ROUTE } from "./settings/settings-ai";
export {
  DEFAULT_SKILL_LIST_PAGE_SIZE,
  SKILL_LIST_PAGE_SIZE_OPTIONS,
} from "./settings/settings-normalizers";
export { DESKTOP_HOME_MODULES } from "./settings/settings-types";
export type {
  AIModelCapabilities,
  AIModelConfig,
  AIModelRoute,
  AIModelType,
  AIProviderConfig,
  AIUsageScenario,
  ChatModelParams,
  CreationMode,
  DesktopHomeModule,
  ImageModelParams,
  ModelRouteDefaults,
  ScenarioModelDefaults,
  SupportedLanguage,
  TagFilterMode,
  ThemeMode,
  TranslationMode,
} from "./settings/settings-types";

function persistSettingsToMain(settings: Partial<Settings>): Promise<void> {
  const setSettings = window.api?.settings?.set;
  if (typeof setSettings !== "function") {
    return Promise.reject(new Error("Settings persistence is unavailable"));
  }
  return setSettings(settings).then(() => undefined);
}

function syncSettingsToMain(settings: Partial<Settings>): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const setSettings = window.api?.settings?.set;
  if (typeof setSettings !== "function") return Promise.resolve();
  return setSettings(settings).catch((error: unknown) =>
    console.warn("Failed to sync settings to main process:", error),
  );
}

function refreshRulesWorkspace(): void {
  void import("./rules.store").then(({ useRulesStore }) => {
    void useRulesStore.getState().loadFiles({ force: true });
  });
}

function refreshLoadedAgentWorkspace(): void {
  void import("./agent.store").then(({ useAgentStore }) => {
    const agentState = useAgentStore.getState();
    if (agentState.hasLoaded) void agentState.refresh();
  });
}

function syncSettingsToMainThenRefreshRules(settings: Partial<Settings>): void {
  void syncSettingsToMain(settings).then(() => {
    refreshRulesWorkspace();
    refreshLoadedAgentWorkspace();
  });
}

function sanitizeGithubToken(token: string): string {
  return token.replace(/[\r\n\x00-\x1f\x7f]/g, "").trim();
}

let persistedRendererLanguage: SupportedLanguage | null = null;

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => {
      const setTouched = (partial: Partial<SettingsState>) =>
        set({
          ...partial,
          settingsUpdatedAt: new Date().toISOString(),
        } as SettingsState);
      const commitAISettings = (partial: Partial<SettingsState>) => {
        setTouched(partial);
        void syncSettingsToMain(buildAISettingsSyncPayload(get()));
      };
      const context = {
        set,
        get,
        setTouched,
        commitAISettings,
        persistSettingsToMain,
        syncSettingsToMain,
        syncSettingsToMainThenRefreshRules,
      };
      return {
        ...createDefaultSettingsValues(),
        ...createGeneralSettingsActions(context),
        ...createSyncSettingsActions(context),
        ...createAISettingsActions(context),
        ...createAgentSettingsActions(context),
      };
    },
    {
      name: "prompthub-settings",
      version: 20,
      partialize: stripEphemeralSettings,
      merge: (persistedState, currentState) => {
        persistedRendererLanguage = getPersistedLanguageSetting(persistedState);
        return mergeSettingsState(persistedState, currentState);
      },
      migrate: migrateSettingsState,
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error("Failed to rehydrate settings store:", error);
          return;
        }
        queueMicrotask(() => {
          rehydrateSettingsState(
            state,
            useSettingsStore.setState,
            syncSettingsToMain,
            persistedRendererLanguage !== null,
          );
        });
      },
    },
  ),
);

applyBackgroundImageVars(useSettingsStore.getState());

/** Load settings owned by the Electron main process into the renderer store. */
export async function loadSettingsFromMainProcess(): Promise<void> {
  if (typeof window === "undefined") return;
  const settings = await window.api?.settings?.get?.();
  if (!settings) return;
  const aiSettings = settings as Settings & {
    aiProvider?: string;
    aiApiProtocol?: AIProtocol;
    aiApiKey?: string;
    aiApiUrl?: string;
    aiModel?: string;
    aiProviders?: AIProviderConfig[];
    aiModels?: AIModelConfig[];
    modelRouteDefaults?: ModelRouteDefaults;
  };
  const state = useSettingsStore.getState();
  const hydratedSettings = mergeSettingsState(settings, state);
  const hydratedValues = Object.fromEntries(
    Object.entries(hydratedSettings).filter(
      ([key, value]) => key !== "language" && typeof value !== "function",
    ),
  ) as Partial<SettingsState>;
  const mainProcessLanguage =
    typeof settings.language === "string" &&
    SUPPORTED_LANGUAGES.includes(settings.language as SupportedLanguage)
      ? (settings.language as SupportedLanguage)
      : null;
  const launchAtStartup =
    typeof settings.launchAtStartup === "boolean"
      ? settings.launchAtStartup
      : state.launchAtStartup;
  const minimizeOnLaunch =
    typeof settings.minimizeOnLaunch === "boolean"
      ? settings.minimizeOnLaunch
      : state.minimizeOnLaunch;
  const githubToken = sanitizeGithubToken(settings.githubToken ?? "");
  const canonicalSyncProvider = (
    settings as Settings & { syncProvider?: unknown }
  ).syncProvider;
  const syncProvider = clampSyncProvider(
    normalizeSyncProvider(canonicalSyncProvider ?? settings.sync?.provider),
    hydratedSettings,
  );
  const customAgents = normalizeCustomAgents(
    settings.customAgents ?? state.customAgents,
  );
  const configuredOverrides = normalizeBuiltinAgentOverrides(
    settings.builtinAgentOverrides ?? state.builtinAgentOverrides,
  );
  const legacyOverrides = Object.entries(
    settings.customPlatformRootPaths ?? {},
  ).reduce<Record<string, BuiltinAgentOverrideConfig>>(
    (acc, [platformId, rootPath]) => {
      if (typeof rootPath === "string") acc[platformId] = { rootPath };
      return acc;
    },
    {},
  );
  const builtinAgentOverrides =
    Object.keys(configuredOverrides).length > 0
      ? configuredOverrides
      : normalizeBuiltinAgentOverrides(legacyOverrides);
  const fallbackRootPaths = normalizeAgentRootPaths(
    customAgents.length > 0
      ? customAgents.map((agent) => agent.rootPath)
      : (settings.customAgentRootPaths ??
          settings.customSkillScanPaths ??
          state.customAgentRootPaths),
  );
  const aiProviders = Array.isArray(aiSettings.aiProviders)
    ? normalizePersistedAIProviders(aiSettings.aiProviders)
    : state.aiProviders;
  const aiModels = Array.isArray(aiSettings.aiModels)
    ? attachProviderIdsToAIModels(
        aiProviders,
        normalizePersistedAIModels(aiSettings.aiModels),
      )
    : state.aiModels;
  const aiProvider =
    typeof aiSettings.aiProvider === "string"
      ? aiSettings.aiProvider
      : state.aiProvider;
  const aiApiUrl =
    typeof aiSettings.aiApiUrl === "string"
      ? aiSettings.aiApiUrl
      : state.aiApiUrl;
  const networkProxy = normalizeNetworkProxySettings(
    settings.networkProxy ?? state.networkProxy,
  );
  const agentIdentityPreferences = normalizeAgentIdentityPreferences(
    settings.agentIdentityPreferences ?? state.agentIdentityPreferences,
  );

  useSettingsStore.setState({
    ...hydratedValues,
    customAgents,
    builtinAgentOverrides,
    agentIdentityPreferences,
    customPlatformRootPaths: deriveLegacyCustomPlatformRootPaths(
      builtinAgentOverrides,
    ),
    customAgentRootPaths:
      customAgents.length > 0
        ? getCustomAgentRootPaths(customAgents)
        : fallbackRootPaths,
    customSkillScanPaths: fallbackRootPaths,
    launchAtStartup,
    minimizeOnLaunch,
    githubToken,
    syncProvider,
    aiProvider,
    aiApiProtocol: normalizeAIProtocol(
      aiSettings.aiApiProtocol ?? state.aiApiProtocol,
      aiProvider,
      aiApiUrl,
    ),
    aiApiKey:
      typeof aiSettings.aiApiKey === "string"
        ? aiSettings.aiApiKey
        : state.aiApiKey,
    aiApiUrl,
    aiModel:
      typeof aiSettings.aiModel === "string"
        ? aiSettings.aiModel
        : state.aiModel,
    aiProviders,
    aiModels,
    modelRouteDefaults: normalizeModelRouteDefaults(
      aiSettings.modelRouteDefaults ?? state.modelRouteDefaults,
    ),
    networkProxy,
  });
  window.electron?.setCloseAction?.(useSettingsStore.getState().closeAction);

  if (typeof settings.launchAtStartup !== "boolean")
    void syncSettingsToMain({ launchAtStartup });
  if (typeof settings.minimizeOnLaunch !== "boolean")
    void syncSettingsToMain({ minimizeOnLaunch });
  if (settings.sync?.provider !== syncProvider)
    void syncSettingsToMain({
      sync: buildMainProcessSyncSettings(syncProvider),
    });
  if (!settings.networkProxy) void syncSettingsToMain({ networkProxy });
  if (!persistedRendererLanguage && mainProcessLanguage) {
    useSettingsStore.getState().setLanguage(mainProcessLanguage);
  }
}

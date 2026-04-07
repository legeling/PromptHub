const PRIMARY_SETTINGS_KEY = "prompthub-settings";
const LEGACY_SETTINGS_KEY = "settings-storage";

export interface AIConfigSnapshot {
  aiModels?: any[];
  scenarioModelDefaults?: Record<string, string>;
  aiProvider?: string;
  aiApiKey?: string;
  aiApiUrl?: string;
  aiModel?: string;
}

export interface SettingsStateSnapshot {
  state?: any;
  settingsUpdatedAt?: string;
}

export const SENSITIVE_SETTINGS_FIELDS = [
  "webdavUsername",
  "webdavPassword",
  "webdavEncryptionPassword",
  "aiApiKey",
] as const;

function readStoredSettings():
  | {
      key: string;
      data: { state?: any; version?: number };
    }
  | undefined {
  try {
    const primary = localStorage.getItem(PRIMARY_SETTINGS_KEY);
    const legacy = localStorage.getItem(LEGACY_SETTINGS_KEY);
    const raw = primary || legacy;
    if (!raw) return undefined;

    return {
      key: primary ? PRIMARY_SETTINGS_KEY : LEGACY_SETTINGS_KEY,
      data: JSON.parse(raw),
    };
  } catch (error) {
    console.warn("Failed to read stored settings:", error);
    return undefined;
  }
}

export function getAiConfigSnapshot(options?: {
  includeRootApiKey?: boolean;
}): AIConfigSnapshot | undefined {
  const stored = readStoredSettings();
  const state = stored?.data?.state;
  if (!state) return undefined;

  try {
    const filteredModels = (state.aiModels || []).map((model: any) => {
      const { apiKey, ...rest } = model || {};
      return rest;
    });

    return {
      aiModels: filteredModels,
      scenarioModelDefaults: state.scenarioModelDefaults || {},
      aiProvider: state.aiProvider,
      ...(options?.includeRootApiKey ? { aiApiKey: state.aiApiKey } : {}),
      aiApiUrl: state.aiApiUrl,
      aiModel: state.aiModel,
    };
  } catch (error) {
    console.warn("Failed to build AI config snapshot:", error);
    return undefined;
  }
}

export function getSettingsStateSnapshot(options?: {
  excludeFields?: readonly string[];
  updatedAt?: string;
}): SettingsStateSnapshot | undefined {
  const stored = readStoredSettings();
  const state = stored?.data?.state;
  if (!state) return undefined;

  try {
    const filteredState = { ...state };
    for (const field of options?.excludeFields || []) {
      delete filteredState[field];
    }

    return {
      state: filteredState,
      settingsUpdatedAt: options?.updatedAt ?? state.settingsUpdatedAt,
    };
  } catch (error) {
    console.warn("Failed to build settings snapshot:", error);
    return undefined;
  }
}

export function restoreAiConfigSnapshot(
  aiConfig: AIConfigSnapshot | undefined,
): void {
  if (!aiConfig) return;

  try {
    const stored = readStoredSettings();
    const targetKey = stored?.key || PRIMARY_SETTINGS_KEY;
    const data = stored?.data || { state: {} };
    if (!data.state) data.state = {};

    if (aiConfig.aiModels) data.state.aiModels = aiConfig.aiModels;
    if (aiConfig.scenarioModelDefaults) {
      data.state.scenarioModelDefaults = aiConfig.scenarioModelDefaults;
    }
    if (aiConfig.aiProvider) data.state.aiProvider = aiConfig.aiProvider;
    if (aiConfig.aiApiKey) data.state.aiApiKey = aiConfig.aiApiKey;
    if (aiConfig.aiApiUrl) data.state.aiApiUrl = aiConfig.aiApiUrl;
    if (aiConfig.aiModel) data.state.aiModel = aiConfig.aiModel;

    localStorage.setItem(targetKey, JSON.stringify(data));
  } catch (error) {
    console.warn("Failed to restore AI config snapshot:", error);
  }
}

export function restoreSettingsStateSnapshot(
  snapshot: SettingsStateSnapshot | undefined,
  options?: { preserveLocalFields?: readonly string[] },
): void {
  if (!snapshot?.state) return;

  try {
    const stored = readStoredSettings();
    const targetKey = stored?.key || PRIMARY_SETTINGS_KEY;
    const currentState = stored?.data?.state || {};
    const nextState = { ...snapshot.state };

    for (const field of options?.preserveLocalFields || []) {
      if (currentState[field] !== undefined) {
        nextState[field] = currentState[field];
      }
    }

    localStorage.setItem(
      targetKey,
      JSON.stringify({
        ...(stored?.data || {}),
        state: nextState,
      }),
    );
  } catch (error) {
    console.warn("Failed to restore settings state snapshot:", error);
  }
}

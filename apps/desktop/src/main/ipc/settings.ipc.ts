import { ipcMain } from 'electron';
import Database from '../database/sqlite';
import { coreAIConfigService } from '@prompthub/core';
import { IPC_CHANNELS } from '@prompthub/shared/constants';
import {
  getPlatformById,
  normalizeLegacySkillPathToRootTemplate,
} from '@prompthub/shared/constants/platforms';
import type { Settings } from '@prompthub/shared/types';
import { DEFAULT_SETTINGS } from '@prompthub/shared/types';
import type {
  CoreAIConfigFile,
  CoreAIModelConfig,
  CoreAIModelRoute,
  CoreAIProviderConfig,
} from '@prompthub/core';
import {
  getMinimizeOnLaunchSetting,
  readGithubTokenSetting,
} from '../settings/settings-readers';
import { invalidateCustomPathsCache } from '../services/skill-installer-utils';
import { applyNetworkProxySettings } from '../services/network-proxy';

export {
  getMinimizeOnLaunchSetting,
  readGithubTokenSetting as getGithubTokenSetting,
} from '../settings/settings-readers';

function isTraeCnLikePath(value: string | undefined): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  return /(?:^|[\\/])\.trae-cn(?:$|[\\/])/i.test(value.trim());
}

function migrateTraeCnPlatformState(settings: Settings): void {
  if (!settings.builtinAgentOverrides) {
    settings.builtinAgentOverrides = {};
  }

  if (!settings.customPlatformRootPaths) {
    settings.customPlatformRootPaths = {};
  }

  const traeBuiltinOverride = settings.builtinAgentOverrides.trae;
  const traeCnBuiltinOverride = settings.builtinAgentOverrides['trae-cn'];

  const traeRootOverride = settings.customPlatformRootPaths.trae;
  const traeCnRootOverride = settings.customPlatformRootPaths['trae-cn'];

  if (
    typeof traeBuiltinOverride?.rootPath === 'string' &&
    isTraeCnLikePath(traeBuiltinOverride.rootPath) &&
    !traeCnBuiltinOverride?.rootPath?.trim()
  ) {
    settings.builtinAgentOverrides['trae-cn'] = {
      ...traeBuiltinOverride,
      rootPath: traeBuiltinOverride.rootPath.trim(),
    };
    delete settings.builtinAgentOverrides.trae;
  }

  if (isTraeCnLikePath(traeRootOverride) && !traeCnRootOverride?.trim()) {
    settings.customPlatformRootPaths['trae-cn'] = traeRootOverride.trim();
    delete settings.customPlatformRootPaths.trae;
  }

  if (
    Array.isArray(settings.disabledPlatformIds) &&
    settings.disabledPlatformIds.includes('trae') &&
    !settings.disabledPlatformIds.includes('trae-cn')
  ) {
    settings.disabledPlatformIds = settings.disabledPlatformIds.map((platformId) =>
      platformId === 'trae' ? 'trae-cn' : platformId,
    );
  }

  if (
    Array.isArray(settings.skillPlatformOrder) &&
    settings.skillPlatformOrder.includes('trae') &&
    !settings.skillPlatformOrder.includes('trae-cn')
  ) {
    settings.skillPlatformOrder = settings.skillPlatformOrder.map((platformId) =>
      platformId === 'trae' ? 'trae-cn' : platformId,
    );
  }
}

function mergeSharedAIConfig(settings: Settings): void {
  try {
    const aiConfig = coreAIConfigService.read();
    if (aiConfig.providers.length > 0) {
      (settings as any).aiProviders = aiConfig.providers;
    }
    if (aiConfig.models.length > 0) {
      (settings as any).aiModels = aiConfig.models;
      const defaultChatModel =
        aiConfig.models.find((model) => model.type === 'chat' && model.isDefault) ??
        aiConfig.models.find((model) => model.type === 'chat');
      if (defaultChatModel) {
        (settings as any).aiProvider = defaultChatModel.provider;
        (settings as any).aiApiProtocol = defaultChatModel.apiProtocol;
        (settings as any).aiApiKey = defaultChatModel.apiKey;
        (settings as any).aiApiUrl = defaultChatModel.apiUrl;
        (settings as any).aiModel = defaultChatModel.model;
      }
    }
    if (Object.keys(aiConfig.modelRouteDefaults).length > 0) {
      (settings as any).modelRouteDefaults = aiConfig.modelRouteDefaults;
    }
  } catch (error) {
    console.warn('Failed to merge shared AI config:', error);
  }
}

type DesktopAISettingsPayload = Partial<Settings> & {
  aiProvider?: string;
  aiApiProtocol?: CoreAIProviderConfig['apiProtocol'];
  aiApiKey?: string;
  aiApiUrl?: string;
  aiModel?: string;
  aiProviders?: CoreAIProviderConfig[];
  aiModels?: CoreAIModelConfig[];
  modelRouteDefaults?: Partial<Record<CoreAIModelRoute, string>>;
};

const AI_SETTINGS_KEYS = new Set([
  'aiProvider',
  'aiApiProtocol',
  'aiApiKey',
  'aiApiUrl',
  'aiModel',
  'aiProviders',
  'aiModels',
  'modelRouteDefaults',
]);

export function hasAISettingsPayload(settings: Partial<Settings>): boolean {
  return Object.keys(settings).some((key) => AI_SETTINGS_KEYS.has(key));
}

export function stripAISettingsPayload(settings: Partial<Settings>): Partial<Settings> {
  return Object.fromEntries(
    Object.entries(settings).filter(([key]) => !AI_SETTINGS_KEYS.has(key)),
  ) as Partial<Settings>;
}

function buildLegacyAIModel(
  payload: DesktopAISettingsPayload,
): CoreAIModelConfig | null {
  if (
    !payload.aiProvider?.trim() ||
    !payload.aiApiProtocol ||
    !payload.aiApiKey?.trim() ||
    !payload.aiApiUrl?.trim() ||
    !payload.aiModel?.trim()
  ) {
    return null;
  }

  return {
    id: 'model_legacy_default',
    type: 'chat',
    provider: payload.aiProvider.trim(),
    apiProtocol: payload.aiApiProtocol,
    apiKey: payload.aiApiKey.trim(),
    apiUrl: payload.aiApiUrl.trim(),
    model: payload.aiModel.trim(),
    isDefault: true,
    capabilities: { chat: true },
  };
}

export function mergeAISettingsPayload(
  payload: DesktopAISettingsPayload,
  current: CoreAIConfigFile,
): Pick<CoreAIConfigFile, 'providers' | 'models' | 'modelRouteDefaults'> {
  const providers = Array.isArray(payload.aiProviders)
    ? payload.aiProviders
    : current.providers;
  const models = Array.isArray(payload.aiModels)
    ? payload.aiModels
    : current.models;
  const legacyModel = buildLegacyAIModel(payload);

  return {
    providers,
    models: models.length > 0 || !legacyModel ? models : [legacyModel],
    modelRouteDefaults:
      payload.modelRouteDefaults && typeof payload.modelRouteDefaults === 'object'
        ? payload.modelRouteDefaults
        : current.modelRouteDefaults,
  };
}

function persistSharedAIConfig(newSettings: Partial<Settings>): void {
  if (!hasAISettingsPayload(newSettings)) {
    return;
  }

  const current = coreAIConfigService.read();
  const next = mergeAISettingsPayload(newSettings as DesktopAISettingsPayload, current);
  coreAIConfigService.replace(next);
}

/**
 * Register settings-related IPC handlers
 */
export function registerSettingsIPC(db: Database.Database): void {
  // Get settings
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async () => {
    const settings: Settings = { ...DEFAULT_SETTINGS };

    const stmt = db.prepare('SELECT key, value FROM settings');
    const rows = stmt.all() as { key: string; value: string }[];

    for (const row of rows) {
      try {
        (settings as any)[row.key] = JSON.parse(row.value);
      } catch {
        (settings as any)[row.key] = row.value;
      }
    }

    if (
      (!Array.isArray(settings.customAgents) || settings.customAgents.length === 0) &&
      (!Array.isArray(settings.customAgentRootPaths) ||
        settings.customAgentRootPaths.length === 0) &&
      Array.isArray((settings as Settings & { customSkillScanPaths?: string[] }).customSkillScanPaths) &&
      (settings as Settings & { customSkillScanPaths?: string[] }).customSkillScanPaths!.length > 0
    ) {
      settings.customAgentRootPaths = [
        ...new Set(
          (settings as Settings & { customSkillScanPaths?: string[] }).customSkillScanPaths!
            .filter((entry): entry is string => typeof entry === 'string')
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0),
        ),
      ];
    }

    if (
      (!Array.isArray(settings.customAgents) || settings.customAgents.length === 0) &&
      Array.isArray(settings.customAgentRootPaths) &&
      settings.customAgentRootPaths.length > 0
    ) {
      settings.customAgents = settings.customAgentRootPaths.map((rootPath, index) => ({
        id: `migrated_agent_${index}`,
        name: `Custom Agent ${index + 1}`,
        rootPath,
      }));
    }

    if (
      (!settings.builtinAgentOverrides ||
        Object.keys(settings.builtinAgentOverrides).length === 0) &&
      settings.customPlatformRootPaths &&
      Object.keys(settings.customPlatformRootPaths).length > 0
    ) {
      settings.builtinAgentOverrides = Object.fromEntries(
        Object.entries(settings.customPlatformRootPaths).map(([platformId, rootPath]) => [
          platformId,
          { rootPath },
        ]),
      );
    }

    if (
      (!settings.customPlatformRootPaths ||
        Object.keys(settings.customPlatformRootPaths).length === 0) &&
      settings.customSkillPlatformPaths &&
      Object.keys(settings.customSkillPlatformPaths).length > 0
    ) {
      settings.customPlatformRootPaths = Object.fromEntries(
        Object.entries(settings.customSkillPlatformPaths).map(
          ([platformId, skillPath]) => {
            const platform = getPlatformById(platformId);
            if (!platform) {
              return [platformId, skillPath];
            }
            return [
              platformId,
              normalizeLegacySkillPathToRootTemplate(platform, skillPath),
            ];
          },
        ),
      );
    }

    settings.customPlatformRootPaths = Object.fromEntries(
      Object.entries(settings.builtinAgentOverrides ?? {}).flatMap(([platformId, override]) =>
        typeof override?.rootPath === 'string' && override.rootPath.trim()
          ? [[platformId, override.rootPath.trim()] as const]
          : [],
      ),
    );

    const legacyDisabledPlatformIds = (settings as Settings & {
      trackedRulePlatformIds?: string[];
    }).trackedRulePlatformIds;
    if (
      (!Array.isArray(settings.disabledPlatformIds) ||
        settings.disabledPlatformIds.length === 0) &&
      Array.isArray(legacyDisabledPlatformIds)
    ) {
      settings.disabledPlatformIds = legacyDisabledPlatformIds;
    }

    migrateTraeCnPlatformState(settings);
    mergeSharedAIConfig(settings);
    await applyNetworkProxySettings(settings.networkProxy);

    return settings;
  });

  // Save settings
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, async (_event, newSettings: Partial<Settings>) => {
    persistSharedAIConfig(newSettings);
    const dbSettings = stripAISettingsPayload(newSettings);
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)
    `);

    const transaction = db.transaction(() => {
      for (const [key, value] of Object.entries(dbSettings)) {
        stmt.run(key, JSON.stringify(value));
      }
    });

    transaction();
    if (
      Object.prototype.hasOwnProperty.call(newSettings, 'builtinAgentOverrides') ||
      Object.prototype.hasOwnProperty.call(newSettings, 'customPlatformRootPaths') ||
      Object.prototype.hasOwnProperty.call(newSettings, 'customSkillPlatformPaths')
    ) {
      invalidateCustomPathsCache();
    }
    if (Object.prototype.hasOwnProperty.call(newSettings, 'networkProxy')) {
      await applyNetworkProxySettings(newSettings.networkProxy);
    }
    return true;
  });
}

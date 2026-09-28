import { ipcMain } from "electron";
import Database from "../database/sqlite";
import { coreAIConfigService } from "@prompthub/core";
import { AgentSettingsRepository } from "@prompthub/core/agent-management/agent-settings-repository";
import { getUserDataPath } from "@prompthub/core/runtime-paths";
import {
  AGENT_SETTING_KEYS,
  RETIRED_AGENT_SETTING_KEYS,
} from "@prompthub/core/agent-management/agent-settings-contract";
import { migrateAgentSettingsV1 } from "@prompthub/core/migrations/agent-settings-v1";
import { IPC_CHANNELS } from "@prompthub/shared/constants";
import type { CloseAction, Settings } from "@prompthub/shared/types";
import { DEFAULT_SETTINGS } from "@prompthub/shared/types";
import type {
  CoreAIConfigFile,
  CoreAIModelConfig,
  CoreAIModelRoute,
  CoreAIProviderConfig,
  MarketplaceSourceRecord,
  RendererPersistenceMigrationInput,
  RendererPersistenceMigrationResult,
  RendererPersistenceStore,
} from "@prompthub/core";
import {
  getMinimizeOnLaunchSetting,
  readGithubTokenSetting,
} from "../settings/settings-readers";
import { invalidateCustomPathsCache } from "../services/skill-installer-utils";
import { applyNetworkProxySettings } from "../services/network-proxy";

export {
  getMinimizeOnLaunchSetting,
  readGithubTokenSetting as getGithubTokenSetting,
} from "../settings/settings-readers";

function closeActionFromPatch(
  settings: Partial<Settings>,
): CloseAction | undefined {
  if (!Object.prototype.hasOwnProperty.call(settings, "closeAction"))
    return undefined;
  const action = settings.closeAction;
  if (action !== "ask" && action !== "minimize" && action !== "exit") {
    throw new Error("closeAction must be 'ask', 'minimize', or 'exit'");
  }
  return action;
}

async function persistCanonicalCloseAction(
  persistence: RendererPersistenceStore | undefined,
  settings: Partial<Settings>,
): Promise<Record<string, unknown> | undefined> {
  const closeAction = closeActionFromPatch(settings);
  if (!persistence || closeAction === undefined) return undefined;
  const current = persistence.readHydratedStateSync();
  if (!current.migrationComplete) return undefined;
  await persistence.replaceSettings({ ...current.settings, closeAction });
  return current.settings;
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
        aiConfig.models.find(
          (model) => model.type === "chat" && model.isDefault,
        ) ?? aiConfig.models.find((model) => model.type === "chat");
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
    console.warn("Failed to merge shared AI config:", error);
  }
}

type DesktopAISettingsPayload = Partial<Settings> & {
  aiProvider?: string;
  aiApiProtocol?: CoreAIProviderConfig["apiProtocol"];
  aiApiKey?: string;
  aiApiUrl?: string;
  aiModel?: string;
  aiProviders?: CoreAIProviderConfig[];
  aiModels?: CoreAIModelConfig[];
  modelRouteDefaults?: Partial<Record<CoreAIModelRoute, string>>;
};

const AI_SETTINGS_KEYS = new Set([
  "aiProvider",
  "aiApiProtocol",
  "aiApiKey",
  "aiApiUrl",
  "aiModel",
  "aiProviders",
  "aiModels",
  "modelRouteDefaults",
]);

const RENDERER_SECRET_SETTING_KEYS = new Set([
  ...AI_SETTINGS_KEYS,
  "sync",
  "webdavUsername",
  "webdavPassword",
  "webdavEncryptionPassword",
  "selfHostedSyncUsername",
  "selfHostedSyncPassword",
  "s3AccessKeyId",
  "s3SecretAccessKey",
  "s3EncryptionPassword",
  "githubToken",
  "networkProxy",
]);

export function hasAISettingsPayload(settings: Partial<Settings>): boolean {
  return Object.keys(settings).some((key) => AI_SETTINGS_KEYS.has(key));
}

export function stripAISettingsPayload(
  settings: Partial<Settings>,
): Partial<Settings> {
  return Object.fromEntries(
    Object.entries(settings).filter(([key]) => !AI_SETTINGS_KEYS.has(key)),
  ) as Partial<Settings>;
}

function stripRendererSecretSettingsPayload(
  settings: Partial<Settings>,
): Partial<Settings> {
  return Object.fromEntries(
    Object.entries(settings).filter(
      ([key]) => !RENDERER_SECRET_SETTING_KEYS.has(key),
    ),
  ) as Partial<Settings>;
}

function scrubRendererSecretSettingsRows(db: Database.Database): void {
  const statement = db.prepare("DELETE FROM settings WHERE key = ?");
  db.transaction(() => {
    for (const key of RENDERER_SECRET_SETTING_KEYS) statement.run(key);
  })();
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
    id: "model_legacy_default",
    type: "chat",
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
): Pick<CoreAIConfigFile, "providers" | "models" | "modelRouteDefaults"> {
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
      payload.modelRouteDefaults &&
      typeof payload.modelRouteDefaults === "object"
        ? payload.modelRouteDefaults
        : current.modelRouteDefaults,
  };
}

function persistSharedAIConfig(newSettings: Partial<Settings>): void {
  if (!hasAISettingsPayload(newSettings)) {
    return;
  }

  const current = coreAIConfigService.read();
  const next = mergeAISettingsPayload(
    newSettings as DesktopAISettingsPayload,
    current,
  );
  coreAIConfigService.replace(next);
}

/**
 * Register settings-related IPC handlers
 */
export function registerSettingsIPC(
  db: Database.Database,
  options: {
    rendererPersistence?: RendererPersistenceStore;
    onRendererPersistenceMigration?: (
      result: RendererPersistenceMigrationResult,
    ) => void;
  } = {},
): void {
  // Get settings
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async () => {
    const settings: Settings = { ...DEFAULT_SETTINGS };

    const stmt = db.prepare("SELECT key, value FROM settings");
    const rows = stmt.all() as { key: string; value: string }[];

    for (const row of rows) {
      try {
        (settings as any)[row.key] = JSON.parse(row.value);
      } catch {
        (settings as any)[row.key] = row.value;
      }
    }

    mergeSharedAIConfig(settings);
    if (options.rendererPersistence) {
      const canonical = await options.rendererPersistence.readHydratedState();
      if (canonical.migrationComplete) {
        Object.assign(settings, canonical.settings);
      }
    }
    for (const key of RETIRED_AGENT_SETTING_KEYS)
      delete (settings as unknown as Record<string, unknown>)[key];
    Object.assign(settings, new AgentSettingsRepository(db).read());
    await applyNetworkProxySettings(settings.networkProxy);

    return settings;
  });

  // Save settings
  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SET,
    async (_event, newSettings: Partial<Settings>) => {
      for (const key of RETIRED_AGENT_SETTING_KEYS) {
        if (Object.prototype.hasOwnProperty.call(newSettings, key))
          throw new Error(
            `Retired Agent setting requires data migration: ${key}`,
          );
      }
      const agentPatch = Object.fromEntries(
        AGENT_SETTING_KEYS.filter((key) =>
          Object.prototype.hasOwnProperty.call(newSettings, key),
        ).map((key) => [key, newSettings[key]]),
      );
      const previousCanonicalSettings = await persistCanonicalCloseAction(
        options.rendererPersistence,
        newSettings,
      );
      if (!options.rendererPersistence) persistSharedAIConfig(newSettings);
      const dbSettings = options.rendererPersistence
        ? stripRendererSecretSettingsPayload(newSettings)
        : stripAISettingsPayload(newSettings);
      const stmt = db.prepare(`
      INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)
    `);

      const transaction = db.transaction(() => {
        if (Object.keys(agentPatch).length > 0)
          new AgentSettingsRepository(db).patch(agentPatch);
        for (const [key, value] of Object.entries(dbSettings)) {
          if (AGENT_SETTING_KEYS.some((agentKey) => agentKey === key)) continue;
          stmt.run(key, JSON.stringify(value));
        }
      });

      try {
        transaction();
      } catch (error) {
        if (previousCanonicalSettings && options.rendererPersistence) {
          await options.rendererPersistence.replaceSettings(
            previousCanonicalSettings,
          );
        }
        throw error;
      }
      if (
        Object.prototype.hasOwnProperty.call(
          newSettings,
          "builtinAgentOverrides",
        )
      ) {
        invalidateCustomPathsCache();
      }
      if (Object.prototype.hasOwnProperty.call(newSettings, "networkProxy")) {
        await applyNetworkProxySettings(newSettings.networkProxy);
      }
      return true;
    },
  );

  if (!options.rendererPersistence) return;
  const persistence = options.rendererPersistence;
  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_MIGRATE,
    async (_event, input: RendererPersistenceMigrationInput) => {
      const result = await persistence.migrate({
        ...(input ?? {}),
        legacyAIConfig: input?.legacyAIConfig ?? coreAIConfigService.read(),
      });
      migrateAgentSettingsV1(db, getUserDataPath());
      scrubRendererSecretSettingsRows(db);
      options.onRendererPersistenceMigration?.(result);
      return result;
    },
  );
  ipcMain.handle(IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_GET, async () => {
    const state = await persistence.readHydratedState();
    return {
      ...state,
      settings: {
        ...state.settings,
        ...new AgentSettingsRepository(db).read(),
      },
    };
  });
  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_REPLACE_SETTINGS,
    async (_event, settings: Record<string, unknown>) => {
      await persistence.replaceSettings(settings ?? {});
      return true;
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_REPLACE_SOURCES,
    async (
      _event,
      domain: "skill" | "mcp" | "plugin",
      sources: MarketplaceSourceRecord[],
    ) => {
      if (domain !== "skill" && domain !== "mcp" && domain !== "plugin") {
        throw new Error("Invalid marketplace source domain");
      }
      await persistence.replaceMarketplaceSources(
        domain,
        Array.isArray(sources) ? sources : [],
      );
      return true;
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_REPLACE_RECOVERY_PATHS,
    async (_event, paths: string[]) => {
      await persistence.replaceRecoveryPaths(Array.isArray(paths) ? paths : []);
      return true;
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_DEVICE_ID,
    async () => persistence.getOrCreateSelfHostedDeviceId(),
  );
  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_IDB_STATUS,
    async () => persistence.isIndexedDbMigrationDone(),
  );
  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_IDB_DONE,
    async () => {
      await persistence.markIndexedDbMigrationDone();
      return true;
    },
  );
}

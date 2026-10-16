import { RENDERER_AUXILIARY_SETTING_KEYS } from "@prompthub/core/renderer-auxiliary-state";
import { ipcMain, safeStorage } from "electron";
import Database from "../database/sqlite";
import { createRendererPersistenceStore } from "@prompthub/core";
import { AgentSettingsRepository } from "@prompthub/core/agent-management/agent-settings-repository";
import { getUserDataPath } from "@prompthub/core/runtime-paths";
import { RETIRED_AGENT_SETTING_KEYS } from "@prompthub/core/agent-management/agent-settings-contract";
import { IPC_CHANNELS } from "@prompthub/shared/constants";
import type { CloseAction, Settings } from "@prompthub/shared/types";
import {
  DEFAULT_SETTINGS,
  STARTUP_FOLDER_MODES,
} from "@prompthub/shared/types";
import type {
  MarketplaceSourceRecord,
  RendererPersistenceMigrationInput,
  RendererPersistenceMigrationResult,
  RendererPersistenceStore,
} from "@prompthub/core";
import { invalidateCustomPathsCache } from "../services/skill-installer-utils";
import { applyNetworkProxySettings } from "../services/network-proxy";

export {
  getMinimizeOnLaunchSetting,
  readGithubTokenSetting as getGithubTokenSetting,
} from "../settings/settings-readers";

function validateStartupPreferences(settings: Partial<Settings>): void {
  if (
    "startupFolderMode" in settings &&
    !STARTUP_FOLDER_MODES.some((mode) => mode === settings.startupFolderMode)
  )
    throw new Error("Invalid startup folder mode");
  for (const key of ["pinnedStartFolderId", "lastActiveFolderId"] as const) {
    if (!(key in settings)) continue;
    const value = settings[key];
    if (
      value !== null &&
      (typeof value !== "string" || !value.trim() || value.includes("\0"))
    )
      throw new Error(`Invalid startup folder id: ${key}`);
  }
  if (
    "backupGuideCollapsed" in settings &&
    typeof settings.backupGuideCollapsed !== "boolean"
  )
    throw new Error("Invalid backup guidance preference");
}

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

/**
 * Register settings-related IPC handlers
 */
export function registerSettingsIPC(
  db: Database.Database,
  options: {
    rendererPersistence?: RendererPersistenceStore;
    onRendererPersistenceMigration?: (
      result: RendererPersistenceMigrationResult,
    ) => void | Promise<void>;
  } = {},
): void {
  const persistence =
    options.rendererPersistence ??
    createRendererPersistenceStore({
      database: db,
      rootPath: getUserDataPath(),
      encryption: safeStorage,
    });
  // Get settings
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async () => {
    const current = await persistence.readHydratedState();
    const settings = {
      ...DEFAULT_SETTINGS,
      ...current.settings,
      ...new AgentSettingsRepository(db).read(),
    };
    for (const key of RETIRED_AGENT_SETTING_KEYS) delete settings[key];
    await applyNetworkProxySettings(settings.networkProxy);

    return settings;
  });

  // Save settings
  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SET,
    async (_event, newSettings: Partial<Settings>) => {
      validateStartupPreferences(newSettings);
      for (const key of RENDERER_AUXILIARY_SETTING_KEYS) {
        if (Object.prototype.hasOwnProperty.call(newSettings, key))
          throw new Error(
            `Setting requires its renderer persistence endpoint: ${key}`,
          );
      }
      for (const key of RETIRED_AGENT_SETTING_KEYS) {
        if (Object.prototype.hasOwnProperty.call(newSettings, key))
          throw new Error(
            `Retired Agent setting requires data migration: ${key}`,
          );
      }
      closeActionFromPatch(newSettings);
      await persistence.patchSettings({ ...newSettings });
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

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_MIGRATE,
    async (_event, input: RendererPersistenceMigrationInput) => {
      const result = await persistence.migrate(input ?? {});
      await options.onRendererPersistenceMigration?.(result);
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
      if (
        !settings ||
        typeof settings !== "object" ||
        Array.isArray(settings)
      ) {
        throw new Error(
          "Invalid renderer settings replacement: expected an object",
        );
      }
      await persistence.replaceSettings(settings);
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
      if (!Array.isArray(sources)) {
        throw new Error(
          "Invalid marketplace source replacement: expected an array",
        );
      }
      await persistence.replaceMarketplaceSources(domain, sources);
      return true;
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_REPLACE_RECOVERY_PATHS,
    async (_event, paths: string[]) => {
      if (!Array.isArray(paths)) {
        throw new Error("Invalid recovery path replacement: expected an array");
      }
      await persistence.replaceRecoveryPaths(paths);
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

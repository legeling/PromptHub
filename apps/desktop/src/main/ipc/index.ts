import fs from "node:fs/promises";
import path from "node:path";
import { app, clipboard, dialog, ipcMain, safeStorage, shell } from "electron";
import Database from "../database/sqlite";
import { registerPromptIPC } from "./prompt.ipc";
import { registerFolderIPC } from "./folder.ipc";
import { registerSettingsIPC } from "./settings.ipc";
import { registerImageIPC } from "./image.ipc";
import { registerRulesIPC } from "./rules.ipc";
import { registerSkillIPC } from "./skill.ipc";
import { registerAIIPC } from "./ai.ipc";
import { registerAgentIPC } from "./agent.ipc";
import { registerAgentQwenDefinitionIPC } from "./agent-qwen-definition.ipc";
import { registerAgentDeepSeekHarnessIPC } from "./agent-deepseek-harness.ipc";
import { registerAgentSessionIndexIPC } from "./agent-session-index.ipc";
import { registerAgentConversationIPC } from "./agent-conversation.ipc";
import { createAgentSessionIndexOperations } from "../services/agent-session-index-operations";
import { AgentConversationService } from "../services/agent-conversation-service";
import { createAgentTerminalLauncher } from "../services/agent-terminal-launcher";
import { createNativeCommandRunner } from "../services/native-command";
import { registerAgentProviderProfileIPC } from "./agent-provider-profile.ipc";
import { registerAgentCodexAccountIPC } from "./agent-codex-account.ipc";
import { registerAgentProviderSourceIPC } from "./agent-provider-source.ipc";
import { registerAgentManagementBackupIPC } from "./agent-management-backup.ipc";
import { registerAgentProviderActivationIPC } from "./agent-provider-activation.ipc";
import { registerAgentProviderCurrentStateIPC } from "./agent-provider-current-state.ipc";
import { registerAgentProviderMigrationIPC } from "./agent-provider-migration.ipc";
import { registerAgentAppearanceIPC } from "./agent-appearance.ipc";
import { createAgentCodexProviderMigrationService } from "../services/agent-codex-provider-migration-service";
import {
  getAgentConfigContext,
  resolveAgentProviderContext,
} from "../services/agent-platform-context";
import { importPiCustomProvider } from "../services/agent-pi-model-writes";
import {
  createAgentProviderRuntime,
  type AgentProviderRuntime,
} from "../services/agent-provider-runtime";
import { PromptDB } from "../database/prompt";
import { FolderDB } from "../database/folder";
import { SkillDB } from "../database/skill";
import { registerSecurityIPC } from "./security.ipc";
import { registerBackupIPC } from "./backup.ipc";
import { registerCliIPC } from "./cli.ipc";
import { registerMcpIPC } from "./mcp.ipc";
import { registerPluginIPC } from "./plugin.ipc";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import { registerCloudIPC } from "./cloud.ipc";
import { registerGenerationIPC } from "./generation.ipc";
import { SkillInstaller } from "../services/skill-installer";
import { launchAgentPlatform } from "../services/agent-launch-service";
import { createAgentProviderSourceService } from "../services/agent-provider-source-service";
import { createAgentProviderOfficialProfileService } from "../services/agent-provider-official-profile-service";
import {
  coreAIConfigService,
  createRendererPersistenceStore,
  type RendererPersistenceMigrationResult,
} from "@prompthub/core";
import { getUserDataPath } from "../runtime-paths";

const REBINDABLE_DB_CHANNELS = [
  IPC_CHANNELS.PROMPT_TEST_HISTORY_ADD,
  IPC_CHANNELS.PROMPT_TEST_HISTORY_LIST,
  IPC_CHANNELS.PROMPT_TEST_HISTORY_GET,
  IPC_CHANNELS.PROMPT_TEST_HISTORY_DELETE,
  IPC_CHANNELS.PROMPT_CREATE,
  IPC_CHANNELS.PROMPT_GET,
  IPC_CHANNELS.PROMPT_GET_ALL,
  IPC_CHANNELS.PROMPT_GET_ALL_META,
  IPC_CHANNELS.PROMPT_GET_ALL_TAGS,
  IPC_CHANNELS.PROMPT_RENAME_TAG,
  IPC_CHANNELS.PROMPT_DELETE_TAG,
  IPC_CHANNELS.PROMPT_UPDATE,
  IPC_CHANNELS.PROMPT_DELETE,
  IPC_CHANNELS.PROMPT_SEARCH,
  IPC_CHANNELS.PROMPT_COPY,
  IPC_CHANNELS.PROMPT_INSERT_DIRECT,
  IPC_CHANNELS.PROMPT_SYNC_WORKSPACE,
  IPC_CHANNELS.PROMPT_MIGRATE_IDB_BATCH,
  IPC_CHANNELS.PROMPT_MOVE,
  IPC_CHANNELS.PROMPT_RELATION_CREATE,
  IPC_CHANNELS.PROMPT_RELATION_INSERT_DIRECT,
  IPC_CHANNELS.PROMPT_RELATION_LIST,
  IPC_CHANNELS.PROMPT_RELATION_UPDATE,
  IPC_CHANNELS.PROMPT_RELATION_DELETE,
  IPC_CHANNELS.PROMPT_RESTORE_GRAPH,
  IPC_CHANNELS.PROMPT_OUTPUT_FORMAT_CREATE,
  IPC_CHANNELS.PROMPT_OUTPUT_FORMAT_INSERT_DIRECT,
  IPC_CHANNELS.PROMPT_OUTPUT_FORMAT_LIST,
  IPC_CHANNELS.PROMPT_OUTPUT_FORMAT_UPDATE,
  IPC_CHANNELS.PROMPT_OUTPUT_FORMAT_DELETE,
  IPC_CHANNELS.PROMPT_OUTPUT_FORMAT_REORDER,
  IPC_CHANNELS.VERSION_GET_ALL,
  IPC_CHANNELS.VERSION_CREATE,
  IPC_CHANNELS.VERSION_ROLLBACK,
  IPC_CHANNELS.VERSION_DELETE,
  IPC_CHANNELS.VERSION_INSERT_DIRECT,
  IPC_CHANNELS.FOLDER_CREATE,
  IPC_CHANNELS.FOLDER_GET_ALL,
  IPC_CHANNELS.FOLDER_UPDATE,
  IPC_CHANNELS.FOLDER_DELETE,
  IPC_CHANNELS.FOLDER_REORDER,
  IPC_CHANNELS.FOLDER_INSERT_DIRECT,
  IPC_CHANNELS.SETTINGS_GET,
  IPC_CHANNELS.SETTINGS_SET,
  IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_MIGRATE,
  IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_GET,
  IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_REPLACE_SETTINGS,
  IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_REPLACE_SOURCES,
  IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_REPLACE_RECOVERY_PATHS,
  IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_DEVICE_ID,
  IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_IDB_STATUS,
  IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_IDB_DONE,
  IPC_CHANNELS.CLOUD_AUTH_GET_STATE,
  IPC_CHANNELS.CLOUD_AUTH_LOGIN,
  IPC_CHANNELS.CLOUD_AUTH_LOGOUT,
  IPC_CHANNELS.CLOUD_ACCOUNT_OVERVIEW,
  IPC_CHANNELS.CLOUD_ACCOUNT_PROFILE,
  IPC_CHANNELS.CLOUD_ACCOUNT_PASSWORD,
  IPC_CHANNELS.CLOUD_ACCOUNT_VERIFY_EMAIL,
  IPC_CHANNELS.CLOUD_ACCOUNT_SESSIONS,
  IPC_CHANNELS.CLOUD_ACCOUNT_REVOKE_SESSION,
  IPC_CHANNELS.CLOUD_ACCOUNT_REVOKE_OTHERS,
  IPC_CHANNELS.CLOUD_ACCOUNT_EXPORT,
  IPC_CHANNELS.CLOUD_ACCOUNT_EXPORT_DOWNLOAD,
  IPC_CHANNELS.CLOUD_ACCOUNT_DELETE,
  IPC_CHANNELS.CLOUD_ACCOUNT_CANCEL_DELETE,
  IPC_CHANNELS.CLOUD_ACCOUNT_ENTITLEMENTS,
  IPC_CHANNELS.CLOUD_STORE_FEED,
  IPC_CHANNELS.CLOUD_STORE_LISTING,
  IPC_CHANNELS.CLOUD_STORE_PACKAGE,
  IPC_CHANNELS.CLOUD_STORE_INSTALL_INTENT,
  IPC_CHANNELS.CLOUD_STORE_INSTALL_STATUS,
  IPC_CHANNELS.CLOUD_STORE_INSTALLATIONS,
  IPC_CHANNELS.CLOUD_STORE_LIKE,
  IPC_CHANNELS.CLOUD_STORE_UNLIKE,
  IPC_CHANNELS.CLOUD_STORE_FAVORITE,
  IPC_CHANNELS.CLOUD_STORE_UNFAVORITE,
  IPC_CHANNELS.CLOUD_STORE_REPORT,
  IPC_CHANNELS.CLI_STATUS,
  IPC_CHANNELS.CLI_INSTALL,
  IPC_CHANNELS.RULES_LIST,
  IPC_CHANNELS.RULES_SCAN,
  IPC_CHANNELS.RULES_READ,
  IPC_CHANNELS.RULES_SAVE,
  IPC_CHANNELS.RULES_REWRITE,
  IPC_CHANNELS.RULES_ADD_PROJECT,
  IPC_CHANNELS.RULES_REMOVE_PROJECT,
  IPC_CHANNELS.RULES_IMPORT_RECORDS,
  IPC_CHANNELS.SECURITY_SET_MASTER_PASSWORD,
  IPC_CHANNELS.SECURITY_CHANGE_MASTER_PASSWORD,
  IPC_CHANNELS.SECURITY_UNLOCK,
  IPC_CHANNELS.SECURITY_STATUS,
  IPC_CHANNELS.SECURITY_LOCK,
  IPC_CHANNELS.SKILL_CREATE,
  IPC_CHANNELS.SKILL_GET,
  IPC_CHANNELS.SKILL_GET_ALL,
  IPC_CHANNELS.SKILL_UPDATE,
  IPC_CHANNELS.SKILL_DELETE,
  IPC_CHANNELS.SKILL_SEARCH,
  IPC_CHANNELS.SKILL_EXPORT,
  IPC_CHANNELS.SKILL_IMPORT,
  IPC_CHANNELS.SKILL_SCAN_LOCAL,
  IPC_CHANNELS.SKILL_SCAN_LOCAL_PREVIEW,
  IPC_CHANNELS.SKILL_SCAN_SAFETY,
  IPC_CHANNELS.SKILL_SAVE_SAFETY_REPORT,
  IPC_CHANNELS.SKILL_INSTALL_TO_PLATFORM,
  IPC_CHANNELS.SKILL_UNINSTALL_FROM_PLATFORM,
  IPC_CHANNELS.SKILL_GET_PLATFORM_STATUS,
  IPC_CHANNELS.SKILL_GET_SUPPORTED_PLATFORMS,
  IPC_CHANNELS.SKILL_DETECT_PLATFORMS,
  IPC_CHANNELS.SKILL_INSTALL_MD,
  IPC_CHANNELS.SKILL_UNINSTALL_MD,
  IPC_CHANNELS.SKILL_GET_MD_INSTALL_STATUS,
  IPC_CHANNELS.SKILL_GET_MD_INSTALL_STATUS_BATCH,
  IPC_CHANNELS.SKILL_GET_MD_INSTALL_STATUS_DETAILS,
  IPC_CHANNELS.SKILL_INSTALL_MD_SYMLINK,
  IPC_CHANNELS.SKILL_FETCH_REMOTE_CONTENT,
  IPC_CHANNELS.SKILL_FETCH_REMOTE_CONTENT_BYTES,
  IPC_CHANNELS.AGENT_CONFIG_FILES_LIST,
  IPC_CHANNELS.AGENT_CONFIG_FILE_READ,
  IPC_CHANNELS.AGENT_CONFIG_FILE_WRITE,
  IPC_CHANNELS.AGENT_DEFINITIONS_LIST,
  IPC_CHANNELS.AGENT_DEFINITION_OPEN,
  IPC_CHANNELS.AGENT_HARNESS_PROFILES_LIST,
  IPC_CHANNELS.AGENT_HARNESS_PROFILE_READ,
  IPC_CHANNELS.AGENT_HARNESS_PLUGIN_MUTATE,
  IPC_CHANNELS.AGENT_SESSIONS_LIST,
  IPC_CHANNELS.AGENT_SESSION_READ,
  IPC_CHANNELS.AGENT_SESSION_INDEX_GET_STATE,
  IPC_CHANNELS.AGENT_SESSION_INDEX_SET_ENABLED,
  IPC_CHANNELS.AGENT_SESSION_INDEX_REFRESH,
  IPC_CHANNELS.AGENT_SESSION_INDEX_CANCEL,
  IPC_CHANNELS.AGENT_CONVERSATION_METADATA_LIST,
  IPC_CHANNELS.AGENT_CONVERSATION_METADATA_UPDATE,
  IPC_CHANNELS.AGENT_CONVERSATION_DELETE,
  IPC_CHANNELS.AGENT_CONVERSATION_RESUME,
  IPC_CHANNELS.AGENT_CONVERSATION_HANDOFF_PREVIEW,
  IPC_CHANNELS.AGENT_CONVERSATION_HANDOFF_CONTINUE,
  IPC_CHANNELS.AGENT_CONVERSATION_EXPORT,
  IPC_CHANNELS.AGENT_PROVIDER_PROFILES_LIST,
  IPC_CHANNELS.AGENT_PROVIDER_PROFILES_CREATE,
  IPC_CHANNELS.AGENT_PROVIDER_PROFILES_UPDATE,
  IPC_CHANNELS.AGENT_PROVIDER_PROFILES_ARCHIVE,
  IPC_CHANNELS.AGENT_PROVIDER_PROFILES_DUPLICATE,
  IPC_CHANNELS.AGENT_PROVIDER_PROFILES_EXPORT,
  IPC_CHANNELS.AGENT_PROVIDER_PROFILES_DELETE,
  IPC_CHANNELS.AGENT_PROVIDER_SOURCES_LIST,
  IPC_CHANNELS.AGENT_PROVIDER_SOURCE_IMPORT,
  IPC_CHANNELS.AGENT_PI_PROVIDER_SOURCE_IMPORT,
  IPC_CHANNELS.AGENT_PROVIDER_OFFICIAL_ENSURE,
  IPC_CHANNELS.AGENT_PROVIDER_MIGRATION_PREVIEW,
  IPC_CHANNELS.AGENT_PROVIDER_MIGRATION_APPLY,
  IPC_CHANNELS.AGENT_PROVIDER_IMPORT_CURRENT,
  IPC_CHANNELS.AGENT_PROVIDER_TEST_CURRENT_CONNECTION,
  IPC_CHANNELS.AGENT_PROVIDER_TEST_CURRENT_MODEL,
  IPC_CHANNELS.AGENT_PROVIDER_TEST_CONNECTION,
  IPC_CHANNELS.AGENT_PROVIDER_TEST_MODEL,
  IPC_CHANNELS.AGENT_PROVIDER_CANCEL_MODEL_TEST,
  IPC_CHANNELS.AGENT_PROVIDER_PREVIEW,
  IPC_CHANNELS.AGENT_PROVIDER_ACTIVATE,
  IPC_CHANNELS.AGENT_PROVIDER_CURRENT_STATE,
  IPC_CHANNELS.AGENT_CODEX_ACCOUNTS_LIST,
  IPC_CHANNELS.AGENT_CODEX_ACCOUNT_SAVE_CURRENT,
  IPC_CHANNELS.AGENT_CODEX_ACCOUNT_IMPORT,
  IPC_CHANNELS.AGENT_CODEX_ACCOUNT_ACTIVATE,
  IPC_CHANNELS.AGENT_CODEX_ACCOUNT_DELETE,
  IPC_CHANNELS.AGENT_APPEARANCE_GET,
  IPC_CHANNELS.AGENT_APPEARANCE_IMPORT_THEME,
  IPC_CHANNELS.AGENT_APPEARANCE_APPLY_THEME,
  IPC_CHANNELS.AGENT_APPEARANCE_RESTORE_THEME,
  IPC_CHANNELS.AGENT_APPEARANCE_DELETE_THEME,
  IPC_CHANNELS.AGENT_APPEARANCE_EXPORT_THEME,
  IPC_CHANNELS.AGENT_APPEARANCE_THEME_PREVIEW,
  IPC_CHANNELS.AGENT_APPEARANCE_IMPORT_PET,
  IPC_CHANNELS.AGENT_APPEARANCE_EXPORT_PET,
  IPC_CHANNELS.AGENT_APPEARANCE_DELETE_PET,
  IPC_CHANNELS.AGENT_APPEARANCE_PET_PREVIEW,
  IPC_CHANNELS.SKILL_LIST_LOCAL_FILES,
  IPC_CHANNELS.SKILL_LIST_LOCAL_FILES_BY_PATH,
  IPC_CHANNELS.SKILL_READ_LOCAL_FILE,
  IPC_CHANNELS.SKILL_READ_LOCAL_FILE_BY_PATH,
  IPC_CHANNELS.SKILL_READ_LOCAL_FILES,
  IPC_CHANNELS.SKILL_RENAME_LOCAL_PATH,
  IPC_CHANNELS.SKILL_RENAME_LOCAL_PATH_BY_PATH,
  IPC_CHANNELS.SKILL_WRITE_LOCAL_FILE,
  IPC_CHANNELS.SKILL_WRITE_LOCAL_FILE_BY_PATH,
  IPC_CHANNELS.SKILL_WRITE_LOCAL_FILE_BUFFER_BY_PATH,
  IPC_CHANNELS.SKILL_DELETE_LOCAL_FILE,
  IPC_CHANNELS.SKILL_DELETE_LOCAL_FILE_BY_PATH,
  IPC_CHANNELS.SKILL_GET_LOCAL_PATH_STATUS,
  IPC_CHANNELS.SKILL_CREATE_LOCAL_DIR,
  IPC_CHANNELS.SKILL_CREATE_LOCAL_DIR_BY_PATH,
  IPC_CHANNELS.SKILL_SAVE_TO_REPO,
  IPC_CHANNELS.SKILL_GET_REPO_PATH,
  IPC_CHANNELS.SKILL_SYNC_FROM_REPO,
  IPC_CHANNELS.SKILL_EXPORT_ZIP,
  IPC_CHANNELS.SKILL_VERSION_GET_ALL,
  IPC_CHANNELS.SKILL_VERSION_CREATE,
  IPC_CHANNELS.SKILL_VERSION_ROLLBACK,
  IPC_CHANNELS.SKILL_VERSION_DELETE,
  IPC_CHANNELS.SKILL_DELETE_ALL,
  IPC_CHANNELS.SKILL_INSERT_VERSION_DIRECT,
  IPC_CHANNELS.MCP_LIBRARY_GET,
  IPC_CHANNELS.MCP_LIBRARY_REPLACE,
  IPC_CHANNELS.MCP_LIBRARY_EXPORT_FILES,
  IPC_CHANNELS.MCP_LIBRARY_RESTORE_FILES,
  IPC_CHANNELS.MCP_MARKET_LIST,
  IPC_CHANNELS.MCP_MARKET_SOURCES,
  IPC_CHANNELS.MCP_MARKET_INSTALL_TEMPLATE,
  IPC_CHANNELS.MCP_FETCH_REMOTE_CONTENT,
  IPC_CHANNELS.MCP_TARGET_PRESETS,
  IPC_CHANNELS.MCP_SERVER_CREATE,
  IPC_CHANNELS.MCP_SERVER_CREATE_FROM_SOURCE,
  IPC_CHANNELS.MCP_SERVER_UPDATE,
  IPC_CHANNELS.MCP_SERVER_DELETE,
  IPC_CHANNELS.MCP_TEMPLATE_INSTALL,
  IPC_CHANNELS.MCP_PREVIEW,
  IPC_CHANNELS.MCP_APPLY,
  IPC_CHANNELS.MCP_REMOVE,
  IPC_CHANNELS.MCP_TARGET_STATUS,
  IPC_CHANNELS.MCP_IMPORT_FILE,
  IPC_CHANNELS.MCP_HEALTH_CHECK,
  IPC_CHANNELS.MCP_HEALTH_CHECK_ALL,
  IPC_CHANNELS.MCP_ENV_IMPORT,
  IPC_CHANNELS.PLUGIN_LIBRARY_GET,
  IPC_CHANNELS.PLUGIN_LIBRARY_EXPORT_SNAPSHOT,
  IPC_CHANNELS.PLUGIN_LIBRARY_RESTORE_SNAPSHOT,
  IPC_CHANNELS.PLUGIN_LIBRARY_EXPORT_FILES,
  IPC_CHANNELS.PLUGIN_LIBRARY_RESTORE_FILES,
  IPC_CHANNELS.PLUGIN_MARKET_LIST,
  IPC_CHANNELS.PLUGIN_MARKET_SOURCES,
  IPC_CHANNELS.PLUGIN_MARKET_PREVIEW,
  IPC_CHANNELS.PLUGIN_MARKET_INSTALL,
  IPC_CHANNELS.PLUGIN_IMPORT_LOCAL,
  IPC_CHANNELS.PLUGIN_DELETE,
  IPC_CHANNELS.PLUGIN_DISTRIBUTE,
  IPC_CHANNELS.PLUGIN_TARGET_MATRIX,
  IPC_CHANNELS.UPGRADE_BACKUP_LIST,
  IPC_CHANNELS.UPGRADE_BACKUP_CREATE,
  IPC_CHANNELS.UPGRADE_BACKUP_RESTORE,
  IPC_CHANNELS.UPGRADE_BACKUP_DELETE,
  IPC_CHANNELS.GENERATION_LIST,
  IPC_CHANNELS.GENERATION_GET,
  IPC_CHANNELS.GENERATION_CREATE,
  IPC_CHANNELS.GENERATION_SLOT_RUNNING,
  IPC_CHANNELS.GENERATION_COMMIT_OUTPUT,
  IPC_CHANNELS.GENERATION_FAIL_SLOT,
  IPC_CHANNELS.GENERATION_CANCEL,
  IPC_CHANNELS.GENERATION_SET_FAVORITE,
  IPC_CHANNELS.GENERATION_RETRY_FAILED,
  IPC_CHANNELS.GENERATION_COPY_TO_PROMPT_MEDIA,
  IPC_CHANNELS.GENERATION_READ_OUTPUT_REFERENCE,
  // registerAllIPC re-registers these non-database groups as well, so their
  // handlers must be removed during the same recovery rebind.
  IPC_CHANNELS.DIALOG_SELECT_IMAGE,
  IPC_CHANNELS.IMAGE_SAVE,
  IPC_CHANNELS.IMAGE_OPEN,
  IPC_CHANNELS.IMAGE_SAVE_BUFFER,
  IPC_CHANNELS.IMAGE_DOWNLOAD,
  IPC_CHANNELS.IMAGE_LIST,
  IPC_CHANNELS.IMAGE_GET_SIZE,
  IPC_CHANNELS.IMAGE_READ_BASE64,
  IPC_CHANNELS.IMAGE_SAVE_BASE64,
  IPC_CHANNELS.IMAGE_EXISTS,
  IPC_CHANNELS.IMAGE_CLEAR,
  IPC_CHANNELS.DIALOG_SELECT_VIDEO,
  IPC_CHANNELS.VIDEO_SAVE,
  IPC_CHANNELS.VIDEO_OPEN,
  IPC_CHANNELS.VIDEO_LIST,
  IPC_CHANNELS.VIDEO_GET_SIZE,
  IPC_CHANNELS.VIDEO_READ_BASE64,
  IPC_CHANNELS.VIDEO_SAVE_BASE64,
  IPC_CHANNELS.VIDEO_EXISTS,
  IPC_CHANNELS.VIDEO_GET_PATH,
  IPC_CHANNELS.VIDEO_CLEAR,
  IPC_CHANNELS.RULES_RESOLVE_CONFLICT,
  IPC_CHANNELS.RULES_REMOVE_MISSING_PROJECTS,
  IPC_CHANNELS.RULES_VERSION_DELETE,
  IPC_CHANNELS.AI_HTTP_REQUEST,
  IPC_CHANNELS.AI_HTTP_STREAM,
  IPC_CHANNELS.AGENT_LAUNCH,
  IPC_CHANNELS.AGENT_MODEL_CONFIG_GET,
  IPC_CHANNELS.AGENT_MODEL_CONFIG_SET,
  IPC_CHANNELS.AGENT_PI_PROVIDER_ADD,
  IPC_CHANNELS.AGENT_PI_PROVIDER_IMPORT_CURRENT,
  IPC_CHANNELS.AGENT_PI_PROVIDER_UPDATE,
  IPC_CHANNELS.AGENT_PI_PROVIDER_REMOVE,
  IPC_CHANNELS.AGENT_PI_MODEL_ADD,
  IPC_CHANNELS.AGENT_PI_MODEL_UPDATE,
  IPC_CHANNELS.AGENT_PI_MODEL_REMOVE,
  IPC_CHANNELS.AGENT_PI_MODEL_TEST,
  IPC_CHANNELS.AGENT_PI_CREDENTIAL_SET,
  IPC_CHANNELS.AGENT_USAGE_GET,
  IPC_CHANNELS.AGENT_MANAGEMENT_BACKUP_EXPORT,
  IPC_CHANNELS.AGENT_MANAGEMENT_BACKUP_RESTORE,
  IPC_CHANNELS.AGENT_APPEARANCE_UPDATE_PET,
  IPC_CHANNELS.AGENT_APPEARANCE_PET_STORE_LIST,
  IPC_CHANNELS.AGENT_APPEARANCE_PET_STORE_INSTALL,
  IPC_CHANNELS.AGENT_APPEARANCE_PET_STORE_PREVIEW,
  IPC_CHANNELS.MCP_MARKET_SOURCES_REPLACE,
  IPC_CHANNELS.MCP_MARKET_CHECK_UPDATE,
  IPC_CHANNELS.MCP_MARKET_APPLY_UPDATE,
  IPC_CHANNELS.MCP_REMOVE_NAMES,
  IPC_CHANNELS.MCP_TARGET_SYNC_CHECK,
  IPC_CHANNELS.MCP_TARGET_SYNC_APPLY,
  IPC_CHANNELS.PLUGIN_SOURCE_PREVIEW,
  IPC_CHANNELS.PLUGIN_IMPORT_SOURCE,
  IPC_CHANNELS.PLUGIN_SOURCE_UPDATE_STATUS,
  IPC_CHANNELS.PLUGIN_SOURCE_UPDATE,
  IPC_CHANNELS.PLUGIN_UPDATE_METADATA,
  IPC_CHANNELS.PLUGIN_UNDISTRIBUTE,
  IPC_CHANNELS.PLUGIN_IMPORT_CHILD_MCP,
  IPC_CHANNELS.PLUGIN_PACKAGE_HEALTH_CHECK,
  IPC_CHANNELS.PLUGIN_VERSION_GET_ALL,
  IPC_CHANNELS.PLUGIN_VERSION_CREATE,
  IPC_CHANNELS.PLUGIN_VERSION_ROLLBACK,
  IPC_CHANNELS.PLUGIN_VERSION_DELETE,
  IPC_CHANNELS.GENERATION_COMMIT_REMOTE_OUTPUT,
] as const;

let registeredAllIpcChannels = new Set<string>(REBINDABLE_DB_CHANNELS);

function resetAllRegisteredIpcHandlers(): void {
  for (const channel of registeredAllIpcChannels) {
    ipcMain.removeHandler(channel);
  }
  registeredAllIpcChannels = new Set();
}

function registerIpcGroup(label: string, register: () => void): void {
  try {
    register();
  } catch (error) {
    console.error(`[ipc] Failed to register ${label} handlers:`, error);
    throw error;
  }
}

/**
 * Register all IPC handlers
 * 注册所有 IPC 处理器
 */
function registerAllIpcGroups(
  db: Database.Database,
  setDbRef: (db: Database.Database) => void,
  onAgentProviderRuntime: (runtime: AgentProviderRuntime) => void = () =>
    undefined,
  onRendererPersistenceMigration: (
    result: RendererPersistenceMigrationResult,
  ) => void | Promise<void> = () => undefined,
): void {
  const promptDB = new PromptDB(db);
  const folderDB = new FolderDB(db);
  const skillDB = new SkillDB(db);
  const rendererPersistence = createRendererPersistenceStore({
    database: db,
    rootPath: getUserDataPath(),
    encryption: safeStorage,
  });

  registerIpcGroup("prompt", () => registerPromptIPC(promptDB, folderDB, db));
  registerIpcGroup("folder", () => registerFolderIPC(folderDB));
  registerIpcGroup("rules", () => registerRulesIPC());
  registerIpcGroup("settings", () =>
    registerSettingsIPC(db, {
      rendererPersistence,
      onRendererPersistenceMigration,
    }),
  );
  registerIpcGroup("cloud", () => registerCloudIPC());
  registerIpcGroup("security", () => registerSecurityIPC(db));
  registerIpcGroup("backup", () =>
    registerBackupIPC(setDbRef, (nextDb) =>
      registerAllIPC(
        nextDb,
        setDbRef,
        onAgentProviderRuntime,
        onRendererPersistenceMigration,
      ),
    ),
  );
  registerIpcGroup("cli", () => registerCliIPC());
  registerIpcGroup("skill", () => registerSkillIPC(skillDB));
  registerIpcGroup("mcp", () => registerMcpIPC());
  registerIpcGroup("plugin", () => registerPluginIPC());
  registerIpcGroup("image", () => registerImageIPC());
  registerIpcGroup("ai", () => registerAIIPC());
  registerIpcGroup("agent", () => {
    const userDataPath = app.getPath("userData");
    const runtime = createAgentProviderRuntime({
      database: db,
      userDataPath,
      encryption: safeStorage,
    });
    onAgentProviderRuntime(runtime);
    registerAgentIPC();
    registerAgentDeepSeekHarnessIPC();
    registerAgentQwenDefinitionIPC(db);
    registerAgentSessionIndexIPC({
      createService: (agentId) =>
        createAgentSessionIndexOperations(runtime.sessionIndexDb, agentId),
    });
    const commandRunner = createNativeCommandRunner();
    const terminal = createAgentTerminalLauncher({
      platform: process.platform,
      tempRoot: path.join(userDataPath, "agent-conversation-launches"),
      openPath: (filePath) => shell.openPath(filePath),
    });
    const conversationService = new AgentConversationService({
      repository: runtime.conversationDb,
      sessions: {
        list: (agentId, input) =>
          createAgentSessionIndexOperations(
            runtime.sessionIndexDb,
            agentId,
          ).list(agentId, input),
        read: (agentId, sessionId, input) =>
          createAgentSessionIndexOperations(
            runtime.sessionIndexDb,
            agentId,
          ).read(agentId, sessionId, input),
        canDelete: (agentId) =>
          createAgentSessionIndexOperations(
            runtime.sessionIndexDb,
            agentId,
          ).canDelete(agentId),
        delete: (agentId, sessionId) =>
          createAgentSessionIndexOperations(
            runtime.sessionIndexDb,
            agentId,
          ).delete(agentId, sessionId),
      },
      resolveExecutable: commandRunner.resolve,
      launch: (command) => terminal.launch(command),
      copyText: (text) => clipboard.writeText(text),
      canLaunchAgent: async (agentId) => {
        const platform = SkillInstaller.getSupportedPlatforms().find(
          (candidate) => candidate.id === agentId,
        );
        if (!platform) return false;
        const platformKey = process.platform as "darwin" | "linux" | "win32";
        return Boolean(platform.launchPaths?.[platformKey]?.length);
      },
      launchAgent: async (agentId) => {
        const platform = SkillInstaller.getSupportedPlatforms().find(
          (candidate) => candidate.id === agentId,
        );
        if (!platform) return false;
        const result = await launchAgentPlatform(platform, {
          platform: process.platform,
          homePath: app.getPath("home"),
          localAppDataPath: process.env.LOCALAPPDATA,
          pathExists: async (candidate) => {
            try {
              await fs.access(candidate);
              return true;
            } catch {
              return false;
            }
          },
          openPath: (candidate) => shell.openPath(candidate),
        });
        return result.success;
      },
      homeDir: app.getPath("home"),
      supportsInteractiveLaunch: process.platform === "darwin",
    });
    registerAgentConversationIPC({
      service: conversationService,
      saveExport: async (result) => {
        const selection = await dialog.showSaveDialog({
          defaultPath: path.join(app.getPath("documents"), result.fileName),
          filters: [
            result.mimeType === "application/json"
              ? { name: "JSON", extensions: ["json"] }
              : { name: "Markdown", extensions: ["md"] },
          ],
        });
        if (selection.canceled || !selection.filePath) return null;
        await fs.writeFile(selection.filePath, result.content, "utf8");
        return selection.filePath;
      },
    });
    registerAgentProviderProfileIPC(runtime.profileService);
    registerAgentCodexAccountIPC(runtime.codexAccountService);
    const providerSourceService = createAgentProviderSourceService({
      readConfig: () => coreAIConfigService.read(),
      createProfile: (request) => runtime.profileService.create(request),
      importPiProvider: ({ provider, secret }) => {
        const context = getAgentConfigContext("pi");
        return importPiCustomProvider(context.rootPath, provider, secret, {
          backupRoot: path.join(
            app.getPath("userData"),
            "agent-config-backups",
          ),
        });
      },
    });
    const officialProfileService = createAgentProviderOfficialProfileService({
      createProfile: (request) => runtime.profileService.create(request),
      importCurrent: (input) => runtime.activationService.importCurrent(input),
      listProfiles: (options) => runtime.profileService.list(options),
      resolveContext: resolveAgentProviderContext,
    });
    registerAgentProviderSourceIPC({
      list: providerSourceService.list,
      importSource: providerSourceService.importSource,
      importPiSource: providerSourceService.importPiSource,
      ensureOfficial: officialProfileService.ensure,
    });
    registerAgentManagementBackupIPC(runtime.backupService);
    registerAgentProviderMigrationIPC(
      createAgentCodexProviderMigrationService({
        sourceReader: {
          inspect: (agentId) =>
            runtime.legacyProviderService.inspectMigrationSources(agentId),
        },
        profiles: runtime.profileService,
        secrets: runtime.secretStore,
      }),
    );
    registerAgentProviderActivationIPC(
      runtime.activationService,
      resolveAgentProviderContext,
    );
    registerAgentProviderCurrentStateIPC(runtime.trayService);
    registerAgentAppearanceIPC();
  });
  registerIpcGroup("generation", () => registerGenerationIPC(db));
}

export function registerAllIPC(
  db: Database.Database,
  setDbRef: (db: Database.Database) => void,
  onAgentProviderRuntime: (runtime: AgentProviderRuntime) => void = () =>
    undefined,
  onRendererPersistenceMigration: (
    result: RendererPersistenceMigrationResult,
  ) => void | Promise<void> = () => undefined,
): void {
  resetAllRegisteredIpcHandlers();
  const captured = new Set<string>();
  const originalHandle = ipcMain.handle;
  ipcMain.handle = ((channel, listener) => {
    originalHandle.call(ipcMain, channel, listener);
    captured.add(channel);
  }) as typeof ipcMain.handle;

  try {
    registerAllIpcGroups(
      db,
      setDbRef,
      onAgentProviderRuntime,
      onRendererPersistenceMigration,
    );
    registeredAllIpcChannels = captured;
  } catch (error) {
    for (const channel of captured) ipcMain.removeHandler(channel);
    throw error;
  } finally {
    ipcMain.handle = originalHandle;
  }
}

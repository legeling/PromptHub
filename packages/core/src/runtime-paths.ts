import os from "os";
import path from "path";

import {
  resolveRuntimeStorageContext,
  type RuntimeStorageContext,
} from "./runtime-storage-context";

export interface RuntimePathOverrides {
  appDataPath?: string;
  userDataPath?: string;
  productName?: string;
  exePath?: string;
  isPackaged?: boolean;
  platform?: NodeJS.Platform;
}

const DEFAULT_PRODUCT_NAME = "PromptHub";

let runtimePathOverrides: RuntimePathOverrides = {};
let runtimeStorageContext: RuntimeStorageContext | null = null;

export function configureRuntimePaths(overrides: RuntimePathOverrides): void {
  runtimePathOverrides = {
    ...runtimePathOverrides,
    ...overrides,
  };
  runtimeStorageContext = null;
}

export function resetRuntimePaths(): void {
  runtimePathOverrides = {};
  runtimeStorageContext = null;
}

export function refreshRuntimeStorageContext(): void {
  runtimeStorageContext = null;
}

function getPlatform(): NodeJS.Platform {
  return runtimePathOverrides.platform ?? process.platform;
}

function getProductName(): string {
  return runtimePathOverrides.productName ?? DEFAULT_PRODUCT_NAME;
}

function getDefaultAppDataPath(platform: NodeJS.Platform): string {
  const homeDir = os.homedir();
  if (platform === "darwin") {
    return path.join(homeDir, "Library", "Application Support");
  }
  if (platform === "win32") {
    return process.env.APPDATA || path.join(homeDir, "AppData", "Roaming");
  }
  return process.env.XDG_CONFIG_HOME || path.join(homeDir, ".config");
}

function resolveInitialUserDataPath(): string {
  return path.join(getAppDataPath(), getProductName());
}

export function getAppDataPath(): string {
  return path.resolve(
    runtimePathOverrides.appDataPath ?? getDefaultAppDataPath(getPlatform()),
  );
}

export function getUserDataPath(): string {
  return runtimePathOverrides.userDataPath
    ? path.resolve(runtimePathOverrides.userDataPath)
    : resolveInitialUserDataPath();
}

export function getRuntimeStorageContext(): RuntimeStorageContext {
  runtimeStorageContext ??= resolveRuntimeStorageContext(getUserDataPath());
  return runtimeStorageContext;
}

export function getDataDir(): string {
  return getRuntimeStorageContext().dataPath;
}

export function getLegacyDatabasePath(): string {
  return path.join(getUserDataPath(), "prompthub.db");
}

export function getDatabasePath(): string {
  return getRuntimeStorageContext().databasePath;
}

export function getConfigDir(): string {
  return getRuntimeStorageContext().configPath;
}

export function getSecretsDir(): string {
  return getRuntimeStorageContext().secretsPath;
}

export function getBackupsDir(): string {
  return getRuntimeStorageContext().backupsPath;
}

export function getCacheDir(): string {
  return getRuntimeStorageContext().cachePath;
}

export function getLogsDir(): string {
  return getRuntimeStorageContext().logsPath;
}

export function getOperationsDir(): string {
  return getRuntimeStorageContext().operationsPath;
}

export function getAssetsDir(): string {
  return getRuntimeStorageContext().assetsPath;
}

export function getAttachmentsDir(): string {
  return path.join(getAssetsDir(), "attachments");
}

export function getLegacySkillsDir(): string {
  return path.join(getUserDataPath(), "skills");
}

export function getSkillsDir(): string {
  return getRuntimeStorageContext().skillsPath;
}

export function getRulesDir(): string {
  return path.join(getDataDir(), "rule-files");
}

export function getLegacyWorkspaceDir(): string {
  return path.join(getUserDataPath(), "workspace");
}

export function getLegacyPromptsWorkspaceDir(): string {
  return path.join(getLegacyWorkspaceDir(), "prompts");
}

export function getPromptsDir(): string {
  return getRuntimeStorageContext().promptsPath;
}

export function getWorkspaceDir(): string {
  return path.join(getCacheDir(), "prompt-workspace");
}

export function getPromptsWorkspaceDir(): string {
  return path.join(getWorkspaceDir(), "prompts");
}

export function getLegacyImagesDir(): string {
  return path.join(getUserDataPath(), "images");
}

export function getImagesDir(): string {
  return getRuntimeStorageContext().imagesPath;
}

export function getGenerationsDir(): string {
  return getRuntimeStorageContext().generationsPath;
}

export function getGeneratedImagesDir(): string {
  return path.join(getGenerationsDir(), "assets");
}

export function getLegacyGeneratedImagesDir(): string {
  return path.join(getAssetsDir(), "images", "generated");
}

export function getLegacyVideosDir(): string {
  return path.join(getUserDataPath(), "videos");
}

export function getVideosDir(): string {
  return getRuntimeStorageContext().videosPath;
}

export type { RuntimeStorageContext } from "./runtime-storage-context";
export {
  CURRENT_LAYOUT_EPOCH,
  CURRENT_LAYOUT_STATE_FORMAT_VERSION,
  LAYOUT_STATE_FILE_NAME,
  LEGACY_LAYOUT_EPOCH,
  deriveLocalResourceDeviceId,
  deriveStorageRootIdentity,
  localResourceDeviceIdFromRootIdentity,
  readRuntimeLayoutState,
  resolveRuntimeStorageContext,
  writeRuntimeLayoutState,
} from "./runtime-storage-context";

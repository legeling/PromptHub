import os from "os";
import path from "path";
import fs from "fs";

import { resolveInitialUserDataPath } from "./data-path";

const DEFAULT_PRODUCT_NAME = "PromptHub";

export interface RuntimePathOverrides {
  appDataPath?: string;
  userDataPath?: string;
  productName?: string;
  exePath?: string;
  isPackaged?: boolean;
  platform?: NodeJS.Platform;
}

let runtimePathOverrides: RuntimePathOverrides = {};

export function configureRuntimePaths(overrides: RuntimePathOverrides): void {
  runtimePathOverrides = {
    ...runtimePathOverrides,
    ...overrides,
  };
}

export function resetRuntimePaths(): void {
  runtimePathOverrides = {};
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

export function getAppDataPath(): string {
  return path.resolve(
    runtimePathOverrides.appDataPath ?? getDefaultAppDataPath(getPlatform()),
  );
}

export function getUserDataPath(): string {
  if (runtimePathOverrides.userDataPath) {
    return path.resolve(runtimePathOverrides.userDataPath);
  }

  const appDataPath = getAppDataPath();
  const defaultUserDataPath = path.join(appDataPath, getProductName());

  return resolveInitialUserDataPath({
    appDataPath,
    defaultUserDataPath,
    exePath: runtimePathOverrides.exePath ?? process.execPath,
    isPackaged: runtimePathOverrides.isPackaged ?? false,
    platform: getPlatform(),
  });
}

function resolvePreferredPath(primaryPath: string, legacyPath?: string): string {
  if (fs.existsSync(primaryPath)) {
    return primaryPath;
  }
  if (legacyPath && fs.existsSync(legacyPath)) {
    return legacyPath;
  }
  return primaryPath;
}

export function getDataDir(): string {
  return path.join(getUserDataPath(), "data");
}

export function getConfigDir(): string {
  return path.join(getUserDataPath(), "config");
}

export function getLogsDir(): string {
  return path.join(getUserDataPath(), "logs");
}

export function getAssetsDir(): string {
  return path.join(getDataDir(), "assets");
}

export function getAttachmentsDir(): string {
  return path.join(getAssetsDir(), "attachments");
}

export function getLegacySkillsDir(): string {
  return path.join(getUserDataPath(), "skills");
}

export function getSkillsDir(): string {
  return resolvePreferredPath(
    path.join(getDataDir(), "skills"),
    getLegacySkillsDir(),
  );
}

export function getLegacyWorkspaceDir(): string {
  return path.join(getUserDataPath(), "workspace");
}

export function getLegacyPromptsWorkspaceDir(): string {
  return path.join(getLegacyWorkspaceDir(), "prompts");
}

export function getPromptsDir(): string {
  return resolvePreferredPath(
    path.join(getDataDir(), "prompts"),
    getLegacyPromptsWorkspaceDir(),
  );
}

export function getWorkspaceDir(): string {
  const dataDir = getDataDir();
  if (
    fs.existsSync(path.join(dataDir, "prompts")) ||
    fs.existsSync(path.join(dataDir, "folders.json"))
  ) {
    return dataDir;
  }

  const legacyWorkspaceDir = getLegacyWorkspaceDir();
  if (fs.existsSync(legacyWorkspaceDir)) {
    return legacyWorkspaceDir;
  }

  return dataDir;
}

export function getPromptsWorkspaceDir(): string {
  return getPromptsDir();
}

export function getLegacyImagesDir(): string {
  return path.join(getUserDataPath(), "images");
}

export function getImagesDir(): string {
  return resolvePreferredPath(
    path.join(getAssetsDir(), "images"),
    getLegacyImagesDir(),
  );
}

export function getLegacyVideosDir(): string {
  return path.join(getUserDataPath(), "videos");
}

export function getVideosDir(): string {
  return resolvePreferredPath(
    path.join(getAssetsDir(), "videos"),
    getLegacyVideosDir(),
  );
}

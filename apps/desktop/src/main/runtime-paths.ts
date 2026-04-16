import os from "os";
import path from "path";

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

export function getSkillsDir(): string {
  return path.join(getUserDataPath(), "skills");
}

export function getWorkspaceDir(): string {
  return path.join(getUserDataPath(), "workspace");
}

export function getPromptsWorkspaceDir(): string {
  return path.join(getWorkspaceDir(), "prompts");
}

import fs from "fs";
import path from "path";

const CONFIG_DIR_NAME = "PromptHub";
const CONFIG_FILE_NAME = "data-path.json";

const DATA_MARKERS = [
  "prompthub.db",
  "workspace",
  "IndexedDB",
  "Local Storage",
  "Session Storage",
  "images",
  "videos",
  "skills",
  "shortcuts.json",
  "shortcut-mode.json",
];

function resolvePlatformPath(
  targetPath: string,
  platform: NodeJS.Platform,
): string {
  if (platform === "win32") {
    return targetPath.replace(/\//g, "\\");
  }

  return path.resolve(targetPath);
}

function dirnamePlatformPath(
  targetPath: string,
  platform: NodeJS.Platform,
): string {
  return platform === "win32"
    ? path.win32.dirname(targetPath)
    : path.dirname(targetPath);
}

function joinPlatformPath(
  basePath: string,
  childPath: string,
  platform: NodeJS.Platform,
): string {
  return platform === "win32"
    ? path.win32.join(basePath, childPath)
    : path.join(basePath, childPath);
}

export interface DataPathResolverOptions {
  appDataPath: string;
  defaultUserDataPath: string;
  exePath: string;
  isPackaged: boolean;
  platform: NodeJS.Platform;
}

interface DataPathResolverDeps {
  readConfiguredDataPath: (appDataPath: string) => string | null;
  hasExistingAppData: (targetPath: string) => boolean;
  isPathWritable: (targetPath: string) => boolean;
}

const defaultDeps: DataPathResolverDeps = {
  readConfiguredDataPath,
  hasExistingAppData,
  isPathWritable,
};

function getConfigFilePath(appDataPath: string): string {
  return path.join(appDataPath, CONFIG_DIR_NAME, CONFIG_FILE_NAME);
}

export function readConfiguredDataPath(appDataPath: string): string | null {
  const configPath = getConfigFilePath(appDataPath);
  try {
    if (!fs.existsSync(configPath)) {
      return null;
    }

    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      dataPath?: unknown;
    };
    if (typeof parsed.dataPath !== "string" || parsed.dataPath.trim() === "") {
      return null;
    }

    return path.resolve(parsed.dataPath);
  } catch (error) {
    console.warn("[DataPath] Failed to read configured data path:", error);
    return null;
  }
}

export function writeConfiguredDataPath(
  appDataPath: string,
  dataPath: string,
): void {
  const configPath = getConfigFilePath(appDataPath);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(
    configPath,
    JSON.stringify(
      {
        dataPath: path.resolve(dataPath),
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );
}

export function hasExistingAppData(targetPath: string): boolean {
  if (!targetPath || !fs.existsSync(targetPath)) {
    return false;
  }

  return DATA_MARKERS.some((marker) =>
    fs.existsSync(path.join(targetPath, marker)),
  );
}

export function isProtectedInstallDir(
  targetPath: string,
  platform: NodeJS.Platform,
): boolean {
  const normalized = resolvePlatformPath(targetPath, platform).toLowerCase();

  if (platform === "win32") {
    return ["\\windows\\", "\\program files\\", "\\program files (x86)\\"].some(
      (segment) => normalized.includes(segment),
    );
  }

  if (platform === "darwin") {
    return (
      normalized.startsWith("/applications") ||
      normalized.startsWith("/system") ||
      normalized.startsWith("/library")
    );
  }

  return normalized.startsWith("/usr") || normalized.startsWith("/opt");
}

export function isDefaultPerUserInstallDir(
  targetPath: string,
  platform: NodeJS.Platform,
): boolean {
  if (platform !== "win32") {
    return false;
  }

  const normalized = resolvePlatformPath(targetPath, platform).toLowerCase();
  return normalized.includes("\\appdata\\local\\programs\\");
}

export function isPathWritable(targetPath: string): boolean {
  try {
    // Only test writability of existing directories — never create directories
    // as a side effect of a read-only probe.
    if (!fs.existsSync(targetPath)) {
      return false;
    }
    fs.accessSync(targetPath, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export function getInstallScopedDataPath(
  exePath: string,
  platform: NodeJS.Platform,
  isPackaged: boolean,
): string | null {
  if (!isPackaged || platform !== "win32") {
    return null;
  }

  const installDir = dirnamePlatformPath(
    resolvePlatformPath(exePath, platform),
    platform,
  );
  if (isProtectedInstallDir(installDir, platform)) {
    return null;
  }

  // Current-user installs under AppData\Local\Programs are the default
  // Windows installer target and still live on the system drive.
  // Treat only explicit custom install locations as eligible for install-scoped data.
  if (isDefaultPerUserInstallDir(installDir, platform)) {
    return null;
  }

  return joinPlatformPath(installDir, "data", platform);
}

export function resolveInitialUserDataPath(
  options: DataPathResolverOptions,
  deps: DataPathResolverDeps = defaultDeps,
): string {
  const configuredPath = deps.readConfiguredDataPath(options.appDataPath);
  if (configuredPath) {
    return configuredPath;
  }

  if (deps.hasExistingAppData(options.defaultUserDataPath)) {
    return options.defaultUserDataPath;
  }

  const installScopedPath = getInstallScopedDataPath(
    options.exePath,
    options.platform,
    options.isPackaged,
  );

  if (
    installScopedPath &&
    deps.isPathWritable(
      dirnamePlatformPath(installScopedPath, options.platform),
    )
  ) {
    // Only use the install-scoped path if it already contains user data.
    // Without this guard, upgrades from older versions (which never wrote
    // data-path.json or the NSIS InstallerState registry key) would silently
    // create a brand-new empty data directory next to the executable, causing
    // the user's existing data in %APPDATA%/PromptHub to become invisible.
    if (deps.hasExistingAppData(installScopedPath)) {
      return installScopedPath;
    }
  }

  return options.defaultUserDataPath;
}

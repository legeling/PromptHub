import path from "path";

export interface RecoveryPathOptions {
  currentPath: string;
  appDataPath: string;
  homePath: string;
  exePath: string;
  isPackaged: boolean;
  platform: NodeJS.Platform;
  localAppDataPath?: string;
}

const APP_NAME_VARIANTS = ["PromptHub", "prompthub"];

function resolveForPlatform(targetPath: string, platform: NodeJS.Platform): string {
  return platform === "win32"
    ? path.win32.resolve(targetPath)
    : path.resolve(targetPath);
}

function joinForPlatform(
  basePath: string,
  childPath: string,
  platform: NodeJS.Platform,
): string {
  return platform === "win32"
    ? path.win32.join(basePath, childPath)
    : path.join(basePath, childPath);
}

function normalizeForPlatform(targetPath: string, platform: NodeJS.Platform): string {
  const resolved = resolveForPlatform(targetPath, platform);
  return platform === "win32" ? resolved.toLowerCase() : resolved;
}

export function getRecoveryCandidatePaths(options: RecoveryPathOptions): string[] {
  const candidates: string[] = [];

  for (const name of APP_NAME_VARIANTS) {
    candidates.push(joinForPlatform(options.appDataPath, name, options.platform));
  }

  if (options.platform === "win32") {
    const localAppData =
      options.localAppDataPath ||
      process.env.LOCALAPPDATA ||
      path.join(options.homePath, "AppData", "Local");

    for (const name of APP_NAME_VARIANTS) {
      candidates.push(joinForPlatform(localAppData, name, options.platform));
      candidates.push(
        joinForPlatform(
          joinForPlatform(localAppData, "Programs", options.platform),
          joinForPlatform(name, "data", options.platform),
          options.platform,
        ),
      );
    }

    if (options.isPackaged) {
      const installDir = path.win32.dirname(options.exePath);
      candidates.push(joinForPlatform(installDir, "data", options.platform));
    }
  }

  const normalizedCurrent = normalizeForPlatform(
    options.currentPath,
    options.platform,
  );
  const seen = new Set<string>();
  return candidates.filter((candidatePath) => {
    const normalized = normalizeForPlatform(candidatePath, options.platform);
    if (normalized === normalizedCurrent || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

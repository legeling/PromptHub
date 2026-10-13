import os from "os";
import path from "path";

import {
  getPlatformGlobalRuleTemplate,
  getPlatformRootTemplate,
  type SkillPlatform,
  type SkillPlatformOsKey,
} from "@prompthub/shared/constants/platforms";

function resolvePlatformPath(template: string, home = os.homedir()): string {
  return template
    .replace(/^~/, home)
    .replace(/%USERPROFILE%/gi, home)
    .replace(/%APPDATA%/gi, path.join(home, "AppData", "Roaming"));
}

function getPlatformOsKey(platform: NodeJS.Platform = process.platform): SkillPlatformOsKey {
  if (platform === "darwin" || platform === "win32") {
    return platform;
  }

  return "linux";
}

export function getDefaultPlatformRootDir(
  platform: SkillPlatform,
  targetPlatform: NodeJS.Platform = process.platform,
  environment: NodeJS.ProcessEnv = process.env,
  homeDir = os.homedir(),
  rootOverride?: string,
): string {
  const configured =
    rootOverride?.trim() ||
    (platform.rootEnvironmentVariable
      ? environment[platform.rootEnvironmentVariable]?.trim()
      : undefined);
  if (configured && !configured.includes("\0")) {
    const expanded = resolvePlatformPath(configured, homeDir);
    if (path.isAbsolute(expanded)) return path.normalize(expanded);
  }
  return resolvePlatformPath(
    getPlatformRootTemplate(platform, getPlatformOsKey(targetPlatform)),
    homeDir,
  );
}

export function isPlatformRootConfigured(
  platform: SkillPlatform,
  rootPath: string,
  options: {
    rootOverride?: string;
    environment?: NodeJS.ProcessEnv;
    homeDir?: string;
    targetPlatform?: NodeJS.Platform;
  } = {},
): boolean {
  if (options.rootOverride?.trim()) return true;
  const homeDir = options.homeDir ?? os.homedir();
  const targetPlatform = options.targetPlatform ?? process.platform;
  const environment = options.environment ?? process.env;
  const declared = getDefaultPlatformRootDir(
    platform, targetPlatform, {}, homeDir,
  );
  const configured = platform.rootEnvironmentVariable
    ? environment[platform.rootEnvironmentVariable]?.trim()
    : undefined;
  const hasEnvironmentRoot = Boolean(
    configured && !configured.includes("\0") &&
      path.isAbsolute(resolvePlatformPath(configured, homeDir)),
  );
  return hasEnvironmentRoot ||
    path.normalize(rootPath) !== path.normalize(declared);
}

export function getDefaultPlatformGlobalRulePath(
  platform: SkillPlatform,
  targetPlatform: NodeJS.Platform = process.platform,
): string | null {
  const template = getPlatformGlobalRuleTemplate(platform, getPlatformOsKey(targetPlatform));
  return template ? resolvePlatformPath(template) : null;
}

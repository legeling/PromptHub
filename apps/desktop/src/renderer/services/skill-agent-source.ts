import { SKILL_PLATFORMS } from "@prompthub/shared/constants/platforms";

export interface DetectedAgentSkillSource {
  platformId: string;
  platformName: string;
}

function normalizePath(value?: string): string {
  return value?.trim().replace(/\\/g, "/").replace(/\/+/g, "/") ?? "";
}

function stripSkillFile(value: string): string {
  return value.toLowerCase().endsWith("/skill.md")
    ? value.slice(0, -"/SKILL.md".length)
    : value;
}

function normalizeTemplate(value: string): string {
  return normalizePath(value)
    .replace(/^~\//, "")
    .replace(/^%[^%]+%\//, "")
    .replace(/^\$[A-Z_]+\//i, "")
    .replace(/^\/+/, "")
    .toLowerCase();
}

function isHomeRelativeTemplate(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.startsWith("~/") ||
    /^%USERPROFILE%[\\/]/i.test(trimmed) ||
    /^\$HOME[\\/]/i.test(trimmed)
  );
}

function hasHomeRootSkillChild(sourcePath: string, combined: string): boolean {
  const normalized = stripSkillFile(normalizePath(sourcePath))
    .replace(/^\/+/, "")
    .toLowerCase();
  const escapedCombined = combined.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `^(?:[a-z]:/users/[^/]+|users/[^/]+|home/[^/]+|root)/${escapedCombined}/[^/]+$`,
    "i",
  );

  return pattern.test(normalized) || normalized === combined;
}

function hasDirectSkillChild(
  sourcePath: string,
  platformRoot: string,
  skillsRelativePath: string,
): boolean {
  const root = normalizeTemplate(platformRoot);
  const skillsPath = normalizeTemplate(skillsRelativePath);
  const combined = [root, skillsPath].filter(Boolean).join("/");
  if (!combined) {
    return false;
  }

  const normalized = stripSkillFile(normalizePath(sourcePath)).toLowerCase();
  if (isHomeRelativeTemplate(platformRoot)) {
    return hasHomeRootSkillChild(sourcePath, combined);
  }

  const marker = `/${combined}/`;
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex < 0) {
    return false;
  }

  const remainder = normalized.slice(markerIndex + marker.length);
  return Boolean(remainder) && !remainder.includes("/");
}

export function detectAgentPlatformSkillSource(input: {
  sourceLabel?: string;
  sourceUrl?: string;
  localRepoPath?: string;
}): DetectedAgentSkillSource | null {
  const normalizedLabel = input.sourceLabel?.trim().toLowerCase();
  if (normalizedLabel) {
    const platformByLabel = SKILL_PLATFORMS.find(
      (platform) => platform.name.toLowerCase() === normalizedLabel,
    );
    if (platformByLabel) {
      return {
        platformId: platformByLabel.id,
        platformName: platformByLabel.name,
      };
    }
  }

  const candidates = [input.sourceUrl, input.localRepoPath].filter(
    (value): value is string =>
      Boolean(value?.trim()) && !/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(value),
  );

  for (const sourcePath of candidates) {
    const platform = SKILL_PLATFORMS.find((entry) =>
      Object.values(entry.rootDir).some((rootTemplate) =>
        hasDirectSkillChild(
          sourcePath,
          rootTemplate,
          entry.skillsRelativePath,
        ),
      ),
    );
    if (platform) {
      return {
        platformId: platform.id,
        platformName: platform.name,
      };
    }
  }

  return null;
}

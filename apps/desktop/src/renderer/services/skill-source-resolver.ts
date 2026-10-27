import type { RegistrySkill, Skill } from "@prompthub/shared/types";
import { parseGitRepo } from "@prompthub/shared/utils/git-repo";
import {
  isLikelyLocalSource,
  normalizeLocalSkillDirectoryPath,
} from "./skill-store-source";

export type SkillSourceResolverKind =
  | "remote-store"
  | "remote-git"
  | "remote-zip"
  | "content-url"
  | "local-linked"
  | "managed-copy";

export interface SkillSourceReference {
  kind: SkillSourceResolverKind;
  reference: string;
}

export interface ParsedGitHubSkillLocation {
  owner: string;
  repo: string;
  branch: string;
  directoryPath: string;
}

export interface ResolvedRegistrySkillGitPackage {
  repoUrl: string;
  branch?: string;
  directory?: string;
  skillName?: string;
}

type RegistrySkillSourceDescriptor = Pick<
  RegistrySkill,
  | "source_id"
  | "slug"
  | "name"
  | "install_name"
  | "source_url"
  | "content_url"
  | "package_url"
  | "store_url"
  | "source_label"
  | "source_branch"
  | "source_directory"
  | "canonical_skill_path"
  | "directory_fingerprint"
>;

function normalizeLocalSourceKey(value?: string | null): string | null {
  const normalized = value?.trim().replace(/\\/g, "/").replace(/\/+$/g, "");
  return normalized || null;
}

export function parseGitHubSkillLocation(
  sourceUrl?: string,
  contentUrl?: string,
): ParsedGitHubSkillLocation | null {
  if (sourceUrl) {
    try {
      const parsed = new URL(sourceUrl);
      if (parsed.hostname.toLowerCase() === "github.com") {
        const parts = parsed.pathname.split("/").filter(Boolean);
        if (parts.length >= 4 && parts[2] === "tree") {
          return {
            owner: parts[0],
            repo: parts[1],
            branch: parts[3],
            directoryPath: parts.slice(4).join("/"),
          };
        }
      }
    } catch {
      // Invalid source URL can still be resolved from contentUrl.
    }
  }

  if (contentUrl) {
    try {
      const parsed = new URL(contentUrl);
      if (parsed.hostname.toLowerCase() === "raw.githubusercontent.com") {
        const parts = parsed.pathname.split("/").filter(Boolean);
        if (parts.length >= 4) {
          return {
            owner: parts[0],
            repo: parts[1],
            branch: parts[2],
            directoryPath: parts.slice(3, -1).join("/"),
          };
        }
      }
    } catch {
      // Invalid content URL has no GitHub location.
    }
  }

  return null;
}

export function getRegistrySkillDirectory(
  regSkill: Pick<RegistrySkill, "source_directory" | "canonical_skill_path">,
): string | undefined {
  const explicitDirectory = regSkill.source_directory
    ?.trim()
    .replace(/^\/+|\/+$/g, "");
  if (explicitDirectory) {
    return explicitDirectory;
  }

  const canonicalPath = regSkill.canonical_skill_path
    ?.trim()
    .replace(/^\/+|\/+$/g, "");
  if (!canonicalPath || canonicalPath.toLowerCase() === "skill.md") {
    return undefined;
  }

  const parts = canonicalPath.split("/");
  parts.pop();
  return parts.join("/") || undefined;
}

export function isLocalRegistrySkill(
  skill: Pick<RegistrySkill, "content_url" | "source_url">,
): boolean {
  return Boolean(
    (typeof skill.content_url === "string" &&
      isLikelyLocalSource(skill.content_url)) ||
    (typeof skill.source_url === "string" &&
      isLikelyLocalSource(skill.source_url)),
  );
}

export function normalizeLocalRegistryDirectory(
  regSkill: Pick<RegistrySkill, "content_url" | "source_url">,
): string {
  const candidates = [regSkill.content_url, regSkill.source_url]
    .filter(
      (value): value is string =>
        typeof value === "string" &&
        value.trim().length > 0 &&
        isLikelyLocalSource(value),
    )
    .map((value) => normalizeLocalSkillDirectoryPath(value));

  return candidates[0] ?? "";
}

export function isLinkedLocalSkill(
  skill: Pick<Skill, "local_repo_path" | "source_url">,
): boolean {
  const localRepoPath = normalizeLocalSourceKey(skill.local_repo_path);
  const sourceUrl = normalizeLocalSourceKey(skill.source_url);
  return Boolean(
    localRepoPath &&
    sourceUrl &&
    localRepoPath === sourceUrl &&
    isLikelyLocalSource(sourceUrl),
  );
}

function getPublicDirectoryStoreValues(
  regSkill: RegistrySkillSourceDescriptor,
): string[] {
  return [
    regSkill.source_url,
    regSkill.store_url,
    regSkill.content_url,
    regSkill.source_label,
  ]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.toLowerCase());
}

function hasPackageMetadata(regSkill: RegistrySkillSourceDescriptor): boolean {
  return Boolean(
    getRegistrySkillDirectory(regSkill) || regSkill.canonical_skill_path,
  );
}

function parseHostedGitSkillLocation(
  value?: string | null,
): ResolvedRegistrySkillGitPackage | null {
  const candidate = value?.trim();
  if (!candidate || !URL.canParse(candidate)) return null;
  const url = new URL(candidate);
  if (!["http:", "https:"].includes(url.protocol)) return null;
  const encodedParts = url.pathname.split("/").filter(Boolean);
  let parts: string[];
  try {
    parts = encodedParts.map((part) => decodeURIComponent(part));
  } catch {
    return null;
  }
  if (url.hostname === "raw.githubusercontent.com" && parts.length >= 4) {
    return {
      repoUrl: `https://github.com/${encodedParts[0]}/${encodedParts[1]}`,
      branch: parts[2],
      directory: parts.slice(3, -1).join("/") || undefined,
    };
  }
  if (parts.length < 4) return null;
  const repoUrl = `${url.protocol}//${url.host}/${encodedParts[0]}/${encodedParts[1]}`;
  if (["tree", "blob"].includes(parts[2])) {
    const locationParts = parts.slice(4);
    if (locationParts.at(-1)?.toLowerCase() === "skill.md") {
      locationParts.pop();
    }
    return {
      repoUrl,
      branch: parts[3],
      directory: locationParts.join("/") || undefined,
    };
  }
  if (["src", "raw"].includes(parts[2]) && parts[3] === "branch") {
    const locationParts = parts.slice(5, parts[2] === "raw" ? -1 : undefined);
    if (locationParts.at(-1)?.toLowerCase() === "skill.md") {
      locationParts.pop();
    }
    return {
      repoUrl,
      branch: parts[4],
      directory: locationParts.join("/") || undefined,
    };
  }
  return null;
}

export function resolveRegistrySkillGitPackage(
  regSkill: RegistrySkillSourceDescriptor,
): ResolvedRegistrySkillGitPackage | null {
  const sourceUrl = regSkill.source_url?.trim();
  if (sourceUrl && isLikelyLocalSource(sourceUrl)) return null;
  const sourceLocation = parseHostedGitSkillLocation(sourceUrl);
  const contentLocation = parseHostedGitSkillLocation(regSkill.content_url);
  const parsedRepo = sourceUrl ? parseGitRepo(sourceUrl) : null;
  const hasGitSignal = Boolean(
    sourceLocation ||
    contentLocation ||
    sourceUrl?.startsWith("git@") ||
    (sourceUrl ? /\.git\/?$/i.test(sourceUrl) : false) ||
    regSkill.store_url?.toLowerCase().includes("skills.sh") ||
    regSkill.source_branch?.trim() ||
    hasPackageMetadata(regSkill),
  );
  if (!hasGitSignal || (!parsedRepo && !sourceLocation && !contentLocation)) {
    return null;
  }
  const location = sourceLocation || contentLocation;
  const repoUrl = sourceUrl?.startsWith("git@")
    ? sourceUrl
    : sourceLocation?.repoUrl ||
      parsedRepo?.repositoryUrl ||
      contentLocation?.repoUrl;
  if (!repoUrl) return null;
  const directory =
    getRegistrySkillDirectory(regSkill) || location?.directory || undefined;
  const skillName =
    regSkill.install_name?.trim() ||
    regSkill.name?.trim() ||
    regSkill.slug?.trim() ||
    undefined;
  return {
    repoUrl,
    branch: regSkill.source_branch?.trim() || location?.branch || undefined,
    directory,
    ...(!directory && skillName ? { skillName } : {}),
  };
}

export function shouldCloneRegistrySkillPackage(
  regSkill: RegistrySkillSourceDescriptor,
): boolean {
  const publicDirectoryStoreValues = getPublicDirectoryStoreValues(regSkill);
  if (
    publicDirectoryStoreValues.some((value) => value.includes("clawhub.ai")) &&
    !getRegistrySkillDirectory(regSkill)
  ) {
    return false;
  }

  return resolveRegistrySkillGitPackage(regSkill) !== null;
}

export function getRegistrySkillSourceResolverKind(
  regSkill: RegistrySkillSourceDescriptor,
  installedSkill?: Pick<Skill, "local_repo_path" | "source_url"> | null,
): SkillSourceResolverKind {
  if (installedSkill && isLinkedLocalSkill(installedSkill)) {
    return "local-linked";
  }
  if (isLocalRegistrySkill(regSkill)) {
    return "local-linked";
  }
  if (regSkill.package_url?.trim()) {
    return "remote-zip";
  }
  if (shouldCloneRegistrySkillPackage(regSkill)) {
    return "remote-git";
  }
  if (regSkill.content_url?.trim()) {
    return "content-url";
  }
  if (installedSkill?.local_repo_path?.trim()) {
    return "managed-copy";
  }
  return "remote-store";
}

function getFirstSourceReference(values: unknown[]): string {
  return (
    values
      .find(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      )
      ?.trim() || "Unknown source"
  );
}

export function getRegistrySkillSourceReference(
  regSkill: RegistrySkillSourceDescriptor,
  installedSkill?: Pick<Skill, "local_repo_path" | "source_url"> | null,
): SkillSourceReference {
  const kind = getRegistrySkillSourceResolverKind(regSkill, installedSkill);
  let reference: string;

  if (kind === "local-linked") {
    let localDirectory = "";
    try {
      localDirectory = normalizeLocalRegistryDirectory(regSkill);
    } catch {
      localDirectory = "";
    }
    reference =
      localDirectory ||
      getFirstSourceReference([
        installedSkill?.local_repo_path,
        regSkill.source_url,
        regSkill.content_url,
      ]);
  } else if (kind === "managed-copy") {
    reference = getFirstSourceReference([
      installedSkill?.local_repo_path,
      regSkill.source_url,
      regSkill.content_url,
    ]);
  } else if (kind === "remote-git") {
    reference = getFirstSourceReference([
      regSkill.source_url,
      regSkill.content_url,
    ]);
  } else if (kind === "remote-zip") {
    reference = getFirstSourceReference([
      regSkill.package_url,
      regSkill.source_url,
    ]);
  } else if (kind === "content-url") {
    reference = getFirstSourceReference([
      regSkill.content_url,
      regSkill.source_url,
    ]);
  } else {
    reference = getFirstSourceReference([
      regSkill.source_url,
      regSkill.content_url,
      regSkill.store_url,
      regSkill.source_label,
      regSkill.source_id,
    ]);
  }

  return { kind, reference };
}

export function normalizeRemoteDirectoryFingerprint(
  regSkill: RegistrySkillSourceDescriptor,
  options: {
    remoteContentHash?: string;
    resolvedDirectoryFingerprint?: string;
    installedSkill?: Pick<Skill, "local_repo_path" | "source_url"> | null;
  },
): string | undefined {
  const kind = getRegistrySkillSourceResolverKind(
    regSkill,
    options.installedSkill,
  );
  if (kind === "content-url") {
    return options.remoteContentHash || undefined;
  }
  return (
    options.resolvedDirectoryFingerprint?.trim() ||
    regSkill.directory_fingerprint?.trim() ||
    undefined
  );
}

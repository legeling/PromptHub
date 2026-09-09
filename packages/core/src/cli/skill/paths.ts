import fs from "fs/promises";
import {
  MAX_SKILL_PACKAGE_FILE_BYTES,
  MAX_SKILL_PACKAGE_TOTAL_BYTES,
} from "@prompthub/shared/constants/skill-package";
import os from "os";
import path from "path";

import {
  SKILL_PLATFORMS,
  type SkillPlatform,
} from "@prompthub/shared/constants/platforms";
import type {
  SkillLocalFileBufferEntry,
  SkillLocalFileEntry,
} from "@prompthub/shared/types";
import { computeSkillPackageFingerprintV1Sync } from "@prompthub/shared/utils/skill-source-update";
import {
  createSkillPackageIgnoreMatcher,
  type SkillPackageIgnoreMatcher,
} from "@prompthub/shared/utils/skill-package-policy";
import { getSkillsDir } from "../../runtime-paths";
import {
  SKILL_PACKAGE_MAX_ENTRIES,
  SkillPackageEntryLimitError,
} from "../../skills/package-policy";
import { validateSkillName } from "./parse";

export const INTERNAL_REPO_DIRS = new Set([".git", ".prompthub"]);
export const MAX_WALK_DEPTH = 5;
export const MAX_WALK_FILES = 500;
export const MAX_FILE_SIZE_BYTES = 1_048_576;
export const MAX_PREVIEW_FILE_SIZE_BYTES = 5 * 1_048_576;
export const GIT_CLONE_TIMEOUT_MS = 60_000;
export type FetchLike = typeof fetch;

export function resolvePlatformPath(template: string): string {
  const home = os.homedir();
  return template
    .replace(/^~/, home)
    .replace(/%USERPROFILE%/gi, home)
    .replace(/%APPDATA%/gi, path.join(home, "AppData", "Roaming"));
}

export function getPlatformSkillsDir(platform: SkillPlatform): string {
  const osKey = process.platform as "darwin" | "win32" | "linux";
  const rootDir = platform.rootDir[osKey] || platform.rootDir.linux;
  return resolvePlatformPath(
    [rootDir, platform.skillsRelativePath].filter(Boolean).join("/"),
  );
}

export async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function loadSkillPackageIgnoreMatcher(
  baseDir: string,
): Promise<SkillPackageIgnoreMatcher> {
  const ignorePath = path.join(baseDir, ".prompthubignore");
  const customRules = await fs.readFile(ignorePath, "utf8").catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }
    throw error;
  });
  return createSkillPackageIgnoreMatcher(customRules);
}

export function isInternalSkillRepoEntry(relativePath: string): boolean {
  return relativePath
    .split(/[\\/]+/)
    .some((segment) => INTERNAL_REPO_DIRS.has(segment));
}

export function isPathWithin(basePath: string, targetPath: string): boolean {
  const relative = path.relative(basePath, targetPath);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

export function validateRelativePath(relativePath: string): void {
  if (!relativePath || !relativePath.trim()) {
    throw new Error("Invalid relative path: must not be empty");
  }
  if (relativePath.includes("\0")) {
    throw new Error("Invalid relative path: must not contain null bytes");
  }
  if (relativePath.includes("..")) {
    throw new Error(
      `Invalid relative path: must not contain "..": ${relativePath}`,
    );
  }
  if (relativePath.startsWith("/") || relativePath.startsWith("\\")) {
    throw new Error(
      `Invalid relative path: must not start with "/" or "\\": ${relativePath}`,
    );
  }
  if (/^[a-zA-Z]:/.test(relativePath)) {
    throw new Error(
      `Invalid relative path: must not be an absolute path: ${relativePath}`,
    );
  }
}

export async function normalizeExistingPath(
  absolutePath: string,
): Promise<string> {
  const resolvedPath = path.resolve(absolutePath);
  try {
    return await fs.realpath(resolvedPath);
  } catch {
    return resolvedPath;
  }
}

export const TEXT_EXTENSIONS = new Set([
  ".md",
  ".py",
  ".js",
  ".ts",
  ".json",
  ".yaml",
  ".yml",
  ".txt",
  ".sh",
  ".toml",
  ".cfg",
  ".ini",
  ".css",
  ".html",
  ".xml",
  ".sql",
  ".r",
  ".jl",
  ".lua",
  ".rb",
  ".go",
  ".java",
  ".kt",
  ".swift",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".cs",
  ".rs",
]);
export const PREVIEW_MIME_TYPES = new Map<
  string,
  { mimeType: string; previewKind: "image" | "audio" | "video" | "pdf" }
>([
  [".svg", { mimeType: "image/svg+xml", previewKind: "image" }],
  [".png", { mimeType: "image/png", previewKind: "image" }],
  [".jpg", { mimeType: "image/jpeg", previewKind: "image" }],
  [".jpeg", { mimeType: "image/jpeg", previewKind: "image" }],
  [".gif", { mimeType: "image/gif", previewKind: "image" }],
  [".webp", { mimeType: "image/webp", previewKind: "image" }],
  [".avif", { mimeType: "image/avif", previewKind: "image" }],
  [".bmp", { mimeType: "image/bmp", previewKind: "image" }],
  [".ico", { mimeType: "image/x-icon", previewKind: "image" }],
  [".mp3", { mimeType: "audio/mpeg", previewKind: "audio" }],
  [".wav", { mimeType: "audio/wav", previewKind: "audio" }],
  [".ogg", { mimeType: "audio/ogg", previewKind: "audio" }],
  [".m4a", { mimeType: "audio/mp4", previewKind: "audio" }],
  [".flac", { mimeType: "audio/flac", previewKind: "audio" }],
  [".mp4", { mimeType: "video/mp4", previewKind: "video" }],
  [".webm", { mimeType: "video/webm", previewKind: "video" }],
  [".ogv", { mimeType: "video/ogg", previewKind: "video" }],
  [".mov", { mimeType: "video/quicktime", previewKind: "video" }],
  [".pdf", { mimeType: "application/pdf", previewKind: "pdf" }],
]);

export async function resolveRepoBasePath(
  absoluteBasePath: string,
  options?: { ensureExists?: boolean; allowOutsideSkillsDir?: boolean },
): Promise<{ resolvedBasePath: string; realBasePath: string }> {
  const skillsDir = getSkillsDir();
  const resolvedBasePath = path.resolve(absoluteBasePath);
  const resolvedSkillsDir = path.resolve(skillsDir);
  const realSkillsDir = await fs
    .realpath(resolvedSkillsDir)
    .catch(() => resolvedSkillsDir);
  const realResolvedBasePath = await fs
    .realpath(resolvedBasePath)
    .catch(() => resolvedBasePath);

  if (
    !options?.allowOutsideSkillsDir &&
    !isPathWithin(resolvedSkillsDir, resolvedBasePath) &&
    !isPathWithin(realSkillsDir, resolvedBasePath) &&
    !isPathWithin(resolvedSkillsDir, realResolvedBasePath) &&
    !isPathWithin(realSkillsDir, realResolvedBasePath)
  ) {
    throw new Error(
      "Path traversal detected: base path is outside skills directory",
    );
  }

  if (options?.ensureExists) {
    await fs.mkdir(resolvedBasePath, { recursive: true });
  }

  const realBasePath = await fs
    .realpath(resolvedBasePath)
    .catch(() => resolvedBasePath);
  if (
    !options?.allowOutsideSkillsDir &&
    !isPathWithin(realSkillsDir, realBasePath)
  ) {
    throw new Error("Managed repo path resolves outside skills directory");
  }

  return { resolvedBasePath, realBasePath };
}

export async function resolveRepoTargetPath(
  absoluteBasePath: string,
  relativePath: string,
  options?: { ensureBaseExists?: boolean; allowOutsideSkillsDir?: boolean },
): Promise<{ fullPath: string; realBasePath: string }> {
  validateRelativePath(relativePath);
  const { resolvedBasePath, realBasePath } = await resolveRepoBasePath(
    absoluteBasePath,
    {
      ensureExists: options?.ensureBaseExists,
      allowOutsideSkillsDir: options?.allowOutsideSkillsDir,
    },
  );
  const fullPath = path.resolve(resolvedBasePath, relativePath);
  const realFullPath = await fs.realpath(fullPath).catch(() => fullPath);
  const realBasedFullPath = path.resolve(realBasePath, relativePath);
  if (
    !isPathWithin(realBasePath, fullPath) &&
    !isPathWithin(realBasePath, realFullPath) &&
    !isPathWithin(realBasePath, realBasedFullPath)
  ) {
    throw new Error("Path traversal detected: target path escapes repo root");
  }
  return { fullPath, realBasePath };
}

export async function readFileContent(
  fullPath: string,
  fileName: string,
  options?: { includePreviewData?: boolean },
): Promise<
  Pick<SkillLocalFileEntry, "content" | "mimeType" | "encoding" | "previewKind">
> {
  const ext = path.extname(fileName).toLowerCase();
  const stat = await fs.stat(fullPath);
  if (TEXT_EXTENSIONS.has(ext)) {
    if (stat.size > MAX_FILE_SIZE_BYTES) {
      return { content: "[file too large]", encoding: "placeholder" };
    }
    return { content: await fs.readFile(fullPath, "utf-8"), encoding: "text" };
  }

  const previewType = PREVIEW_MIME_TYPES.get(ext);
  if (options?.includePreviewData && previewType) {
    if (stat.size > MAX_PREVIEW_FILE_SIZE_BYTES) {
      return {
        content: "[file too large]",
        encoding: "placeholder",
        ...previewType,
      };
    }
    const data = await fs.readFile(fullPath);
    return {
      content: `data:${previewType.mimeType};base64,${data.toString("base64")}`,
      encoding: "data-url",
      ...previewType,
    };
  }

  return { content: "[binary file]", encoding: "placeholder" };
}

export async function readRepoFileBuffers(
  absoluteBasePath: string,
): Promise<SkillLocalFileBufferEntry[]> {
  const { resolvedBasePath, realBasePath } = await resolveRepoBasePath(
    absoluteBasePath,
    { allowOutsideSkillsDir: true },
  );

  if (!(await fileExists(resolvedBasePath))) {
    return [];
  }

  return walkRepoDir<SkillLocalFileBufferEntry>({
    baseDir: resolvedBasePath,
    entryLimit: SKILL_PACKAGE_MAX_ENTRIES,
    realBasePath,
    onEntryLimit: ({ relativePath, limit }) => {
      throw new SkillPackageEntryLimitError({
        path: relativePath,
        observedEntries: limit + 1,
        limitEntries: limit,
      });
    },
    onEntry: async ({ relativePath, fullPath, isDirectory }) => {
      if (isDirectory) {
        return null;
      }

      return {
        path: relativePath,
        data: await fs.readFile(fullPath),
      };
    },
  });
}

/** Capacity validation reads metadata only; content assessment is a separate action. */
export async function validateRepoPackageInventory(
  absoluteBasePath: string,
): Promise<void> {
  const { resolvedBasePath, realBasePath } = await resolveRepoBasePath(
    absoluteBasePath,
    { allowOutsideSkillsDir: true },
  );
  let totalBytes = 0;
  await walkRepoDir<void>({
    baseDir: resolvedBasePath,
    realBasePath,
    entryLimit: SKILL_PACKAGE_MAX_ENTRIES,
    onEntryLimit: ({ relativePath, limit }) => {
      throw new SkillPackageEntryLimitError({
        path: relativePath,
        observedEntries: limit + 1,
        limitEntries: limit,
      });
    },
    onEntry: async ({ fullPath, isDirectory }) => {
      if (isDirectory) return null;
      const { size } = await fs.stat(fullPath);
      totalBytes += size;
      if (
        size > MAX_SKILL_PACKAGE_FILE_BYTES ||
        totalBytes > MAX_SKILL_PACKAGE_TOTAL_BYTES
      ) {
        throw new Error("Skill package exceeds capacity limits");
      }
      return null;
    },
  });
}

export async function computeRepoDirectoryFingerprintByPath(
  absoluteBasePath: string,
): Promise<string> {
  const entries = await readRepoFileBuffers(absoluteBasePath);
  return computeSkillPackageFingerprintV1Sync(entries).fingerprint;
}

export async function walkRepoDir<T>(opts: {
  baseDir: string;
  entryLimit?: number;
  realBasePath: string;
  onEntryLimit?: (entry: { relativePath: string; limit: number }) => void;
  onEntry: (entry: {
    relativePath: string;
    fullPath: string;
    isDirectory: boolean;
    dirent: import("fs").Dirent;
  }) => Promise<T | null>;
}): Promise<T[]> {
  const { baseDir, entryLimit, realBasePath, onEntryLimit, onEntry } = opts;
  const results: T[] = [];
  const shouldIgnore = await loadSkillPackageIgnoreMatcher(baseDir);
  let visitedEntries = 0;
  let entryLimitReached = false;

  const recurse = async (dir: string, depth: number): Promise<void> => {
    if (
      entryLimitReached ||
      depth > MAX_WALK_DEPTH ||
      (entryLimit === undefined && results.length >= MAX_WALK_FILES)
    ) {
      return;
    }

    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const dirent of entries) {
      if (
        (entryLimit === undefined && results.length >= MAX_WALK_FILES) ||
        dirent.isSymbolicLink()
      ) {
        continue;
      }

      const fullPath = path.join(dir, dirent.name);
      const realFullPath = await fs.realpath(fullPath).catch(() => fullPath);
      if (!isPathWithin(realBasePath, realFullPath)) {
        continue;
      }

      const relativePath = path.relative(baseDir, fullPath);
      if (shouldIgnore(relativePath)) {
        continue;
      }

      if (entryLimit !== undefined && visitedEntries >= entryLimit) {
        entryLimitReached = true;
        onEntryLimit?.({ relativePath, limit: entryLimit });
        return;
      }
      visitedEntries += 1;

      const isDirectory = dirent.isDirectory();
      const item = await onEntry({
        relativePath,
        fullPath,
        isDirectory,
        dirent,
      });
      if (item !== null) {
        results.push(item);
      }

      if (isDirectory) {
        await recurse(fullPath, depth + 1);
      }
    }
  };

  await recurse(baseDir, 0);
  return results;
}

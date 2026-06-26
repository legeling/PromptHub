import * as childProcess from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";

import type { SkillDB } from "@prompthub/db";
import {
  SKILL_PLATFORMS,
  type SkillPlatform,
} from "@prompthub/shared/constants/platforms";
import type {
  ScannedSkill,
  Skill,
  SkillFileSnapshot,
  SkillLocalFileBufferEntry,
  SkillLocalFileEntry,
  SkillLocalFileTreeEntry,
  SkillManifest,
  SkillSafetyReport,
  SkillSafetyScanInput,
  SkillVersion,
} from "@prompthub/shared/types";
import { computeDirectoryFingerprint } from "@prompthub/shared/utils/skill-identity";

import { getSkillsDir } from "../runtime-paths";
import { installSkillFromSource } from "../skills/install-flow";

interface ParsedSkillMd {
  frontmatter: {
    name?: string;
    description?: string;
    version?: string;
    author?: string;
    tags?: string[];
    compatibility?: string;
  };
  body?: string;
}

function resolvePlatformPath(template: string): string {
  const home = os.homedir();
  return template
    .replace(/^~/, home)
    .replace(/%USERPROFILE%/gi, home)
    .replace(/%APPDATA%/gi, path.join(home, "AppData", "Roaming"));
}

function getPlatformSkillsDir(platform: SkillPlatform): string {
  const osKey = process.platform as "darwin" | "win32" | "linux";
  const rootDir = platform.rootDir[osKey] || platform.rootDir.linux;
  return resolvePlatformPath(
    [rootDir, platform.skillsRelativePath].filter(Boolean).join("/"),
  );
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function sanitizeString(
  value: unknown,
  fallback?: string,
): string | undefined {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed || fallback;
}

function sanitizeTags(primary: unknown, fallback: unknown): string[] {
  const source = Array.isArray(primary)
    ? primary
    : Array.isArray(fallback)
      ? fallback
      : [];

  return source
    .filter(
      (item): item is string =>
        typeof item === "string" && item.trim().length > 0,
    )
    .map((item) => item.trim());
}

function sanitizeStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value
    .filter(
      (item): item is string =>
        typeof item === "string" && item.trim().length > 0,
    )
    .map((item) => item.trim());

  return items.length > 0 ? items : undefined;
}

function sanitizeProtocolType(value: unknown): "skill" | "mcp" | "claude-code" {
  return value === "mcp" || value === "claude-code" ? value : "skill";
}

function validateSkillName(skillName: string): string {
  const normalizedName = skillName.trim();
  if (!normalizedName) {
    throw new Error("Invalid skill name: must not be empty");
  }
  if (normalizedName.includes("\0")) {
    throw new Error("Invalid skill name: must not contain null bytes");
  }
  if (
    normalizedName.includes("..") ||
    normalizedName.includes("/") ||
    normalizedName.includes("\\")
  ) {
    throw new Error(
      `Invalid skill name: must not contain "..", "/" or "\\": ${normalizedName}`,
    );
  }
  if (/^[a-zA-Z]:/.test(normalizedName)) {
    throw new Error(
      `Invalid skill name: must not be an absolute path: ${normalizedName}`,
    );
  }

  return normalizedName;
}

function parseSkillMd(content: string): ParsedSkillMd | null {
  if (!content || typeof content !== "string") {
    return null;
  }

  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!frontmatterMatch) {
    return { frontmatter: {}, body: content.trim() };
  }

  const body = content.slice(frontmatterMatch[0].length).trim();
  const frontmatter: ParsedSkillMd["frontmatter"] = {};
  for (const line of frontmatterMatch[1].split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, colonIndex).trim();
    let value = trimmed.slice(colonIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (value.startsWith("[") && value.endsWith("]")) {
      const items = value
        .slice(1, -1)
        .split(",")
        .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
      if (key === "tags") {
        frontmatter.tags = items;
      } else if (key === "compatibility") {
        frontmatter.compatibility = items.join(", ");
      }
      continue;
    }

    if (key === "name") frontmatter.name = value;
    if (key === "description") frontmatter.description = value;
    if (key === "version") frontmatter.version = value;
    if (key === "author") frontmatter.author = value;
    if (key === "compatibility") frontmatter.compatibility = value;
    if (key === "tags" && !frontmatter.tags) {
      frontmatter.tags = value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return { frontmatter, body };
}

function isInternalSkillRepoEntry(relativePath: string): boolean {
  return relativePath
    .split(/[\\/]+/)
    .some((segment) => INTERNAL_REPO_DIRS.has(segment));
}

function isPathWithin(basePath: string, targetPath: string): boolean {
  const relative = path.relative(basePath, targetPath);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

function validateRelativePath(relativePath: string): void {
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

async function normalizeExistingPath(absolutePath: string): Promise<string> {
  const resolvedPath = path.resolve(absolutePath);
  try {
    return await fs.realpath(resolvedPath);
  } catch {
    return resolvedPath;
  }
}

type FetchLike = typeof fetch;

const GIT_CLONE_TIMEOUT_MS = 60_000;
const INTERNAL_REPO_DIRS = new Set([".git", ".prompthub"]);
const MAX_WALK_DEPTH = 5;
const MAX_WALK_FILES = 500;
const MAX_FILE_SIZE_BYTES = 1_048_576;
const MAX_PREVIEW_FILE_SIZE_BYTES = 5 * 1_048_576;
const TEXT_EXTENSIONS = new Set([
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
const PREVIEW_MIME_TYPES = new Map<
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

async function fetchRemoteContent(
  sourceUrl: string,
  fetchImpl: FetchLike,
): Promise<string> {
  const parsedUrl = new URL(sourceUrl);
  if (parsedUrl.protocol !== "https:") {
    throw new Error("Only HTTPS skill URLs are supported");
  }

  const response = await fetchImpl(sourceUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch remote skill: ${response.status} ${response.statusText}`,
    );
  }

  return response.text();
}

async function gitClone(url: string, destinationDir: string): Promise<void> {
  if (!url.trim()) {
    throw new Error("Git clone URL cannot be empty");
  }
  if (url.startsWith("-")) {
    throw new Error("Git clone URL cannot start with '-'");
  }

  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== "https:") {
    throw new Error("Only HTTPS Git clone URLs are allowed");
  }

  await new Promise<void>((resolve, reject) => {
    const processRef = childProcess.spawn(
      "git",
      ["clone", "--depth", "1", "--", url, destinationDir],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      processRef.kill("SIGKILL");
      reject(
        new Error(
          `Git clone timed out after ${GIT_CLONE_TIMEOUT_MS / 1000}s for URL: ${url}`,
        ),
      );
    }, GIT_CLONE_TIMEOUT_MS);

    processRef.stderr?.on("data", (data: Buffer | string) => {
      stderr += data.toString();
    });

    processRef.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Git clone failed with code ${code}: ${stderr}`));
    });

    processRef.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(new Error(`Git clone error: ${error.message}`));
    });
  });
}

async function readManifest(skillDir: string): Promise<SkillManifest> {
  const manifestPath = path.join(skillDir, "manifest.json");
  try {
    const content = await fs.readFile(manifestPath, "utf-8");
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return {
      name: sanitizeString(parsed.name),
      description: sanitizeString(parsed.description),
      version: sanitizeString(parsed.version),
      author: sanitizeString(parsed.author),
      tags: sanitizeTags(parsed.tags, undefined),
      instructions: sanitizeString(parsed.instructions),
    };
  } catch (error) {
    const errorCode =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : undefined;
    if (errorCode === "ENOENT") {
      return {};
    }
    throw new Error(
      `Failed to parse manifest.json in ${skillDir}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function saveRepo(skillName: string, sourceDir: string): Promise<string> {
  const managedSkillsDir = getSkillsDir();
  const destinationDir = path.join(
    managedSkillsDir,
    validateSkillName(skillName),
  );
  await fs.mkdir(managedSkillsDir, { recursive: true });

  if (await fileExists(destinationDir)) {
    await fs.rm(destinationDir, { recursive: true, force: true });
  }

  await fs.cp(sourceDir, destinationDir, {
    recursive: true,
    filter: async (sourcePath: string) => {
      try {
        const stat = await fs.lstat(sourcePath);
        return !stat.isSymbolicLink();
      } catch {
        return false;
      }
    },
  });

  return destinationDir;
}

async function copyRepoToPlatform(
  sourceDir: string,
  destinationDir: string,
): Promise<void> {
  await fs.rm(destinationDir, { recursive: true, force: true });
  await fs.cp(sourceDir, destinationDir, {
    recursive: true,
    filter: async (_sourcePath: string, targetPath: string) => {
      const relativePath = path.relative(destinationDir, targetPath);
      if (!relativePath || relativePath === "") {
        return true;
      }

      return !isInternalSkillRepoEntry(relativePath);
    },
  });
}

async function saveContent(
  skillName: string,
  content: string,
): Promise<string> {
  const managedSkillsDir = getSkillsDir();
  const destinationDir = path.join(
    managedSkillsDir,
    validateSkillName(skillName),
  );
  await fs.mkdir(destinationDir, { recursive: true });
  await fs.writeFile(path.join(destinationDir, "SKILL.md"), content, "utf-8");
  return destinationDir;
}

async function installFromSkillContent(
  skillContent: string,
  skillDb: SkillDB,
  options?: {
    name?: string;
    sourceUrl?: string;
    repoSourceDir?: string;
  },
): Promise<string> {
  const parsed = parseSkillMd(skillContent);
  const manifest = options?.repoSourceDir
    ? await readManifest(options.repoSourceDir)
    : {};
  const fallbackName = options?.repoSourceDir
    ? path.basename(options.repoSourceDir)
    : undefined;
  const skillName =
    sanitizeString(options?.name) ||
    sanitizeString(parsed?.frontmatter.name) ||
    sanitizeString(manifest.name) ||
    fallbackName;

  if (!skillName) {
    throw new Error(
      "Skill name is required; pass --name or add SKILL.md frontmatter",
    );
  }

  const normalizedName = validateSkillName(skillName);
  const localRepoPath = options?.repoSourceDir
    ? await saveRepo(normalizedName, options.repoSourceDir)
    : await saveContent(normalizedName, skillContent);
  const directoryFingerprint =
    await computeRepoDirectoryFingerprintByPath(localRepoPath);

  return skillDb.create({
    name: normalizedName,
    description:
      sanitizeString(
        parsed?.frontmatter.description,
        sanitizeString(
          manifest.description,
          `Installed from ${options?.sourceUrl ?? "local source"}`,
        ),
      ) || `Installed from ${options?.sourceUrl ?? "local source"}`,
    instructions: skillContent,
    content: skillContent,
    protocol_type: "skill",
    version:
      sanitizeString(
        parsed?.frontmatter.version,
        sanitizeString(manifest.version, "1.0.0"),
      ) || "1.0.0",
    author:
      sanitizeString(
        parsed?.frontmatter.author,
        sanitizeString(manifest.author, "Local"),
      ) || "Local",
    tags: [],
    original_tags: sanitizeTags(parsed?.frontmatter.tags, manifest.tags),
    is_favorite: false,
    source_url: options?.sourceUrl,
    local_repo_path: localRepoPath,
    directory_fingerprint: directoryFingerprint,
  }).id;
}

async function installFromGithub(
  sourceUrl: string,
  skillDb: SkillDB,
  gitCloneImpl: typeof gitClone,
): Promise<string> {
  const matches = sourceUrl.match(
    /^https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/,
  );
  if (!matches) {
    throw new Error(
      "Invalid GitHub URL: must be https://github.com/{owner}/{repo}",
    );
  }

  const owner = matches[1];
  const repoName = matches[2];
  const installDir = path.join(getSkillsDir(), `${owner}-${repoName}`);
  const relative = path.relative(
    path.resolve(getSkillsDir()),
    path.resolve(installDir),
  );
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(
      "Path traversal detected: installDir is outside skills directory",
    );
  }

  try {
    await fs.access(installDir);
    throw new Error(
      `Skill ${owner}/${repoName} already exists. Please delete it first.`,
    );
  } catch (error) {
    const errorCode =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : undefined;
    if (errorCode !== "ENOENT") {
      throw error;
    }
  }

  const existingByName = skillDb.getByName(repoName);
  if (existingByName) {
    throw new Error(
      `A skill named "${repoName}" already exists in the library (id: ${existingByName.id}). Delete it first or use a different repository.`,
    );
  }

  try {
    await fs.mkdir(path.dirname(installDir), { recursive: true });
    await gitCloneImpl(sourceUrl, installDir);
    const skillDir = await resolveSingleSkillDirFromRepo(installDir);
    const manifest = await readManifest(skillDir);

    if (!manifest.instructions) {
      try {
        manifest.instructions = await fs.readFile(
          path.join(skillDir, "SKILL.md"),
          "utf-8",
        );
      } catch {
        // Fall through to README fallback.
      }
    }

    if (!manifest.instructions) {
      try {
        manifest.instructions = await fs.readFile(
          path.join(installDir, "README.md"),
          "utf-8",
        );
      } catch {
        // Leave empty if no markdown entry file exists.
      }
    }

    return skillDb.create({
      name: manifest.name || repoName,
      description: manifest.description || `Installed from ${sourceUrl}`,
      version: manifest.version || "1.0.0",
      author: manifest.author || owner,
      content: manifest.instructions || "",
      instructions: manifest.instructions || "",
      protocol_type: "skill",
      source_url: sourceUrl,
      local_repo_path: skillDir,
      directory_fingerprint:
        await computeRepoDirectoryFingerprintByPath(skillDir),
      is_favorite: false,
      tags: [],
      original_tags: manifest.tags || ["github"],
    }).id;
  } catch (error) {
    await fs
      .rm(installDir, { recursive: true, force: true })
      .catch(() => undefined);
    throw error;
  }
}

async function resolveRepoBasePath(
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

async function resolveRepoTargetPath(
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

async function readFileContent(
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

async function readRepoFileBuffers(
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
    realBasePath,
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

async function computeRepoDirectoryFingerprintByPath(
  absoluteBasePath: string,
): Promise<string> {
  const entries = await readRepoFileBuffers(absoluteBasePath);
  return computeDirectoryFingerprint(entries);
}

async function walkRepoDir<T>(opts: {
  baseDir: string;
  realBasePath: string;
  onEntry: (entry: {
    relativePath: string;
    fullPath: string;
    isDirectory: boolean;
    dirent: import("fs").Dirent;
  }) => Promise<T | null>;
}): Promise<T[]> {
  const { baseDir, realBasePath, onEntry } = opts;
  const results: T[] = [];

  const recurse = async (dir: string, depth: number): Promise<void> => {
    if (depth > MAX_WALK_DEPTH || results.length >= MAX_WALK_FILES) {
      return;
    }

    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const dirent of entries) {
      if (results.length >= MAX_WALK_FILES || dirent.isSymbolicLink()) {
        continue;
      }

      const fullPath = path.join(dir, dirent.name);
      const realFullPath = await fs.realpath(fullPath).catch(() => fullPath);
      if (!isPathWithin(realBasePath, realFullPath)) {
        continue;
      }

      const relativePath = path.relative(baseDir, fullPath);
      if (isInternalSkillRepoEntry(relativePath)) {
        continue;
      }

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

async function importFromJson(
  jsonContent: string,
  skillDb: SkillDB,
): Promise<string> {
  const parsed = JSON.parse(jsonContent) as Record<string, unknown>;
  const skillName = sanitizeString(parsed.name)?.trim();
  if (!skillName) {
    throw new Error("Invalid skill JSON: missing name");
  }

  return skillDb.create({
    name: skillName,
    description: sanitizeString(parsed.description),
    version: sanitizeString(parsed.version),
    author: sanitizeString(parsed.author),
    instructions: sanitizeString(parsed.instructions),
    content: sanitizeString(parsed.instructions),
    protocol_type: sanitizeProtocolType(parsed.protocol_type),
    tags: sanitizeTags(parsed.tags, ["imported"]),
    is_favorite: false,
    icon_url: sanitizeString(parsed.icon_url),
    icon_emoji: sanitizeString(parsed.icon_emoji),
    icon_background: sanitizeString(parsed.icon_background),
    prerequisites: sanitizeStringList(parsed.prerequisites),
    compatibility: sanitizeStringList(parsed.compatibility),
    source_url: sanitizeString(parsed.source_url),
  }).id;
}

async function collectSkillDirs(scanPath: string): Promise<string[]> {
  if (!(await fileExists(scanPath))) {
    return [];
  }

  const entries = await fs.readdir(scanPath, { withFileTypes: true });
  const skillDirs: string[] = [];
  const baseDirs = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => path.join(scanPath, entry.name));

  for (const baseDir of baseDirs) {
    if (await fileExists(path.join(baseDir, "SKILL.md"))) {
      skillDirs.push(baseDir);
      continue;
    }

    try {
      const nestedEntries = await fs.readdir(baseDir, { withFileTypes: true });
      for (const nestedEntry of nestedEntries) {
        if (!nestedEntry.isDirectory() || nestedEntry.name.startsWith(".")) {
          continue;
        }

        const nestedDir = path.join(baseDir, nestedEntry.name);
        if (await fileExists(path.join(nestedDir, "SKILL.md"))) {
          skillDirs.push(nestedDir);
        }
      }
    } catch {
      // Ignore unreadable nested directories during scan preview.
    }
  }

  return skillDirs;
}

async function resolveSingleSkillDirFromRepo(
  repoRoot: string,
): Promise<string> {
  if (await fileExists(path.join(repoRoot, "SKILL.md"))) {
    return repoRoot;
  }

  const skillDirs = await collectSkillDirs(repoRoot);
  if (skillDirs.length === 1) {
    return skillDirs[0];
  }
  if (skillDirs.length === 0) {
    throw new Error(`SKILL.md not found in repository: ${repoRoot}`);
  }

  throw new Error(
    `Multiple skill directories found in repository: ${repoRoot}. Install a specific skill directory instead of the repo root.`,
  );
}

function markNameConflicts(results: ScannedSkill[], skillDb?: SkillDB): void {
  const counts = new Map<string, number>();
  for (const result of results) {
    const key = result.name.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  for (const result of results) {
    if ((counts.get(result.name.toLowerCase()) ?? 0) > 1) {
      result.nameConflict = true;
      continue;
    }

    if (skillDb?.getByName(result.name)) {
      result.nameConflict = true;
    }
  }
}

export interface CliSkillService {
  createVersion(
    skillDb: SkillDB,
    skillId: string,
    note?: string,
  ): Promise<import("@prompthub/shared/types").SkillVersion | null>;
  deleteLocalFile(
    skillDb: SkillDB,
    skillId: string,
    relativePath: string,
  ): Promise<void>;
  deleteRepoByPath(absolutePath: string): Promise<void>;
  deleteVersion(
    skillDb: SkillDB,
    skillId: string,
    versionId: string,
  ): Promise<boolean>;
  detectInstalledPlatforms(): Promise<string[]>;
  exportAsJson(skill: import("@prompthub/shared/types").Skill): string;
  exportAsSkillMd(skill: import("@prompthub/shared/types").Skill): string;
  getSupportedPlatforms(): SkillPlatform[];
  getSkillMdInstallStatus(skillName: string): Promise<Record<string, boolean>>;
  installFromSource(
    source: string,
    skillDb: SkillDB,
    options?: { name?: string },
  ): Promise<string>;
  installSkillMd(
    skillDb: SkillDB,
    skillName: string,
    skillMdContent: string,
    platformId: string,
  ): Promise<void>;
  installSkillToProject(
    skillDb: SkillDB,
    skillId: string,
    options: {
      projectRoot?: string;
      targetRootDir?: string;
      mode?: "copy" | "symlink";
      ifExists?: "skip" | "overwrite" | "error";
    },
  ): Promise<{
    status: "installed" | "updated" | "skipped";
    skillId: string;
    skillName: string;
    projectRoot: string;
    targetRootDir: string;
    skillDir: string;
    mode: "copy" | "symlink";
  }>;
  isManagedRepoPath(absolutePath: string): Promise<boolean>;
  listLocalFiles(
    skillDb: SkillDB,
    skillId: string,
  ): Promise<SkillLocalFileTreeEntry[]>;
  readCurrentFilesSnapshot(
    skillDb: SkillDB,
    skillId: string,
  ): Promise<SkillFileSnapshot[] | undefined>;
  readLocalFile(
    skillDb: SkillDB,
    skillId: string,
    relativePath: string,
  ): Promise<SkillLocalFileEntry | null>;
  renameLocalPath(
    skillDb: SkillDB,
    skillId: string,
    oldRelativePath: string,
    newRelativePath: string,
  ): Promise<void>;
  replaceRepoFiles(
    skillDb: SkillDB,
    skillId: string,
    filesSnapshot?: SkillFileSnapshot[],
  ): Promise<void>;
  rollbackVersion(
    skillDb: SkillDB,
    skillId: string,
    version: number,
  ): Promise<import("@prompthub/shared/types").Skill | null>;
  scanLocalPreview(
    customPaths?: string[],
    skillDb?: SkillDB,
  ): Promise<ScannedSkill[]>;
  scanSafety(input: SkillSafetyScanInput): Promise<SkillSafetyReport>;
  syncFromRepo(
    skillDb: SkillDB,
    skillId: string,
  ): Promise<import("@prompthub/shared/types").Skill | null>;
  uninstallSkillMd(skillName: string, platformId: string): Promise<void>;
  writeLocalFile(
    skillDb: SkillDB,
    skillId: string,
    relativePath: string,
    content: string,
  ): Promise<void>;
  createLocalDir(
    skillDb: SkillDB,
    skillId: string,
    relativePath: string,
  ): Promise<void>;
}

export interface CliSkillServiceDeps {
  fetchImpl?: FetchLike;
  gitCloneImpl?: typeof gitClone;
}

export function createCliSkillService(
  deps: CliSkillServiceDeps = {},
): CliSkillService {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const gitCloneImpl = deps.gitCloneImpl ?? gitClone;
  async function isManagedRepoPath(absolutePath: string): Promise<boolean> {
    const managedSkillsDir = path.resolve(getSkillsDir());
    const targetPath = path.resolve(absolutePath);
    const relative = path.relative(managedSkillsDir, targetPath);
    return !relative.startsWith("..") && !path.isAbsolute(relative);
  }

  async function deleteRepoByPath(absolutePath: string): Promise<void> {
    await fs.rm(path.resolve(absolutePath), { recursive: true, force: true });
  }

  async function resolveSkill(
    skillDb: SkillDB,
    skillId: string,
  ): Promise<Skill> {
    const skill = skillDb.getById(skillId) ?? skillDb.getByName(skillId);
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }
    return skill;
  }

  async function getRepoPathForSkill(
    skillDb: SkillDB,
    skillId: string,
  ): Promise<string | null> {
    const skill = await resolveSkill(skillDb, skillId);

    if (
      skill.local_repo_path &&
      (await isManagedRepoPath(skill.local_repo_path))
    ) {
      return skill.local_repo_path;
    }

    if (skill.local_repo_path) {
      try {
        const stat = await fs.stat(skill.local_repo_path);
        if (stat.isDirectory()) {
          const saved = await saveRepo(skill.name, skill.local_repo_path);
          const directoryFingerprint =
            await computeRepoDirectoryFingerprintByPath(saved);
          if (saved !== skill.local_repo_path) {
            skillDb.update(skill.id, {
              local_repo_path: saved,
              directory_fingerprint: directoryFingerprint,
            });
          } else {
            skillDb.update(skill.id, {
              directory_fingerprint: directoryFingerprint,
            });
          }
          return saved;
        }
      } catch {
        // fall through to content bootstrap
      }
    }

    const content = skill.instructions || skill.content || "";
    if (!content.trim()) {
      return null;
    }

    const saved = await saveContent(skill.name, content);
    const directoryFingerprint =
      await computeRepoDirectoryFingerprintByPath(saved);
    if (saved !== skill.local_repo_path) {
      skillDb.update(skill.id, {
        local_repo_path: saved,
        directory_fingerprint: directoryFingerprint,
      });
    } else {
      skillDb.update(skill.id, {
        directory_fingerprint: directoryFingerprint,
      });
    }
    return saved;
  }

  async function getRepoPathForSkillName(
    skillDb: SkillDB,
    skillName: string,
  ): Promise<string | null> {
    const skill = skillDb.getByName(skillName);
    if (!skill) {
      return null;
    }

    return getRepoPathForSkill(skillDb, skill.id);
  }

  async function resolveRepoPathForSkill(
    skillDb: SkillDB,
    skillId: string,
  ): Promise<string> {
    const repoPath = await getRepoPathForSkill(skillDb, skillId);
    if (!repoPath) {
      throw new Error(`Unable to resolve local repo for skill: ${skillId}`);
    }
    return repoPath;
  }

  async function listLocalFiles(
    skillDb: SkillDB,
    skillId: string,
  ): Promise<SkillLocalFileTreeEntry[]> {
    const repoPath = await resolveRepoPathForSkill(skillDb, skillId);
    return walkRepoDir<SkillLocalFileTreeEntry>({
      baseDir: repoPath,
      realBasePath: await normalizeExistingPath(repoPath),
      onEntry: async ({ relativePath, fullPath, isDirectory }) => {
        if (isDirectory) {
          return { path: relativePath, isDirectory: true };
        }
        const stat = await fs.stat(fullPath);
        return { path: relativePath, isDirectory: false, size: stat.size };
      },
    });
  }

  async function readLocalFiles(
    skillDb: SkillDB,
    skillId: string,
  ): Promise<SkillLocalFileEntry[]> {
    const repoPath = await resolveRepoPathForSkill(skillDb, skillId);
    return walkRepoDir<SkillLocalFileEntry>({
      baseDir: repoPath,
      realBasePath: await normalizeExistingPath(repoPath),
      onEntry: async ({ relativePath, fullPath, isDirectory, dirent }) => {
        if (isDirectory) {
          return { path: relativePath, content: "", isDirectory: true };
        }
        const contentInfo = await readFileContent(fullPath, dirent.name);
        return {
          path: relativePath,
          ...contentInfo,
          isDirectory: false,
        };
      },
    });
  }

  async function readLocalFile(
    skillDb: SkillDB,
    skillId: string,
    relativePath: string,
  ): Promise<SkillLocalFileEntry | null> {
    const repoPath = await resolveRepoPathForSkill(skillDb, skillId);
    const { fullPath } = await resolveRepoTargetPath(repoPath, relativePath, {
      ensureBaseExists: false,
      allowOutsideSkillsDir: true,
    });
    if (!(await fileExists(fullPath))) {
      return null;
    }
    const stat = await fs.stat(fullPath);
    if (stat.isDirectory()) {
      return { path: relativePath, content: "", isDirectory: true };
    }
    const contentInfo = await readFileContent(
      fullPath,
      path.basename(fullPath),
      {
        includePreviewData: true,
      },
    );
    return {
      path: relativePath,
      ...contentInfo,
      isDirectory: false,
    };
  }

  async function writeLocalFile(
    skillDb: SkillDB,
    skillId: string,
    relativePath: string,
    content: string,
  ): Promise<void> {
    const repoPath = await resolveRepoPathForSkill(skillDb, skillId);
    const { fullPath } = await resolveRepoTargetPath(repoPath, relativePath, {
      ensureBaseExists: true,
      allowOutsideSkillsDir: true,
    });
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");
  }

  async function deleteLocalFile(
    skillDb: SkillDB,
    skillId: string,
    relativePath: string,
  ): Promise<void> {
    const repoPath = await resolveRepoPathForSkill(skillDb, skillId);
    const { fullPath } = await resolveRepoTargetPath(repoPath, relativePath, {
      ensureBaseExists: false,
      allowOutsideSkillsDir: true,
    });
    await fs.rm(fullPath, { recursive: true, force: true });
  }

  async function createLocalDir(
    skillDb: SkillDB,
    skillId: string,
    relativePath: string,
  ): Promise<void> {
    const repoPath = await resolveRepoPathForSkill(skillDb, skillId);
    const { fullPath } = await resolveRepoTargetPath(repoPath, relativePath, {
      ensureBaseExists: true,
      allowOutsideSkillsDir: true,
    });
    await fs.mkdir(fullPath, { recursive: true });
  }

  async function renameLocalPath(
    skillDb: SkillDB,
    skillId: string,
    oldRelativePath: string,
    newRelativePath: string,
  ): Promise<void> {
    const repoPath = await resolveRepoPathForSkill(skillDb, skillId);
    const { fullPath: oldFullPath } = await resolveRepoTargetPath(
      repoPath,
      oldRelativePath,
      { ensureBaseExists: false, allowOutsideSkillsDir: true },
    );
    const { fullPath: newFullPath } = await resolveRepoTargetPath(
      repoPath,
      newRelativePath,
      { ensureBaseExists: true, allowOutsideSkillsDir: true },
    );
    await fs.mkdir(path.dirname(newFullPath), { recursive: true });
    await fs.rename(oldFullPath, newFullPath);
  }

  async function replaceRepoFiles(
    skillDb: SkillDB,
    skillId: string,
    filesSnapshot?: SkillFileSnapshot[],
  ): Promise<void> {
    if (!filesSnapshot) {
      return;
    }
    const repoPath = await resolveRepoPathForSkill(skillDb, skillId);
    await fs.rm(repoPath, { recursive: true, force: true });
    await fs.mkdir(repoPath, { recursive: true });
    for (const file of filesSnapshot) {
      await writeLocalFile(skillDb, skillId, file.relativePath, file.content);
    }
  }

  async function createVersion(
    skillDb: SkillDB,
    skillId: string,
    note?: string,
  ): Promise<SkillVersion | null> {
    const snapshot = await createLocalRepoSnapshot(skillDb, skillId);
    return skillDb.createVersion(skillId, note, snapshot);
  }

  async function deleteVersion(
    skillDb: SkillDB,
    skillId: string,
    versionId: string,
  ): Promise<boolean> {
    return skillDb.deleteVersion(skillId, versionId);
  }

  async function rollbackVersion(
    skillDb: SkillDB,
    skillId: string,
    version: number,
  ): Promise<Skill | null> {
    const skill = await resolveSkill(skillDb, skillId);
    const targetVersion = skillDb.getVersion(skill.id, version);
    if (!targetVersion) {
      return null;
    }
    const currentFilesSnapshot = await createLocalRepoSnapshot(
      skillDb,
      skill.id,
    );
    await skillDb.createVersion(
      skill.id,
      `Rollback before restoring v${version}`,
      currentFilesSnapshot,
      skill,
    );
    const updatedSkill = skillDb.update(skill.id, {
      content: targetVersion.content,
      instructions: targetVersion.content,
    });
    await replaceRepoFiles(skillDb, skill.id, targetVersion.filesSnapshot);
    return updatedSkill;
  }

  async function syncFromRepo(
    skillDb: SkillDB,
    skillId: string,
  ): Promise<Skill | null> {
    const skill = await resolveSkill(skillDb, skillId);
    const repoPath = await getRepoPathForSkill(skillDb, skill.id);
    if (!repoPath) {
      return skill;
    }
    const files = await readLocalFiles(skillDb, skill.id);
    const skillMdFile = files.find(
      (file) => !file.isDirectory && file.path.toLowerCase() === "skill.md",
    );
    if (!skillMdFile?.content) {
      return skill;
    }
    const parsed = parseSkillMd(skillMdFile.content);
    const update: import("@prompthub/shared/types").UpdateSkillParams = {
      content: skillMdFile.content,
      instructions: skillMdFile.content,
    };
    if (parsed?.frontmatter.description !== undefined) {
      update.description = parsed.frontmatter.description;
    }
    if (parsed?.frontmatter.version !== undefined) {
      update.version = parsed.frontmatter.version;
    }
    if (parsed?.frontmatter.author !== undefined) {
      update.author = parsed.frontmatter.author;
    }
    if (parsed?.frontmatter.tags !== undefined) {
      update.tags = parsed.frontmatter.tags;
    }
    update.directory_fingerprint =
      await computeRepoDirectoryFingerprintByPath(repoPath);
    return skillDb.update(skill.id, update);
  }

  async function installSkillMd(
    skillDb: SkillDB,
    skillName: string,
    skillMdContent: string,
    platformId: string,
  ): Promise<void> {
    const platform = SKILL_PLATFORMS.find((item) => item.id === platformId);
    if (!platform) {
      throw new Error(`Unknown platform: ${platformId}`);
    }
    const canonicalRepoPath =
      (await getRepoPathForSkillName(skillDb, skillName)) ??
      (await saveContent(skillName, skillMdContent));
    const skillDir = path.join(
      getPlatformSkillsDir(platform),
      validateSkillName(skillName),
    );
    await fs.mkdir(path.dirname(skillDir), { recursive: true });
    await copyRepoToPlatform(canonicalRepoPath, skillDir);
  }

  async function installSkillToProject(
    skillDb: SkillDB,
    skillId: string,
    options: {
      projectRoot?: string;
      targetRootDir?: string;
      mode?: "copy" | "symlink";
      ifExists?: "skip" | "overwrite" | "error";
    },
  ): Promise<{
    status: "installed" | "updated" | "skipped";
    skillId: string;
    skillName: string;
    projectRoot: string;
    targetRootDir: string;
    skillDir: string;
    mode: "copy" | "symlink";
  }> {
    const skill = await resolveSkill(skillDb, skillId);
    const repoPath = await resolveRepoPathForSkill(skillDb, skill.id);
    const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
    const targetRootDir = path.resolve(
      options.targetRootDir ?? path.join(projectRoot, ".agents", "skills"),
    );
    const skillName = validateSkillName(skill.name);
    const skillDir = path.join(targetRootDir, skillName);
    const mode = options.mode ?? "copy";
    const ifExists = options.ifExists ?? "skip";
    const canonicalRepoPath = await fs.realpath(repoPath);

    if (
      canonicalRepoPath === skillDir ||
      path.resolve(repoPath) === skillDir ||
      isPathWithin(canonicalRepoPath, targetRootDir) ||
      isPathWithin(path.resolve(repoPath), targetRootDir)
    ) {
      throw new Error(
        `Target directory must not be the source skill directory or inside it: ${targetRootDir}`,
      );
    }

    await fs.mkdir(targetRootDir, { recursive: true });
    const existed = await fileExists(skillDir);
    if (existed) {
      if (ifExists === "skip") {
        return {
          status: "skipped",
          skillId: skill.id,
          skillName,
          projectRoot,
          targetRootDir,
          skillDir,
          mode,
        };
      }
      if (ifExists === "error") {
        throw new Error(
          `Skill already exists in target directory: ${skillDir}`,
        );
      }
      await fs.rm(skillDir, { recursive: true, force: true });
    }

    if (mode === "symlink") {
      await fs.symlink(canonicalRepoPath, skillDir, "dir");
    } else {
      await copyRepoToPlatform(canonicalRepoPath, skillDir);
    }

    return {
      status: existed ? "updated" : "installed",
      skillId: skill.id,
      skillName,
      projectRoot,
      targetRootDir,
      skillDir,
      mode,
    };
  }

  async function uninstallSkillMd(
    skillName: string,
    platformId: string,
  ): Promise<void> {
    const platform = SKILL_PLATFORMS.find((item) => item.id === platformId);
    if (!platform) {
      throw new Error(`Unknown platform: ${platformId}`);
    }
    const skillDir = path.join(
      getPlatformSkillsDir(platform),
      validateSkillName(skillName),
    );
    if (await fileExists(skillDir)) {
      await fs.rm(skillDir, { recursive: true, force: true });
    }
  }

  function getSupportedPlatforms(): SkillPlatform[] {
    return SKILL_PLATFORMS;
  }

  async function detectInstalledPlatforms(): Promise<string[]> {
    const installed: string[] = [];
    for (const platform of SKILL_PLATFORMS) {
      const skillsDir = getPlatformSkillsDir(platform);
      const parentDir = path.dirname(skillsDir);
      if (await fileExists(parentDir)) {
        installed.push(platform.id);
      }
    }
    return installed;
  }

  async function getSkillMdInstallStatus(
    skillName: string,
  ): Promise<Record<string, boolean>> {
    const status: Record<string, boolean> = {};
    for (const platform of SKILL_PLATFORMS) {
      const skillDir = path.join(
        getPlatformSkillsDir(platform),
        validateSkillName(skillName),
      );
      status[platform.id] = await fileExists(skillDir);
    }
    return status;
  }

  function exportAsSkillMd(skill: Skill): string {
    const yamlStr = (v: string): string =>
      /[:#\[\]{},\n\r\\]/.test(v)
        ? `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
        : v;
    const body = skill.instructions || skill.content || "";
    const frontmatter: string[] = ["---"];
    frontmatter.push(`name: ${yamlStr(skill.name)}`);
    if (skill.description)
      frontmatter.push(`description: ${yamlStr(skill.description)}`);
    if (skill.version) frontmatter.push(`version: ${yamlStr(skill.version)}`);
    if (skill.author) frontmatter.push(`author: ${yamlStr(skill.author)}`);
    if (skill.tags && skill.tags.length > 0) {
      frontmatter.push(`tags: [${skill.tags.map(yamlStr).join(", ")}]`);
    }
    const compatibility = Array.isArray(skill.compatibility)
      ? skill.compatibility
      : [skill.compatibility || "prompthub"];
    frontmatter.push(
      `compatibility: [${compatibility.map(yamlStr).join(", ")}]`,
    );
    frontmatter.push("---");
    frontmatter.push("");
    return `${frontmatter.join("\n")}${body}`;
  }

  function exportAsJson(skill: Skill): string {
    return JSON.stringify(
      {
        name: skill.name,
        description: skill.description || "",
        version: skill.version || "1.0.0",
        author: skill.author || "",
        tags: skill.tags || [],
        instructions: skill.instructions || "",
        protocol_type: skill.protocol_type || "skill",
        source_url: skill.source_url || "",
        icon_url: skill.icon_url || "",
        icon_emoji: skill.icon_emoji || "",
        icon_background: skill.icon_background || "",
        exported_at: new Date().toISOString(),
        format_version: "1.0",
      },
      null,
      2,
    );
  }

  function scanSafety(input: SkillSafetyScanInput): Promise<SkillSafetyReport> {
    const text = [
      input.content ?? "",
      input.sourceUrl ?? "",
      input.contentUrl ?? "",
      input.localRepoPath ?? "",
    ].join("\n");
    const findings: SkillSafetyReport["findings"] = [];
    if (/\b(?:sudo|rm\s+-rf|powershell|wget|curl)\b/i.test(text)) {
      findings.push({
        code: "dangerous-command",
        severity: "high",
        title: "Detected potentially dangerous command",
        detail: "CLI safety scan detected a high-risk command pattern.",
        evidence: text.slice(0, 160),
      });
    }

    return Promise.resolve({
      level: findings.length > 0 ? "warn" : "safe",
      summary:
        findings.length > 0
          ? "Potentially risky content detected."
          : "No obvious issues detected.",
      findings,
      recommendedAction: findings.length > 0 ? "review" : "allow",
      scannedAt: Date.now(),
      checkedFileCount: input.content ? 1 : 0,
      scanMethod: "ai",
      score: findings.length > 0 ? 60 : 95,
    });
  }

  async function createLocalRepoSnapshot(
    skillDb: SkillDB,
    skillId: string,
  ): Promise<SkillFileSnapshot[]> {
    const files = await readLocalFiles(skillDb, skillId);
    return files
      .filter(
        (file) => !file.isDirectory && !isInternalSkillRepoEntry(file.path),
      )
      .map((file) => ({ relativePath: file.path, content: file.content }));
  }

  return {
    createVersion,
    createLocalDir,
    deleteLocalFile,
    deleteRepoByPath,
    deleteVersion,
    detectInstalledPlatforms,
    exportAsJson,
    exportAsSkillMd,
    getSupportedPlatforms,
    getSkillMdInstallStatus,
    installFromSource: async (
      source: string,
      skillDb: SkillDB,
      options?: { name?: string },
    ): Promise<string> =>
      installSkillFromSource(
        source,
        skillDb,
        {
          fetchRemoteContent: (sourceUrl) =>
            fetchRemoteContent(sourceUrl, fetchImpl),
          importFromJson,
          installFromGithub: (sourceUrl, targetSkillDb) =>
            installFromGithub(sourceUrl, targetSkillDb, gitCloneImpl),
          installFromSkillContent,
        },
        options,
      ),
    installSkillMd,
    installSkillToProject,
    isManagedRepoPath,
    listLocalFiles,
    readCurrentFilesSnapshot: createLocalRepoSnapshot,
    readLocalFile,
    renameLocalPath,
    replaceRepoFiles,
    rollbackVersion,
    scanLocalPreview: async (customPaths?: string[], skillDb?: SkillDB) => {
      const skillMap = new Map<string, ScannedSkill>();
      const scanEntries =
        customPaths && customPaths.length > 0
          ? customPaths
              .map((customPath) => resolvePlatformPath(customPath.trim()))
              .filter(Boolean)
              .map((scanPath) => ({ path: scanPath, platformName: "Custom" }))
          : [
              { path: getSkillsDir(), platformName: "PromptHub" },
              ...SKILL_PLATFORMS.map((platform) => ({
                path: getPlatformSkillsDir(platform),
                platformName: platform.name,
              })),
            ];

      await Promise.all(
        scanEntries.map(async ({ path: scanPath, platformName }) => {
          if (!(await fileExists(scanPath))) {
            return;
          }

          const skillDirs = await collectSkillDirs(scanPath);
          for (const skillFolderPath of skillDirs) {
            const skillMdPath = path.join(skillFolderPath, "SKILL.md");
            try {
              const instructions = await fs.readFile(skillMdPath, "utf-8");
              const manifest = await readManifest(skillFolderPath);
              const parsed = parseSkillMd(instructions);
              const name =
                sanitizeString(parsed?.frontmatter.name) ||
                sanitizeString(manifest.name) ||
                path.basename(skillFolderPath);
              if (!name) {
                continue;
              }

              const existing = skillMap.get(skillFolderPath);
              if (existing) {
                if (!existing.platforms.includes(platformName)) {
                  existing.platforms.push(platformName);
                }
                continue;
              }

              skillMap.set(skillFolderPath, {
                name,
                description:
                  sanitizeString(
                    parsed?.frontmatter.description,
                    sanitizeString(manifest.description, ""),
                  ) || "",
                version: sanitizeString(
                  parsed?.frontmatter.version,
                  sanitizeString(manifest.version),
                ),
                author:
                  sanitizeString(
                    parsed?.frontmatter.author,
                    sanitizeString(manifest.author, "Local"),
                  ) || "Local",
                tags: sanitizeTags(parsed?.frontmatter.tags, manifest.tags),
                instructions,
                directory_fingerprint:
                  await computeRepoDirectoryFingerprintByPath(skillFolderPath),
                filePath: skillMdPath,
                localPath: skillFolderPath,
                platforms: [platformName],
              });
            } catch {
              // Ignore malformed skills so scan previews remain resilient.
            }
          }
        }),
      );

      const results = Array.from(skillMap.values());
      markNameConflicts(results, skillDb);
      return results;
    },
    scanSafety,
    syncFromRepo,
    uninstallSkillMd,
    writeLocalFile,
  };
}

export const coreCliSkillService = createCliSkillService();

import fs from "node:fs";
import path from "node:path";
import type { Folder, Prompt, PromptVersion } from "@prompthub/shared/types";
export const FOLDERS_FILE_NAME = "folders.json";
export const FOLDER_METADATA_FILE_NAME = "_folder.json";
export const PROMPT_FILE_NAME = "prompt.md";
export const VERSIONS_DIR_NAME = "versions";
export const VERSION_ROOT_DIR_NAME = ".versions";
export const TRASH_DIR_NAME = ".trash";
export const TRASH_CONFLICTS_SUBDIR = "conflicts";
export const TRASH_RETENTION = 5;
const SYSTEM_MARKER = "<!-- PROMPTHUB:SYSTEM -->";
const USER_MARKER = "<!-- PROMPTHUB:USER -->";
/**
 * On Windows and macOS (default HFS+/APFS), filesystems are case-insensitive.
 * `fs.readdirSync` may nonetheless return duplicate entries when a directory
 * contains links or when callers merged paths with different casing. Normalize
 * for dedup on these platforms so we never double-import the same prompt.
 *
 * Windows 和 macOS 默认文件系统大小写不敏感；readdirSync 仍可能因软链或
 * 大小写混写返回重复项，此函数用于去重 key 规范化，避免同一 prompt 被导入两次。
 */
const IS_CASE_INSENSITIVE_FS =
  process.platform === "win32" || process.platform === "darwin";
export function dedupKey(absolutePath: string): string {
  const resolved = path.resolve(absolutePath);
  return IS_CASE_INSENSITIVE_FS ? resolved.toLowerCase() : resolved;
}

interface FrontmatterResult {
  metadata: Record<string, unknown>;
  body: string;
}

export function formatFrontmatter(metadata: Record<string, unknown>): string {
  const lines = Object.entries(metadata)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);

  return `---\n${lines.join("\n")}\n---\n`;
}

export function parseFrontmatter(raw: string): FrontmatterResult {
  if (!raw.startsWith("---\n")) {
    return { metadata: {}, body: raw };
  }

  const endIndex = raw.indexOf("\n---\n", 4);
  if (endIndex === -1) {
    return { metadata: {}, body: raw };
  }

  const metadataBlock = raw.slice(4, endIndex);
  const body = raw.slice(endIndex + 5);
  const metadata: Record<string, unknown> = {};

  for (const line of metadataBlock.split("\n")) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    if (!key) {
      continue;
    }

    try {
      metadata[key] = JSON.parse(rawValue);
    } catch {
      metadata[key] = rawValue;
    }
  }

  return { metadata, body };
}

export function formatPromptBody(
  systemPrompt: string | null | undefined,
  userPrompt: string,
): string {
  return [
    SYSTEM_MARKER,
    systemPrompt ?? "",
    "",
    USER_MARKER,
    userPrompt,
    "",
  ].join("\n");
}

export function parsePromptBody(body: string): {
  systemPrompt: string | null;
  userPrompt: string;
} {
  const systemIndex = body.indexOf(SYSTEM_MARKER);
  const userIndex = body.indexOf(USER_MARKER);

  if (systemIndex === -1 || userIndex === -1 || userIndex < systemIndex) {
    return {
      systemPrompt: null,
      userPrompt: body.trim(),
    };
  }

  const systemPrompt = body
    .slice(systemIndex + SYSTEM_MARKER.length, userIndex)
    .trim();
  const userPrompt = body.slice(userIndex + USER_MARKER.length).trim();

  return {
    systemPrompt: systemPrompt || null,
    userPrompt,
  };
}

export function promptFrontmatter(prompt: Prompt): Record<string, unknown> {
  return {
    id: prompt.id,
    title: prompt.title,
    description: prompt.description ?? null,
    promptType: prompt.promptType ?? "text",
    systemPromptEn: prompt.systemPromptEn ?? null,
    userPromptEn: prompt.userPromptEn ?? null,
    variables: prompt.variables ?? [],
    tags: prompt.tags ?? [],
    folderId: prompt.folderId ?? null,
    parentId: prompt.parentId ?? null,
    order: prompt.order ?? 0,
    images: prompt.images ?? [],
    videos: prompt.videos ?? [],
    isFavorite: prompt.isFavorite,
    isPinned: prompt.isPinned,
    currentVersion: prompt.currentVersion ?? prompt.version ?? 1,
    source: prompt.source ?? null,
    notes: prompt.notes ?? null,
    createdAt: prompt.createdAt,
    updatedAt: prompt.updatedAt,
  };
}

export function versionFrontmatter(
  version: PromptVersion,
): Record<string, unknown> {
  return {
    id: version.id,
    promptId: version.promptId,
    version: version.version,
    systemPromptEn: version.systemPromptEn ?? null,
    userPromptEn: version.userPromptEn ?? null,
    variables: version.variables ?? [],
    note: version.note ?? null,
    aiResponse: version.aiResponse ?? null,
    createdAt: version.createdAt,
  };
}

export function readLegacyFoldersFile(
  workspaceDir: string,
  strict = false,
): Folder[] {
  const foldersFile = path.join(workspaceDir, FOLDERS_FILE_NAME);
  if (!fs.existsSync(foldersFile)) {
    return [];
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(foldersFile, "utf8")) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("legacy folders.json must contain an array");
    }
    return parsed as Folder[];
  } catch (error) {
    if (strict) {
      throw new Error("failed to parse legacy folders.json", { cause: error });
    }
    console.error(
      "[prompt-workspace] failed to parse legacy folders.json, treating as empty:",
      error,
    );
    return [];
  }
}

export function collectFolderMetadataFiles(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === TRASH_DIR_NAME) {
        continue;
      }

      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }

      if (entry.isFile() && entry.name === FOLDER_METADATA_FILE_NAME) {
        files.push(absolutePath);
      }
    }
  };

  walk(rootDir);
  return files;
}

export function readFolderMetadataFiles(
  promptsDir: string,
  strict = false,
): Folder[] {
  return collectFolderMetadataFiles(promptsDir)
    .map((filePath) => {
      try {
        const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Folder;
        return parsed;
      } catch (error) {
        if (strict) {
          throw new Error(`failed to parse ${FOLDER_METADATA_FILE_NAME}`, {
            cause: error,
          });
        }
        console.error(
          `[prompt-workspace] failed to parse ${FOLDER_METADATA_FILE_NAME} at ${filePath}:`,
          error,
        );
        return null;
      }
    })
    .filter((folder): folder is Folder => folder !== null);
}

export function readFoldersFile(
  workspaceDir: string,
  promptsDir: string,
  strict = false,
): Folder[] {
  const merged = new Map<string, Folder>();

  for (const folder of readLegacyFoldersFile(workspaceDir, strict)) {
    merged.set(folder.id, folder);
  }
  for (const folder of readFolderMetadataFiles(promptsDir, strict)) {
    merged.set(folder.id, folder);
  }

  return [...merged.values()];
}

export function collectPromptFiles(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const files: string[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    // Skip trash directory so we never re-import trashed files.
    // 跳过回收站目录，避免重新导入已回收的文件。
    if (entry.name === TRASH_DIR_NAME) {
      continue;
    }
    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === VERSIONS_DIR_NAME ||
        entry.name === VERSION_ROOT_DIR_NAME
      ) {
        continue;
      }

      const legacyPromptFile = path.join(absolutePath, PROMPT_FILE_NAME);
      if (fs.existsSync(legacyPromptFile)) {
        const key = dedupKey(legacyPromptFile);
        if (!seen.has(key)) {
          seen.add(key);
          files.push(legacyPromptFile);
        }
        continue;
      }

      for (const nested of collectPromptFiles(absolutePath)) {
        const key = dedupKey(nested);
        if (!seen.has(key)) {
          seen.add(key);
          files.push(nested);
        }
      }
      continue;
    }

    if (
      entry.isFile() &&
      entry.name.endsWith(".md") &&
      entry.name !== FOLDER_METADATA_FILE_NAME
    ) {
      const key = dedupKey(absolutePath);
      if (!seen.has(key)) {
        seen.add(key);
        files.push(absolutePath);
      }
    }
  }

  return files;
}

export function getPromptVersionDir(
  workspaceDir: string,
  promptId: string,
): string {
  return path.join(workspaceDir, VERSION_ROOT_DIR_NAME, promptId);
}

export function toIsoString(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  return fallback;
}

export function toEpochMs(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function parsePromptFile(filePath: string): Prompt {
  const { metadata, body } = parseFrontmatter(
    fs.readFileSync(filePath, "utf8"),
  );
  const parsedBody = parsePromptBody(body);
  const now = new Date().toISOString();

  return {
    id: String(metadata.id),
    title: String(metadata.title ?? "Untitled Prompt"),
    description:
      typeof metadata.description === "string" ? metadata.description : null,
    promptType:
      metadata.promptType === "image" || metadata.promptType === "video"
        ? metadata.promptType
        : "text",
    systemPrompt: parsedBody.systemPrompt,
    systemPromptEn:
      typeof metadata.systemPromptEn === "string"
        ? metadata.systemPromptEn
        : null,
    userPrompt: parsedBody.userPrompt,
    userPromptEn:
      typeof metadata.userPromptEn === "string" ? metadata.userPromptEn : null,
    variables: Array.isArray(metadata.variables)
      ? (metadata.variables as Prompt["variables"])
      : [],
    tags: Array.isArray(metadata.tags) ? (metadata.tags as string[]) : [],
    folderId: typeof metadata.folderId === "string" ? metadata.folderId : null,
    parentId: typeof metadata.parentId === "string" ? metadata.parentId : null,
    order:
      typeof metadata.order === "number" && Number.isFinite(metadata.order)
        ? metadata.order
        : 0,
    images: Array.isArray(metadata.images) ? (metadata.images as string[]) : [],
    videos: Array.isArray(metadata.videos) ? (metadata.videos as string[]) : [],
    isFavorite: metadata.isFavorite === true,
    isPinned: metadata.isPinned === true,
    version:
      typeof metadata.currentVersion === "number" ? metadata.currentVersion : 1,
    currentVersion:
      typeof metadata.currentVersion === "number" ? metadata.currentVersion : 1,
    usageCount: 0,
    source: typeof metadata.source === "string" ? metadata.source : null,
    notes: typeof metadata.notes === "string" ? metadata.notes : null,
    lastAiResponse: null,
    createdAt: toIsoString(metadata.createdAt, now),
    updatedAt: toIsoString(metadata.updatedAt, now),
  };
}

export function parseVersionFile(
  filePath: string,
  promptId: string,
): PromptVersion {
  const { metadata, body } = parseFrontmatter(
    fs.readFileSync(filePath, "utf8"),
  );
  const parsedBody = parsePromptBody(body);

  return {
    id: String(metadata.id),
    promptId,
    version:
      typeof metadata.version === "number"
        ? metadata.version
        : Number.parseInt(path.basename(filePath, ".md"), 10) || 1,
    systemPrompt: parsedBody.systemPrompt,
    systemPromptEn:
      typeof metadata.systemPromptEn === "string"
        ? metadata.systemPromptEn
        : null,
    userPrompt: parsedBody.userPrompt,
    userPromptEn:
      typeof metadata.userPromptEn === "string" ? metadata.userPromptEn : null,
    variables: Array.isArray(metadata.variables)
      ? (metadata.variables as PromptVersion["variables"])
      : [],
    note: typeof metadata.note === "string" ? metadata.note : null,
    aiResponse:
      typeof metadata.aiResponse === "string" ? metadata.aiResponse : null,
    createdAt: toIsoString(metadata.createdAt, new Date().toISOString()),
  };
}

export function readPromptVersions(
  workspaceDir: string,
  promptFilePath: string,
  promptId: string,
): PromptVersion[] {
  const legacyVersionsDir = path.join(
    path.dirname(promptFilePath),
    VERSIONS_DIR_NAME,
  );
  const versionsDir = fs.existsSync(getPromptVersionDir(workspaceDir, promptId))
    ? getPromptVersionDir(workspaceDir, promptId)
    : legacyVersionsDir;
  if (!fs.existsSync(versionsDir)) {
    return [];
  }

  return fs
    .readdirSync(versionsDir)
    .filter((file) => file.endsWith(".md"))
    .sort()
    .map((file) => parseVersionFile(path.join(versionsDir, file), promptId));
}

export function workspaceHasPromptData(
  promptsDir: string,
  workspaceDir: string,
): boolean {
  if (collectPromptFiles(promptsDir).length > 0) {
    return true;
  }

  if (collectFolderMetadataFiles(promptsDir).length > 0) {
    return true;
  }

  return fs.existsSync(path.join(workspaceDir, FOLDERS_FILE_NAME));
}

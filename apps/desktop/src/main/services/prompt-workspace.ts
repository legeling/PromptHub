import fs from "fs";
import path from "path";

import type { Folder, Prompt, PromptVersion } from "@prompthub/shared/types";

import { FolderDB } from "../database/folder";
import { PromptDB } from "../database/prompt";
import {
  getWorkspaceDir,
  getPromptsWorkspaceDir,
  getUserDataPath,
} from "../runtime-paths";

const FOLDERS_FILE_NAME = "folders.json";
const FOLDER_METADATA_FILE_NAME = "_folder.json";
const PROMPT_FILE_NAME = "prompt.md";
const VERSIONS_DIR_NAME = "versions";
const VERSION_ROOT_DIR_NAME = ".versions";
const TRASH_DIR_NAME = ".trash";
const TRASH_CONFLICTS_SUBDIR = "conflicts";
const TRASH_RETENTION = 5;
const SYSTEM_MARKER = "<!-- PROMPTHUB:SYSTEM -->";
const USER_MARKER = "<!-- PROMPTHUB:USER -->";
const RESTORE_MARKER_NAME = ".prompthub-restore-marker";

/**
 * Restore marker (v0.5.3, review-follow-up).
 *
 * Written by the IPC recovery handler after a successful database restore.
 * During the next `bootstrapPromptWorkspace` boot, the marker suppresses the
 * Phase-1 "workspace → DB" import so that stale prompts kept in the
 * on-disk workspace cannot "resurrect" records the user just rolled back
 * via recovery. Cleared after the DB → workspace re-sync completes.
 *
 * 恢复标记（v0.5.3，review 反馈修复）：
 * 数据恢复 IPC 成功后写入该标记。下一次 bootstrapPromptWorkspace 启动时，
 * 若检测到标记存在，则跳过 Phase 1（workspace → DB 导入），避免磁盘上
 * 残留的旧 prompt "复活"用户刚刚回滚掉的记录。DB → workspace 同步完成后清除。
 */
function getRestoreMarkerPath(userDataPath?: string): string {
  return path.join(userDataPath ?? getUserDataPath(), RESTORE_MARKER_NAME);
}

export function writeRestoreMarker(userDataPath?: string): void {
  try {
    const markerPath = getRestoreMarkerPath(userDataPath);
    ensureDir(path.dirname(markerPath));
    fs.writeFileSync(markerPath, new Date().toISOString(), "utf8");
  } catch (error) {
    console.warn("[prompt-workspace] failed to write restore marker:", error);
  }
}

function hasRestoreMarker(userDataPath?: string): boolean {
  try {
    return fs.existsSync(getRestoreMarkerPath(userDataPath));
  } catch {
    return false;
  }
}

function clearRestoreMarker(userDataPath?: string): void {
  try {
    const markerPath = getRestoreMarkerPath(userDataPath);
    if (fs.existsSync(markerPath)) {
      fs.unlinkSync(markerPath);
    }
  } catch (error) {
    console.warn("[prompt-workspace] failed to clear restore marker:", error);
  }
}

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
function dedupKey(absolutePath: string): string {
  const resolved = path.resolve(absolutePath);
  return IS_CASE_INSENSITIVE_FS ? resolved.toLowerCase() : resolved;
}

interface FrontmatterResult {
  metadata: Record<string, unknown>;
  body: string;
}

interface PromptWorkspaceSyncResult {
  promptCount: number;
  folderCount: number;
  versionCount: number;
}

/**
 * Result of importing workspace → DB. Extends the basic counts with
 * `skippedPromptPaths`: prompt paths whose file failed to parse/import or
 * that lost a same-id conflict. Phase 2 of the "both" quadrant MUST pass these
 * to `syncPromptWorkspaceFromDatabase` so they are not misclassified as
 * orphans and trashed a second time.
 *
 * 导入返回值：除了基础计数外，`skippedPromptPaths` 记录那些解析失败或在
 * 同 id 冲突中落败的路径。合并象限（Q4）的 Phase 2 必须把它们传给
 * syncPromptWorkspaceFromDatabase，避免它们再次被当作孤立项回收。
 */
interface PromptWorkspaceImportResult extends PromptWorkspaceSyncResult {
  skippedPromptPaths: Set<string>;
}

/**
 * Bootstrap quadrant decision, returned for observability.
 * v0.5.3: replaces the binary "imported/exported" return of v0.5.2.
 * v0.5.3: 取代 v0.5.2 的二元 imported/exported 返回值，便于日志追踪。
 */
export type BootstrapQuadrant =
  | "empty" // no DB, no workspace → noop
  | "db-only" // DB has data, workspace empty → export
  | "workspace-only" // workspace has data, DB empty → import
  | "both"; // both have data → merge

export interface BootstrapResult {
  quadrant: BootstrapQuadrant;
  imported: boolean;
  exported: boolean;
  promptCount: number;
  folderCount: number;
  versionCount: number;
  /**
   * Whether a restore marker was detected and honored during this bootstrap.
   * When true, Phase 1 (WS → DB) of Quadrant 4 was skipped to prevent the
   * "data revival" bug where deleted records come back after a DB restore.
   * 是否检测到并处理了恢复标记。为 true 时 Q4 跳过 Phase 1，防止恢复后删除数据复活。
   */
  restoreMarkerUsed?: boolean;
}

function ensureDir(targetPath: string): void {
  fs.mkdirSync(targetPath, { recursive: true });
}

function slugify(input: string | null | undefined): string {
  const normalized = (input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "untitled";
}

function padVersion(version: number): string {
  return String(version).padStart(4, "0");
}

function formatFrontmatter(metadata: Record<string, unknown>): string {
  const lines = Object.entries(metadata)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);

  return `---\n${lines.join("\n")}\n---\n`;
}

function parseFrontmatter(raw: string): FrontmatterResult {
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

function formatPromptBody(
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

function parsePromptBody(body: string): {
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

function promptFrontmatter(prompt: Prompt): Record<string, unknown> {
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

function versionFrontmatter(version: PromptVersion): Record<string, unknown> {
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

function readLegacyFoldersFile(workspaceDir: string): Folder[] {
  const foldersFile = path.join(workspaceDir, FOLDERS_FILE_NAME);
  if (!fs.existsSync(foldersFile)) {
    return [];
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(foldersFile, "utf8")) as Folder[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error(
      "[prompt-workspace] failed to parse legacy folders.json, treating as empty:",
      error,
    );
    return [];
  }
}

function collectFolderMetadataFiles(rootDir: string): string[] {
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

function readFolderMetadataFiles(promptsDir: string): Folder[] {
  return collectFolderMetadataFiles(promptsDir)
    .map((filePath) => {
      try {
        const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Folder;
        return parsed;
      } catch (error) {
        console.error(
          `[prompt-workspace] failed to parse ${FOLDER_METADATA_FILE_NAME} at ${filePath}:`,
          error,
        );
        return null;
      }
    })
    .filter((folder): folder is Folder => folder !== null);
}

function readFoldersFile(workspaceDir: string, promptsDir: string): Folder[] {
  const merged = new Map<string, Folder>();

  for (const folder of readLegacyFoldersFile(workspaceDir)) {
    merged.set(folder.id, folder);
  }
  for (const folder of readFolderMetadataFiles(promptsDir)) {
    merged.set(folder.id, folder);
  }

  return [...merged.values()];
}

function getFolderMetadataPath(folderDir: string): string {
  return path.join(folderDir, FOLDER_METADATA_FILE_NAME);
}

function writeFolderMetadataFiles(
  workspaceDir: string,
  promptsDir: string,
  folders: Folder[],
  folderMap: Map<string, Folder>,
): void {
  const expectedMetadataPaths = new Set<string>();

  ensureDir(promptsDir);
  for (const folder of folders) {
    const folderDir = path.join(promptsDir, ...buildFolderSegments(folder.id, folderMap));
    ensureDir(folderDir);

    const metadataPath = getFolderMetadataPath(folderDir);
    fs.writeFileSync(metadataPath, JSON.stringify(folder, null, 2), "utf8");
    expectedMetadataPaths.add(path.resolve(metadataPath));
  }

  for (const existingMetadataPath of collectFolderMetadataFiles(promptsDir)) {
    const resolved = path.resolve(existingMetadataPath);
    if (!expectedMetadataPaths.has(resolved)) {
      moveToTrash(existingMetadataPath);
    }
  }

  const legacyFoldersPath = path.join(workspaceDir, FOLDERS_FILE_NAME);
  if (fs.existsSync(legacyFoldersPath)) {
    moveToTrash(legacyFoldersPath);
  }
}

function buildFolderSegments(
  folderId: string | null | undefined,
  folderMap: Map<string, Folder>,
): string[] {
  const segments: string[] = [];
  const seen = new Set<string>();
  let currentId = folderId ?? null;

  while (currentId) {
    const folder = folderMap.get(currentId);
    if (!folder || seen.has(currentId)) {
      break;
    }

    seen.add(currentId);
    segments.unshift(slugify(folder.name));
    currentId = folder.parentId ?? null;
  }

  return segments;
}

function getPromptParentDirectory(
  promptsDir: string,
  folderMap: Map<string, Folder>,
  prompt: Prompt,
): string {
  const folderSegments = buildFolderSegments(prompt.folderId ?? null, folderMap);
  return path.join(promptsDir, ...folderSegments);
}

function buildPromptFileName(prompt: Prompt): string {
  return `${slugify(prompt.title)}.md`;
}

function getPromptFilePath(
  promptsDir: string,
  folderMap: Map<string, Folder>,
  prompt: Prompt,
  takenPaths: Set<string>,
): string {
  const parentDir = getPromptParentDirectory(promptsDir, folderMap, prompt);
  const baseName = buildPromptFileName(prompt);
  const initialPath = path.join(parentDir, baseName);
  const resolvedInitialPath = path.resolve(initialPath);

  if (!takenPaths.has(resolvedInitialPath)) {
    takenPaths.add(resolvedInitialPath);
    return initialPath;
  }

  const fallbackBaseName = `${slugify(prompt.title)}-${prompt.id.slice(0, 8)}.md`;
  const fallbackPath = path.join(parentDir, fallbackBaseName);
  const resolvedFallbackPath = path.resolve(fallbackPath);
  if (!takenPaths.has(resolvedFallbackPath)) {
    takenPaths.add(resolvedFallbackPath);
    return fallbackPath;
  }

  let counter = 2;
  while (true) {
    const candidatePath = path.join(
      parentDir,
      `${slugify(prompt.title)}-${counter}.md`,
    );
    const resolvedCandidatePath = path.resolve(candidatePath);
    if (!takenPaths.has(resolvedCandidatePath)) {
      takenPaths.add(resolvedCandidatePath);
      return candidatePath;
    }
    counter += 1;
  }
}

function collectPromptFiles(rootDir: string): string[] {
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
      if (entry.name === VERSIONS_DIR_NAME || entry.name === VERSION_ROOT_DIR_NAME) {
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

function getPromptCleanupPath(promptFilePath: string): string {
  if (path.basename(promptFilePath) === PROMPT_FILE_NAME) {
    return path.dirname(promptFilePath);
  }

  return promptFilePath;
}

function getPromptVersionDir(workspaceDir: string, promptId: string): string {
  return path.join(workspaceDir, VERSION_ROOT_DIR_NAME, promptId);
}

function collectLegacyPromptDirs(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const result: string[] = [];
  const seen = new Set<string>();
  const walk = (dir: string): void => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === TRASH_DIR_NAME) continue;
      const absolutePath = path.join(dir, entry.name);
      if (!entry.isDirectory()) continue;

      if (fs.existsSync(path.join(absolutePath, PROMPT_FILE_NAME))) {
        const key = dedupKey(absolutePath);
        if (!seen.has(key)) {
          seen.add(key);
          result.push(absolutePath);
        }
      } else {
        walk(absolutePath);
      }
    }
  };

  walk(rootDir);
  return result;
}

function cleanupLegacyVersionDirs(workspaceDir: string, promptIds: Set<string>): void {
  const versionRoot = path.join(workspaceDir, VERSION_ROOT_DIR_NAME);
  if (!fs.existsSync(versionRoot)) {
    return;
  }

  for (const entry of fs.readdirSync(versionRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    if (!promptIds.has(entry.name)) {
      moveToTrash(path.join(versionRoot, entry.name));
    }
  }
}

function toIsoString(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  return fallback;
}

/**
 * Normalize a timestamp value to a numeric epoch (ms) for comparison.
 * DB rows store integer ms while typed as `string`; file metadata stores ISO.
 * Always compare through this to avoid number-vs-string coercion bugs.
 *
 * 将时间戳归一化为毫秒数以便比较。DB 中是整数毫秒但类型标注为 string；
 * 文件元数据是 ISO。比较前统一转换，避免 number vs string 比较的隐蔽 bug。
 */
function toEpochMs(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function parsePromptFile(filePath: string): Prompt {
  const { metadata, body } = parseFrontmatter(fs.readFileSync(filePath, "utf8"));
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

function parseVersionFile(filePath: string, promptId: string): PromptVersion {
  const { metadata, body } = parseFrontmatter(fs.readFileSync(filePath, "utf8"));
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

function readPromptVersions(
  workspaceDir: string,
  promptFilePath: string,
  promptId: string,
): PromptVersion[] {
  const legacyVersionsDir = path.join(path.dirname(promptFilePath), VERSIONS_DIR_NAME);
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

function workspaceHasPromptData(promptsDir: string, workspaceDir: string): boolean {
  if (collectPromptFiles(promptsDir).length > 0) {
    return true;
  }

  if (collectFolderMetadataFiles(promptsDir).length > 0) {
    return true;
  }

  return fs.existsSync(path.join(workspaceDir, FOLDERS_FILE_NAME));
}

/**
 * Move a file or directory into the workspace trash, preserving relative path.
 * Trashed items live under `<workspace>/.trash/<ISO-timestamp>/<relative-path>`
 * (or `<workspace>/.trash/conflicts/<ISO-timestamp>/...` when `reason` is
 * `"conflict"`).
 *
 * v0.5.3: replaces `fs.rmSync` — never permanently deletes user data.
 * v0.5.3 review-follow-up: the `renameSync` fallback to `cp + rm` now fires
 * **only** on `EXDEV` (cross-device) errors. Other errors (EPERM/EBUSY
 * from Windows antivirus or a locked file) now propagate — blindly
 * copying + removing could double-destroy data or hang indefinitely.
 *
 * v0.5.3: 取代 fs.rmSync，永不永久删除用户数据。
 * review 反馈修复：renameSync 降级为 cp+rm 仅在 EXDEV（跨卷）时触发。
 *   其他错误（如 Windows 杀软占用导致的 EPERM/EBUSY）不再盲目降级，
 *   以免复制+删除造成二次破坏。
 */
function moveToTrash(
  absolutePath: string,
  reason: "orphan" | "conflict" = "orphan",
): void {
  if (!fs.existsSync(absolutePath)) {
    return;
  }

  const workspaceDir = getWorkspaceDir();
  const trashRoot = path.join(workspaceDir, TRASH_DIR_NAME);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const trashSnapshotDir =
    reason === "conflict"
      ? path.join(trashRoot, TRASH_CONFLICTS_SUBDIR, timestamp)
      : path.join(trashRoot, timestamp);

  // Compute path relative to workspace so trash preserves layout.
  // 相对工作区计算路径，让回收站保持原有结构。
  const relativeToWorkspace = path.relative(workspaceDir, absolutePath);
  const destination = path.join(trashSnapshotDir, relativeToWorkspace);

  ensureDir(path.dirname(destination));
  try {
    fs.renameSync(absolutePath, destination);
  } catch (error) {
    const code =
      error instanceof Error && "code" in error
        ? (error as NodeJS.ErrnoException).code
        : undefined;
    if (code === "EXDEV") {
      // Cross-device rename: must copy + remove.
      // 跨卷重命名：只能复制后删除。
      console.warn(
        "[prompt-workspace] moveToTrash: EXDEV, falling back to copy+rm:",
        absolutePath,
      );
      fs.cpSync(absolutePath, destination, { recursive: true });
      fs.rmSync(absolutePath, { recursive: true, force: true });
    } else {
      // EPERM/EBUSY/ENOENT/etc.: do NOT silently fall back — leaving the file
      // in place is safer than a potentially-destructive copy+rm.
      // 其他错误：不得静默降级；让文件留在原位比潜在破坏性的 cp+rm 更安全。
      console.error(
        `[prompt-workspace] moveToTrash failed (${code ?? "unknown"}) for ${absolutePath}; leaving in place.`,
        error,
      );
      return;
    }
  }

  pruneTrash(trashRoot);
}

/**
 * Keep only the most recent TRASH_RETENTION snapshots, delete older ones.
 * 仅保留最近 TRASH_RETENTION 个快照，删除更旧的。
 */
function pruneTrash(trashRoot: string): void {
  if (!fs.existsSync(trashRoot)) {
    return;
  }

  try {
    const snapshots = fs
      .readdirSync(trashRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      // Skip the `conflicts` subdir: it contains its own timestamped snapshots
      // pruned separately below, and must not be treated as a retention unit.
      // 跳过 conflicts 子目录：它自带时间戳快照，由下方单独清理。
      .filter((entry) => entry.name !== TRASH_CONFLICTS_SUBDIR)
      .map((entry) => entry.name)
      .sort();

    if (snapshots.length > TRASH_RETENTION) {
      const toDelete = snapshots.slice(0, snapshots.length - TRASH_RETENTION);
      for (const name of toDelete) {
        fs.rmSync(path.join(trashRoot, name), { recursive: true, force: true });
      }
    }

    // Prune the conflicts/ subdir on the same retention policy.
    // 同样的保留策略应用于 conflicts/ 子目录。
    const conflictsRoot = path.join(trashRoot, TRASH_CONFLICTS_SUBDIR);
    if (fs.existsSync(conflictsRoot)) {
      const conflictSnapshots = fs
        .readdirSync(conflictsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
      if (conflictSnapshots.length > TRASH_RETENTION) {
        const toDelete = conflictSnapshots.slice(
          0,
          conflictSnapshots.length - TRASH_RETENTION,
        );
        for (const name of toDelete) {
          fs.rmSync(path.join(conflictsRoot, name), {
            recursive: true,
            force: true,
          });
        }
      }
    }
  } catch (error) {
    // Pruning is best-effort; failure must not break sync.
    // 清理属于尽力而为，失败不得影响同步主流程。
    console.warn("[prompt-workspace] pruneTrash failed:", error);
  }
}

function writePromptToDisk(
  workspaceDir: string,
  promptsDir: string,
  folderMap: Map<string, Folder>,
  prompt: Prompt,
  versions: PromptVersion[],
  takenPromptPaths: Set<string>,
): { promptPath: string; versionCount: number } {
  const promptPath = getPromptFilePath(
    promptsDir,
    folderMap,
    prompt,
    takenPromptPaths,
  );
  ensureDir(path.dirname(promptPath));

  fs.writeFileSync(
    promptPath,
    `${formatFrontmatter(promptFrontmatter(prompt))}${formatPromptBody(prompt.systemPrompt, prompt.userPrompt)}`,
    "utf8",
  );

  const sorted = [...versions].sort((left, right) => left.version - right.version);
  const versionsDir = getPromptVersionDir(workspaceDir, prompt.id);

  if (sorted.length > 0) {
    ensureDir(versionsDir);
    const expectedVersionFiles = new Set(
      sorted.map((version) => `${padVersion(version.version)}.md`),
    );

    // Write current versions.
    // 写入当前版本文件。
    for (const version of sorted) {
      fs.writeFileSync(
        path.join(versionsDir, `${padVersion(version.version)}.md`),
        `${formatFrontmatter(versionFrontmatter(version))}${formatPromptBody(version.systemPrompt, version.userPrompt)}`,
        "utf8",
      );
    }

    // Trash orphan version files (versions deleted from DB).
    // 回收孤立的版本文件（DB 中已删除的版本）。
    const existing = fs
      .readdirSync(versionsDir)
      .filter((file) => file.endsWith(".md"));
    for (const file of existing) {
      if (!expectedVersionFiles.has(file)) {
        moveToTrash(path.join(versionsDir, file));
      }
    }
  } else if (fs.existsSync(versionsDir)) {
    // No versions in DB → trash entire versions dir if it exists.
    // DB 无版本 → 若版本目录存在则整体回收。
    moveToTrash(versionsDir);
  }

  return { promptPath, versionCount: sorted.length };
}

/**
 * Remove empty directories under rootDir (non-recursive leaf pass).
 * 删除 rootDir 下的空目录（叶子优先）。
 */
function pruneEmptyDirs(rootDir: string): void {
  if (!fs.existsSync(rootDir)) {
    return;
  }

  const walk = (dir: string): boolean => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let remaining = 0;
    for (const entry of entries) {
      if (entry.name === TRASH_DIR_NAME) {
        remaining++;
        continue;
      }
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const removed = walk(absolutePath);
        if (!removed) remaining++;
      } else {
        remaining++;
      }
    }
    if (remaining === 0 && dir !== rootDir) {
      try {
        fs.rmdirSync(dir);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  };
  walk(rootDir);
}

/**
 * Incrementally sync DB → workspace. Writes one file per DB prompt and trashes
 * orphan files/directories. Never calls `fs.rmSync` on user data.
 *
 * v0.5.3: 增量同步 DB → 工作区。按 DB 内容逐个写文件，将孤立文件/目录移入回收站，
 *         永不对用户数据调用 fs.rmSync。
 */
export function syncPromptWorkspaceFromDatabase(
  promptDb: PromptDB,
  folderDb: FolderDB,
  options: { skipTrashPaths?: Set<string> } = {},
): PromptWorkspaceSyncResult {
  const workspaceDir = getWorkspaceDir();
  const promptsDir = getPromptsWorkspaceDir();
  const folders = folderDb.getAll();
  const prompts = promptDb.getAll();
  const folderMap = new Map(folders.map((folder) => [folder.id, folder]));

  ensureDir(promptsDir);
  writeFolderMetadataFiles(workspaceDir, promptsDir, folders, folderMap);

  // Write current state to disk, remember which prompt files we own.
  // 写入当前状态，记录属于我方的 prompt 文件。
  const expectedPromptPaths = new Set<string>();
  const takenPromptPaths = new Set<string>();
  const expectedPromptIds = new Set<string>();
  let versionCount = 0;

  for (const prompt of prompts) {
    const { promptPath, versionCount: vc } = writePromptToDisk(
      workspaceDir,
      promptsDir,
      folderMap,
      prompt,
      promptDb.getVersions(prompt.id),
      takenPromptPaths,
    );
    expectedPromptPaths.add(path.resolve(promptPath));
    expectedPromptIds.add(prompt.id);
    versionCount += vc;
  }

  // Trash prompt files not present in DB.
  // 回收 DB 中不存在的 prompt 文件。
  const skip = options.skipTrashPaths;
  const existingPromptPaths = collectPromptFiles(promptsDir).map((filePath) =>
    path.resolve(filePath),
  );
  for (const filePath of existingPromptPaths) {
    if (expectedPromptPaths.has(filePath)) continue;
    if (skip?.has(filePath)) continue;
    moveToTrash(getPromptCleanupPath(filePath));
  }

  for (const legacyDir of collectLegacyPromptDirs(promptsDir)) {
    const legacyPromptPath = path.resolve(path.join(legacyDir, PROMPT_FILE_NAME));
    if (expectedPromptPaths.has(legacyPromptPath)) continue;
    if (skip?.has(legacyPromptPath)) continue;
    moveToTrash(legacyDir);
  }

  cleanupLegacyVersionDirs(workspaceDir, expectedPromptIds);

  // Remove any empty parent directories (e.g. after folder rename).
  // 清理空的父目录（例如文件夹重命名后残留的空目录）。
  pruneEmptyDirs(promptsDir);

  return {
    promptCount: prompts.length,
    folderCount: folders.length,
    versionCount,
  };
}

/**
 * Import workspace files into database. Used in "workspace-only" bootstrap
 * quadrant and as the file→DB phase of merge.
 *
 * 将工作区文件导入数据库；用于 workspace-only 启动象限，以及合并阶段的 file→DB。
 *
 * @param options.onlyIfNewer when true, skip prompts whose DB record has a
 *                            newer updatedAt than the file.
 *                            为 true 时跳过 DB 中 updatedAt 比文件新的记录。
 */
export function importPromptWorkspaceIntoDatabase(
  promptDb: PromptDB,
  folderDb: FolderDB,
  options: { onlyIfNewer?: boolean } = {},
): PromptWorkspaceImportResult {
  const workspaceDir = getWorkspaceDir();
  const promptsDir = getPromptsWorkspaceDir();
  const folders = readFoldersFile(workspaceDir, promptsDir);
  const promptFiles = collectPromptFiles(promptsDir);

  const skippedPromptPaths = new Set<string>();

  if (!workspaceHasPromptData(promptsDir, workspaceDir)) {
    return {
      promptCount: 0,
      folderCount: 0,
      versionCount: 0,
      skippedPromptPaths,
    };
  }

  // Folders first so prompt folder_id FK is satisfied.
  // 先插入文件夹以满足外键约束。
  const existingFolders = options.onlyIfNewer
    ? new Map(folderDb.getAll().map((folder) => [folder.id, folder] as const))
    : null;
  let importedFolders = 0;
  let skippedFolders = 0;
  for (const folder of folders) {
    if (existingFolders) {
      const existing = existingFolders.get(folder.id);
      if (
        existing &&
        toEpochMs(existing.updatedAt) >= toEpochMs(folder.updatedAt)
      ) {
        continue;
      }
    }
    // v0.5.3: per-item try/catch — a single malformed folder (e.g. unknown
    // columns from a newer/older schema, FK violation on parent_id) must not
    // abort the entire bootstrap. Skip and log; the Release Notes instructs
    // users to share startup.log if data is missing.
    // v0.5.3: 单条 try/catch —— 单个畸形 folder（比如 schema 版本不匹配、父 id
    // 外键冲突）不得中断整个 bootstrap。跳过并记录日志；若数据缺失，
    // 用户可在 Release Notes 指引下提供 startup.log。
    try {
      folderDb.insertFolderDirect(folder);
      importedFolders++;
    } catch (error) {
      skippedFolders++;
      console.error(
        `[prompt-workspace] failed to import folder ${folder.id} (${folder.name}):`,
        error,
      );
    }
  }

  // v0.5.3 review-follow-up: parse all files first, then resolve same-id
  // conflicts by picking the newest `updatedAt` winner. Previously the raw
  // iteration order decided the winner (INSERT OR REPLACE on prompts,
  // INSERT OR IGNORE on versions) which could yield a prompt body from one
  // directory and version history from another. Losers are moved to
  // `.trash/conflicts/<ts>/` and excluded from Phase 2 orphan sweep.
  //
  // v0.5.3 review 反馈修复：先完整解析所有文件再按 prompt.id 分组；
  // 同 id 冲突按 updatedAt 选最新者为胜者，原先依赖遍历顺序可能出现
  // "内容来自 A 但版本来自 B" 的错配。落败副本移入 .trash/conflicts/
  // 并标记 skippedPromptPaths，确保 Phase 2 不把它们再当孤立项处理。
  interface ParsedPrompt {
    prompt: Prompt;
    filePath: string;
  }
  const parsedByFile: Array<ParsedPrompt | null> = [];
  let skippedPrompts = 0;

  for (const promptFile of promptFiles) {
    try {
      const prompt = parsePromptFile(promptFile);
      parsedByFile.push({
        prompt,
        filePath: promptFile,
      });
    } catch (error) {
      skippedPrompts++;
      skippedPromptPaths.add(path.resolve(promptFile));
      parsedByFile.push(null);
      console.error(
        `[prompt-workspace] failed to parse ${promptFile}, skipping:`,
        error,
      );
    }
  }

  // Group by prompt.id, pick newest.
  // 按 prompt.id 分组，取最新者。
  const byId = new Map<string, ParsedPrompt>();
  const losers: ParsedPrompt[] = [];
  for (const entry of parsedByFile) {
    if (!entry) continue;
    const existingWinner = byId.get(entry.prompt.id);
    if (!existingWinner) {
      byId.set(entry.prompt.id, entry);
      continue;
    }
    const a = toEpochMs(existingWinner.prompt.updatedAt);
    const b = toEpochMs(entry.prompt.updatedAt);
    if (b > a) {
      losers.push(existingWinner);
      byId.set(entry.prompt.id, entry);
    } else {
      losers.push(entry);
    }
  }

  for (const loser of losers) {
    console.warn(
      `[prompt-workspace] same-id conflict for prompt ${loser.prompt.id}: moving ${loser.filePath} to .trash/conflicts`,
    );
    skippedPromptPaths.add(path.resolve(loser.filePath));
    try {
      moveToTrash(getPromptCleanupPath(loser.filePath), "conflict");
    } catch (error) {
      // If we can't move the loser, at least ensure Phase 2 doesn't trash it
      // again; user can clean up manually via the conflicts/ folder.
      // 即使移动失败也已加入 skippedPromptPaths，Phase 2 不会重复回收。
      console.error(
        `[prompt-workspace] failed to trash conflict copy at ${loser.filePath}:`,
        error,
      );
    }
  }

  const existingPrompts = options.onlyIfNewer
    ? new Map(promptDb.getAll().map((prompt) => [prompt.id, prompt] as const))
    : null;

  let importedPrompts = 0;
  let versionCount = 0;
  for (const { prompt, filePath } of byId.values()) {
    if (existingPrompts) {
      const existing = existingPrompts.get(prompt.id);
      if (
        existing &&
        toEpochMs(existing.updatedAt) >= toEpochMs(prompt.updatedAt)
      ) {
        continue;
      }
    }

    try {
      promptDb.insertPromptDirect(prompt);
      importedPrompts++;
    } catch (error) {
      skippedPrompts++;
      skippedPromptPaths.add(path.resolve(filePath));
      console.error(
        `[prompt-workspace] failed to import prompt ${prompt.id} (${prompt.title}):`,
        error,
      );
      continue;
    }

    const versions = readPromptVersions(workspaceDir, filePath, prompt.id);
    for (const version of versions) {
      // insertVersionDirect is INSERT OR IGNORE — safe to call repeatedly.
      // insertVersionDirect 是 INSERT OR IGNORE，重复调用安全。
      try {
        promptDb.insertVersionDirect(version);
        versionCount++;
      } catch (error) {
        console.error(
          `[prompt-workspace] failed to import version ${version.id} of prompt ${prompt.id}:`,
          error,
        );
      }
    }
  }

  if (skippedFolders > 0 || skippedPrompts > 0 || losers.length > 0) {
    console.warn(
      `[prompt-workspace] import completed with skips: ${skippedFolders} folders, ${skippedPrompts} prompts, ${losers.length} conflict losers. ` +
        `See errors above. User data on disk is untouched; see .trash for orphans and .trash/conflicts for conflict losers.`,
    );
  }

  return {
    promptCount: importedPrompts,
    folderCount: importedFolders,
    versionCount,
    skippedPromptPaths,
  };
}

/**
 * Bootstrap strategy: decide what to do based on whether DB and workspace have
 * data, then act. Four quadrants:
 *
 * | DB  | WS  | action                              |
 * |-----|-----|-------------------------------------|
 * | ∅   | ∅   | noop (prevents startup churn)       |
 * | ✓   | ∅   | export DB → WS (e.g. 0.5.1 upgrade) |
 * | ∅   | ✓   | import WS → DB (data recovery path) |
 * | ✓   | ✓   | merge: WS→DB (newer-wins) then sync |
 *
 * v0.5.3: 核心修复。用四象限替代 v0.5.2 的二分逻辑，防止空 DB 触发无限重启。
 */
export function bootstrapPromptWorkspace(
  promptDb: PromptDB,
  folderDb: FolderDB,
): BootstrapResult {
  const workspaceDir = getWorkspaceDir();
  const promptsDir = getPromptsWorkspaceDir();
  // v0.5.3 review-follow-up: include folder presence when judging "DB has data",
  // otherwise a user whose prompts were all deleted but folders retained would
  // wrongly enter Quadrant 3 and re-import stale workspace files.
  // v0.5.3 review 反馈修复：判断 DB 是否有数据需同时检查 folders，否则删光 prompts
  // 但保留 folders 的用户会误入 Q3 并从工作区重新导入旧数据。
  const hasDatabaseData =
    promptDb.getAll().length > 0 || folderDb.getAll().length > 0;
  const hasWorkspaceData = workspaceHasPromptData(promptsDir, workspaceDir);
  const restoreMarkerPresent = hasRestoreMarker();

  if (!hasDatabaseData && !hasWorkspaceData) {
    // Quadrant 1: fresh install or cleared state. Do nothing; avoid creating
    // empty directories/files that would mask future recovery attempts.
    // 象限 1：全新安装或全部清空状态。不做任何动作，避免创建空目录/文件干扰后续恢复。
    if (restoreMarkerPresent) {
      // Stale marker from a previous restore that produced no data. Clean up.
      // 清理上次恢复遗留但未产生数据的 marker。
      clearRestoreMarker();
    }
    return {
      quadrant: "empty",
      imported: false,
      exported: false,
      promptCount: 0,
      folderCount: 0,
      versionCount: 0,
    };
  }

  if (hasDatabaseData && !hasWorkspaceData) {
    // Quadrant 2: DB has data, workspace empty (0.5.1 → 0.5.3 upgrade path).
    // 象限 2：DB 有数据但工作区为空（0.5.1 → 0.5.3 升级路径）。
    const result = syncPromptWorkspaceFromDatabase(promptDb, folderDb);
    if (restoreMarkerPresent) {
      clearRestoreMarker();
    }
    return {
      quadrant: "db-only",
      imported: false,
      exported: true,
      ...result,
      ...(restoreMarkerPresent ? { restoreMarkerUsed: true } : {}),
    };
  }

  if (!hasDatabaseData && hasWorkspaceData) {
    // Quadrant 3: workspace has data, DB empty. Import WS → DB. Do NOT
    // re-export afterwards — workspace already is the authoritative state.
    // 象限 3：工作区有数据但 DB 为空。仅导入 WS → DB，不反向同步，
    // 工作区已是权威状态。
    const result = importPromptWorkspaceIntoDatabase(promptDb, folderDb);
    if (restoreMarkerPresent) {
      // DB was empty despite marker — restore likely failed or produced no rows.
      // Clear the marker so next boot does not skip Phase 1 needlessly.
      // DB 为空说明恢复无效，清除 marker 以免下次启动继续跳 Phase 1。
      clearRestoreMarker();
    }
    return {
      quadrant: "workspace-only",
      imported: true,
      exported: false,
      promptCount: result.promptCount,
      folderCount: result.folderCount,
      versionCount: result.versionCount,
    };
  }

  // Quadrant 4: both sides have data → merge.
  // v0.5.3 review-follow-up: if a restore marker is present, the DB was just
  // restored from a backup/WebDAV snapshot. Skip Phase 1 (WS → DB) to prevent
  // records deleted before the restore from being re-imported from workspace
  // files that still hold their pre-deletion state. Only run Phase 2 so the
  // workspace realigns with the restored DB, then clear the marker.
  // v0.5.3 review 反馈修复：若存在恢复标记，说明 DB 刚从备份/WebDAV 快照恢复。
  // 跳过 Phase 1（WS → DB）避免删除记录被工作区旧文件"复活"；仅执行 Phase 2
  // 让工作区对齐恢复后的 DB，完成后清除 marker。
  if (restoreMarkerPresent) {
    const exported = syncPromptWorkspaceFromDatabase(promptDb, folderDb);
    clearRestoreMarker();
    return {
      quadrant: "both",
      imported: false,
      exported: true,
      promptCount: exported.promptCount,
      folderCount: exported.folderCount,
      versionCount: exported.versionCount,
      restoreMarkerUsed: true,
    };
  }

  // Phase 1: import workspace entries newer than their DB counterparts.
  // Phase 2: re-sync DB → workspace (incremental, trashes orphans).
  // 阶段 1：将比 DB 更新的工作区条目导入；阶段 2：DB → 工作区增量同步，回收孤立项。
  // v0.5.3 review 反馈修复：把 Phase 1 的 skippedPromptPaths 传给 Phase 2，
  // 避免解析失败或冲突 loser 的目录被当作 orphan 再次送入 trash。
  const imported = importPromptWorkspaceIntoDatabase(promptDb, folderDb, {
    onlyIfNewer: true,
  });
  const exported = syncPromptWorkspaceFromDatabase(promptDb, folderDb, {
    skipTrashPaths: imported.skippedPromptPaths,
  });
  return {
    quadrant: "both",
    imported: imported.promptCount > 0 || imported.folderCount > 0,
    exported: true,
    promptCount: exported.promptCount,
    folderCount: exported.folderCount,
    versionCount: exported.versionCount,
  };
}

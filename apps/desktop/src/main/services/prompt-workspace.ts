import {
  dedupKey,
  formatFrontmatter,
  formatPromptBody,
  promptFrontmatter,
  versionFrontmatter,
  collectFolderMetadataFiles,
  readFoldersFile,
  collectPromptFiles,
  getPromptVersionDir,
  toEpochMs,
  parsePromptFile,
  readPromptVersions,
  workspaceHasPromptData,
  FOLDERS_FILE_NAME,
  FOLDER_METADATA_FILE_NAME,
  PROMPT_FILE_NAME,
  VERSION_ROOT_DIR_NAME,
  TRASH_DIR_NAME,
  TRASH_CONFLICTS_SUBDIR,
  TRASH_RETENTION,
} from "@prompthub/core/prompt-workspace/codec";
import fs from "fs";
import path from "path";

import type * as Db from "@prompthub/db";
import type { Folder, Prompt, PromptVersion } from "@prompthub/shared/types";
import { FolderDB } from "../database/folder";
import { PromptDB } from "../database/prompt";
import { getWorkspaceDir, getPromptsWorkspaceDir } from "../runtime-paths";
import {
  orderFoldersForImport,
  orderPromptsForImport,
} from "./prompt-workspace-import-order";

export { writeRestoreMarker } from "./prompt-workspace-restore-marker";

interface PromptWorkspaceSyncResult {
  promptCount: number;
  folderCount: number;
  versionCount: number;
}

/** Explicit import reports skipped source files for review. */
interface PromptWorkspaceImportResult extends PromptWorkspaceSyncResult {
  skippedPromptPaths: Set<string>;
  promptIds: Set<string>;
}

interface PromptWorkspaceImportOptions {
  onlyIfNewer?: boolean;
  preserveSource?: boolean;
  replaceCurrentPromptSet?: boolean;
  sourcePromptsDir?: string;
  sourceWorkspaceDir?: string;
  strict?: boolean;
}

interface ParsedPrompt {
  prompt: Prompt;
  filePath: string;
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
    const folderDir = path.join(
      promptsDir,
      ...buildFolderSegments(folder.id, folderMap),
    );
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
  const folderSegments = buildFolderSegments(
    prompt.folderId ?? null,
    folderMap,
  );
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

function getPromptCleanupPath(promptFilePath: string): string {
  if (path.basename(promptFilePath) === PROMPT_FILE_NAME) {
    return path.dirname(promptFilePath);
  }

  return promptFilePath;
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

function cleanupLegacyVersionDirs(
  workspaceDir: string,
  promptIds: Set<string>,
): void {
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

/**
 * Normalize a timestamp value to a numeric epoch (ms) for comparison.
 * DB rows store integer ms while typed as `string`; file metadata stores ISO.
 * Always compare through this to avoid number-vs-string coercion bugs.
 *
 * 将时间戳归一化为毫秒数以便比较。DB 中是整数毫秒但类型标注为 string；
 * 文件元数据是 ISO。比较前统一转换，避免 number vs string 比较的隐蔽 bug。
 */

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

  const sorted = [...versions].sort(
    (left, right) => left.version - right.version,
  );
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
 * Export the full DB workspace and trash orphan files/directories.
 * Called only by explicit workspace export operations.
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
    const legacyPromptPath = path.resolve(
      path.join(legacyDir, PROMPT_FILE_NAME),
    );
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
 * Explicit workspace import and verified historical recovery. Startup conversion
 * is owned by Core prompt-workspace-v1.
 *
 * @param options.onlyIfNewer when true, skip prompts whose DB record has a
 *                            newer updatedAt than the file.
 *                            为 true 时跳过 DB 中 updatedAt 比文件新的记录。
 */
export function importPromptWorkspaceIntoDatabase(
  promptDb: Db.PromptDB,
  folderDb: Db.FolderDB,
  options: PromptWorkspaceImportOptions = {},
): PromptWorkspaceImportResult {
  const workspaceDir = options.sourceWorkspaceDir ?? getWorkspaceDir();
  const promptsDir = options.sourcePromptsDir ?? getPromptsWorkspaceDir();
  const folders = readFoldersFile(workspaceDir, promptsDir, options.strict);
  const sourceFolderIds = new Set(folders.map((folder) => folder.id));
  const promptFiles = collectPromptFiles(promptsDir);

  const skippedPromptPaths = new Set<string>();

  if (!workspaceHasPromptData(promptsDir, workspaceDir)) {
    return {
      promptCount: 0,
      folderCount: 0,
      versionCount: 0,
      skippedPromptPaths,
      promptIds: new Set(),
    };
  }

  // Folders first so prompt folder_id FK is satisfied.
  // 先插入文件夹以满足外键约束。
  const existingFolders = options.onlyIfNewer
    ? new Map(folderDb.getAll().map((folder) => [folder.id, folder] as const))
    : null;
  const existingFolderIds = new Set(
    options.replaceCurrentPromptSet
      ? []
      : folderDb.getAll().map((folder) => folder.id),
  );
  let importedFolders = 0;
  let skippedFolders = 0;
  const orderedFolders = orderFoldersForImport(
    folders,
    existingFolderIds,
    options.strict === true,
  );
  for (const folder of orderedFolders) {
    const existing = existingFolders?.get(folder.id);
    if (
      existing &&
      toEpochMs(existing.updatedAt) >= toEpochMs(folder.updatedAt)
    ) {
      continue;
    }
    try {
      folderDb.insertFolderDirect(folder);
      importedFolders += 1;
    } catch (error) {
      if (options.strict) throw error;
      skippedFolders += 1;
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
  const parsedByFile: Array<ParsedPrompt | null> = [];
  let skippedPrompts = 0;

  for (const promptFile of promptFiles) {
    try {
      const prompt = parsePromptFile(promptFile);
      if (options.strict && (!prompt.id || prompt.id === "undefined")) {
        throw new Error(`Prompt file is missing an id: ${promptFile}`);
      }
      parsedByFile.push({
        prompt,
        filePath: promptFile,
      });
    } catch (error) {
      if (options.strict) throw error;
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
    if (options.strict) {
      throw new Error(`Duplicate Prompt id in workspace: ${loser.prompt.id}`);
    }
    console.warn(
      `[prompt-workspace] same-id conflict for prompt ${loser.prompt.id}: moving ${loser.filePath} to .trash/conflicts`,
    );
    skippedPromptPaths.add(path.resolve(loser.filePath));
    try {
      if (!options.preserveSource) {
        moveToTrash(getPromptCleanupPath(loser.filePath), "conflict");
      }
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
  const supplementalVersions = options.replaceCurrentPromptSet
    ? promptDb.getAll().flatMap((prompt) => promptDb.getVersions(prompt.id))
    : [];

  let importedPrompts = 0;
  let versionCount = 0;
  const orderedPrompts = orderPromptsForImport(byId, options.strict === true);
  for (const { prompt, filePath } of orderedPrompts) {
    if (
      options.strict &&
      prompt.folderId &&
      !sourceFolderIds.has(prompt.folderId)
    ) {
      throw new Error(`Prompt references a missing folder: ${prompt.id}`);
    }
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
      if (options.strict) throw error;
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
        if (options.strict) throw error;
        console.error(
          `[prompt-workspace] failed to import version ${version.id} of prompt ${prompt.id}:`,
          error,
        );
      }
    }
  }

  const promptIds = new Set(byId.keys());
  if (options.replaceCurrentPromptSet) {
    for (const existing of promptDb.getAll()) {
      if (!promptIds.has(existing.id)) promptDb.delete(existing.id);
    }
    const currentPrompts = new Map(
      promptDb.getAll().map((prompt) => [prompt.id, prompt] as const),
    );
    for (const version of supplementalVersions) {
      const current = currentPrompts.get(version.promptId);
      if (current && version.version <= current.currentVersion) {
        promptDb.insertVersionDirect(version);
      }
    }
    for (const existing of folderDb.getAll()) {
      if (!sourceFolderIds.has(existing.id)) folderDb.delete(existing.id);
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
    promptIds,
  };
}

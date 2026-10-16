import fs from 'node:fs';
import path from 'node:path';
import type { FolderDB, PromptDB } from '@prompthub/db';
import type { Folder, Prompt, PromptVersion } from '@prompthub/shared';
import { getPromptWorkspaceExportDir } from '../runtime-paths.js';

/** Explicit Markdown export. SQLite owns current records and startup migration. */

const FOLDER_METADATA_FILE_NAME = '_folder.json';
const VERSION_ROOT_DIR_NAME = '.versions';
const SYSTEM_MARKER = '<!-- PROMPTHUB:SYSTEM -->';
const USER_MARKER = '<!-- PROMPTHUB:USER -->';
const MAX_WORKSPACE_PATH_BYTES = 900;
const MAX_WORKSPACE_SEGMENT_BYTES = 240;
const STAGING_DIR_PREFIX = '.prompts-staging-';
const BACKUP_DIR_PREFIX = '.prompts-backup-';

interface PromptWorkspaceSyncResult {
  promptCount: number;
  folderCount: number;
  versionCount: number;
}

function ensureDir(targetPath: string): void {
  fs.mkdirSync(targetPath, { recursive: true });
}

function slugify(input: string | null | undefined): string {
  const normalized = (input ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'untitled';
}

function padVersion(version: number): string {
  return String(version).padStart(4, '0');
}

function formatFrontmatter(metadata: Record<string, unknown>): string {
  const lines = Object.entries(metadata)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);

  return `---\n${lines.join('\n')}\n---\n`;
}

function formatPromptBody(systemPrompt: string | null | undefined, userPrompt: string): string {
  return [SYSTEM_MARKER, systemPrompt ?? '', '', USER_MARKER, userPrompt, ''].join('\n');
}

function promptFrontmatter(prompt: Prompt): Record<string, unknown> {
  return {
    id: prompt.id,
    ownerUserId: prompt.ownerUserId ?? null,
    visibility: prompt.visibility ?? 'private',
    title: prompt.title,
    description: prompt.description ?? null,
    promptType: prompt.promptType ?? 'text',
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
    usageCount: prompt.usageCount ?? 0,
    source: prompt.source ?? null,
    notes: prompt.notes ?? null,
    lastAiResponse: prompt.lastAiResponse ?? null,
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

function buildFolderSegments(folderId: string | null | undefined, folderMap: Map<string, Folder>): string[] {
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

function getPromptParentDirectory(promptsDir: string, folderMap: Map<string, Folder>, prompt: Prompt): string {
  const folderSegments = buildFolderSegments(prompt.folderId ?? null, folderMap);
  return path.join(promptsDir, ...folderSegments);
}

/**
 * 计算 `<slug>.md` 路径；如果已被占用，依次降级为
 * `<slug>-<id8>.md` → `<slug>-2.md` → `<slug>-3.md` ...。
 */
function getPromptFilePath(
  promptsDir: string,
  folderMap: Map<string, Folder>,
  prompt: Prompt,
  takenPaths: Set<string>,
): string {
  const parentDir = getPromptParentDirectory(promptsDir, folderMap, prompt);
  const baseSlug = slugify(prompt.title);

  const initialPath = path.join(parentDir, `${baseSlug}.md`);
  const resolvedInitialPath = path.resolve(initialPath);
  if (!takenPaths.has(resolvedInitialPath)) {
    takenPaths.add(resolvedInitialPath);
    return initialPath;
  }

  const fallbackPath = path.join(parentDir, `${baseSlug}-${prompt.id.slice(0, 8)}.md`);
  const resolvedFallbackPath = path.resolve(fallbackPath);
  if (!takenPaths.has(resolvedFallbackPath)) {
    takenPaths.add(resolvedFallbackPath);
    return fallbackPath;
  }

  let counter = 2;
  while (true) {
    const candidatePath = path.join(parentDir, `${baseSlug}-${counter}.md`);
    const resolvedCandidatePath = path.resolve(candidatePath);
    if (!takenPaths.has(resolvedCandidatePath)) {
      takenPaths.add(resolvedCandidatePath);
      return candidatePath;
    }
    counter += 1;
  }
}

function getPromptVersionDir(promptsDir: string, promptId: string): string {
  return path.join(promptsDir, VERSION_ROOT_DIR_NAME, promptId);
}

function getFolderMetadataPath(folderDir: string): string {
  return path.join(folderDir, FOLDER_METADATA_FILE_NAME);
}

function assertWorkspacePathFits(targetPath: string, label: string): void {
  if (Buffer.byteLength(targetPath, 'utf8') > MAX_WORKSPACE_PATH_BYTES) {
    throw new Error(`Sync snapshot is invalid: prompt workspace path is too long for ${label}`);
  }

  for (const segment of targetPath.split(path.sep)) {
    if (Buffer.byteLength(segment, 'utf8') > MAX_WORKSPACE_SEGMENT_BYTES) {
      throw new Error(`Sync snapshot is invalid: prompt workspace path segment is too long for ${label}`);
    }
  }
}

function validatePromptWorkspaceSnapshotPaths(
  folders: Folder[],
  prompts: Prompt[],
  promptVersions: PromptVersion[],
): void {
  const promptsDir = getPromptWorkspaceExportDir();
  const folderMap = new Map(folders.map((folder) => [folder.id, folder]));

  for (const folder of folders) {
    const folderDir = path.join(promptsDir, ...buildFolderSegments(folder.id, folderMap));
    assertWorkspacePathFits(folderDir, `folder ${folder.id}`);
    assertWorkspacePathFits(getFolderMetadataPath(folderDir), `folder ${folder.id}`);
  }

  const takenPromptPaths = new Set<string>();
  for (const prompt of prompts) {
    const promptPath = getPromptFilePath(promptsDir, folderMap, prompt, takenPromptPaths);
    assertWorkspacePathFits(path.dirname(promptPath), `prompt ${prompt.id}`);
    assertWorkspacePathFits(promptPath, `prompt ${prompt.id}`);
  }

  for (const version of promptVersions) {
    const versionPath = path.join(
      getPromptVersionDir(promptsDir, version.promptId),
      `${padVersion(version.version)}.md`,
    );
    assertWorkspacePathFits(versionPath, `prompt version ${version.id}`);
  }
}

function writeFolderMetadataFiles(promptsDir: string, folders: Folder[], folderMap: Map<string, Folder>): void {
  ensureDir(promptsDir);
  for (const folder of folders) {
    const folderDir = path.join(promptsDir, ...buildFolderSegments(folder.id, folderMap));
    ensureDir(folderDir);
    fs.writeFileSync(getFolderMetadataPath(folderDir), JSON.stringify(folder, null, 2), 'utf8');
  }
}

function createSiblingWorkspaceDir(promptsDir: string, prefix: string): string {
  ensureDir(path.dirname(promptsDir));
  return fs.mkdtempSync(path.join(path.dirname(promptsDir), prefix));
}

function removeDirectoryIfExists(targetPath: string): void {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function tryRemoveDirectory(targetPath: string): void {
  try {
    removeDirectoryIfExists(targetPath);
  } catch (error) {
    console.warn(`[prompt-workspace] failed to clean up ${targetPath}:`, error);
  }
}

function replacePromptWorkspace(promptsDir: string, stagingDir: string): void {
  const backupDir = createSiblingWorkspaceDir(promptsDir, BACKUP_DIR_PREFIX);
  removeDirectoryIfExists(backupDir);

  let liveMoved = false;
  try {
    if (fs.existsSync(promptsDir)) {
      fs.renameSync(promptsDir, backupDir);
      liveMoved = true;
    }

    fs.renameSync(stagingDir, promptsDir);
    tryRemoveDirectory(backupDir);
  } catch (error) {
    if (!fs.existsSync(promptsDir) && liveMoved && fs.existsSync(backupDir)) {
      fs.renameSync(backupDir, promptsDir);
    }
    throw error;
  }
}

function writePromptWorkspaceSnapshot(
  promptsDir: string,
  folderMap: Map<string, Folder>,
  prompts: Prompt[],
  versionsByPrompt: ReadonlyMap<string, PromptVersion[]>,
): { versionCount: number } {
  const takenPromptPaths = new Set<string>();
  let versionCount = 0;

  for (const prompt of prompts) {
    const promptPath = getPromptFilePath(promptsDir, folderMap, prompt, takenPromptPaths);
    ensureDir(path.dirname(promptPath));

    fs.writeFileSync(
      promptPath,
      `${formatFrontmatter(promptFrontmatter(prompt))}${formatPromptBody(prompt.systemPrompt, prompt.userPrompt)}`,
      'utf8',
    );

    const versions = (versionsByPrompt.get(prompt.id) ?? []).sort((left, right) => left.version - right.version);

    if (versions.length > 0) {
      const versionsDir = getPromptVersionDir(promptsDir, prompt.id);
      ensureDir(versionsDir);
      for (const version of versions) {
        fs.writeFileSync(
          path.join(versionsDir, `${padVersion(version.version)}.md`),
          `${formatFrontmatter(versionFrontmatter(version))}${formatPromptBody(version.systemPrompt, version.userPrompt)}`,
          'utf8',
        );
      }
      versionCount += versions.length;
    }
  }

  return { versionCount };
}

/**
 * 从 DB 导出整棵 Prompt workspace。先写入 sibling staging directory，
 * 完成后替换 live 目录；如果 staging 写入失败，保留旧 workspace。
 */
export function syncPromptWorkspaceFromDatabase(
  promptDb: PromptDB,
  folderDb: FolderDB,
): PromptWorkspaceSyncResult {
  const promptsDir = getPromptWorkspaceExportDir();
  const folders = folderDb.getAll();
  const prompts = promptDb.getAll();
  const versionsByPrompt = new Map(
    prompts.map((prompt) => [prompt.id, promptDb.getVersions(prompt.id)]),
  );
  const promptVersions = [...versionsByPrompt.values()].flat();
  validatePromptWorkspaceSnapshotPaths(folders, prompts, promptVersions);

  const folderMap = new Map(folders.map((folder) => [folder.id, folder]));
  const stagingDir = createSiblingWorkspaceDir(promptsDir, STAGING_DIR_PREFIX);

  try {
    writeFolderMetadataFiles(stagingDir, folders, folderMap);
    const { versionCount } = writePromptWorkspaceSnapshot(stagingDir, folderMap, prompts,
      versionsByPrompt,
    );
    replacePromptWorkspace(promptsDir, stagingDir);

    return {
      promptCount: prompts.length,
      folderCount: folders.length,
      versionCount,
    };
  } catch (error) {
    tryRemoveDirectory(stagingDir);
    throw error;
  }
}

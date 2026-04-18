import fs from 'node:fs';
import path from 'node:path';
import type { Database, FolderDB, PromptDB } from '@prompthub/db';
import type { Folder, Prompt, PromptVersion } from '@prompthub/shared';
import { getPromptsDir } from '../runtime-paths.js';

/**
 * Web 端 Prompt 工作区服务。
 *
 * 磁盘布局（与桌面端一致，见 apps/desktop/src/main/services/prompt-workspace.ts）：
 *
 * ```text
 * <promptsDir>/                      = <DATA_ROOT>/data/prompts/
 *   _folder.json                     (每文件夹一份元数据)
 *   <folder-slug>/
 *     _folder.json
 *     <prompt-slug>.md               (带 YAML frontmatter + SYSTEM/USER 正文)
 *     <prompt-slug>-<id8>.md         (同 slug 冲突降级)
 *   .versions/
 *     <promptId>/
 *       0001.md
 *       0002.md
 * ```
 *
 * 与桌面端的关键差异（本文件独有）：
 * 1. `ownerUserId` / `visibility` 写入 prompt frontmatter 和 `_folder.json`
 *    以保留多租户归属。
 * 2. `usageCount` / `lastAiResponse` 写入 prompt frontmatter（桌面端不持久化）。
 * 3. 同步采用推土机式 `rmSync(promptsDir) + 重写`——Web 服务进程独占数据目录，
 *    不需要 `.trash/`、同名冲突裁决、restore marker、四象限 bootstrap 等保护。
 */

const FOLDER_METADATA_FILE_NAME = '_folder.json';
const VERSION_ROOT_DIR_NAME = '.versions';
const SYSTEM_MARKER = '<!-- PROMPTHUB:SYSTEM -->';
const USER_MARKER = '<!-- PROMPTHUB:USER -->';

interface FrontmatterResult {
  metadata: Record<string, unknown>;
  body: string;
}

interface PromptWorkspaceSyncResult {
  promptCount: number;
  folderCount: number;
  versionCount: number;
}

interface FolderRowMeta {
  id: string;
  owner_user_id: string | null;
  visibility: 'private' | 'shared';
}

interface PromptRowMeta {
  id: string;
  owner_user_id: string | null;
  visibility: 'private' | 'shared';
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

function parseFrontmatter(raw: string): FrontmatterResult {
  if (!raw.startsWith('---\n')) {
    return { metadata: {}, body: raw };
  }

  const endIndex = raw.indexOf('\n---\n', 4);
  if (endIndex === -1) {
    return { metadata: {}, body: raw };
  }

  const metadataBlock = raw.slice(4, endIndex);
  const body = raw.slice(endIndex + 5);
  const metadata: Record<string, unknown> = {};

  for (const line of metadataBlock.split('\n')) {
    const separatorIndex = line.indexOf(':');
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
  return [SYSTEM_MARKER, systemPrompt ?? '', '', USER_MARKER, userPrompt, ''].join(
    '\n',
  );
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

  const fallbackPath = path.join(
    parentDir,
    `${baseSlug}-${prompt.id.slice(0, 8)}.md`,
  );
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

function writeFolderMetadataFiles(
  promptsDir: string,
  folders: Folder[],
  folderMap: Map<string, Folder>,
): void {
  ensureDir(promptsDir);
  for (const folder of folders) {
    const folderDir = path.join(
      promptsDir,
      ...buildFolderSegments(folder.id, folderMap),
    );
    ensureDir(folderDir);
    fs.writeFileSync(
      getFolderMetadataPath(folderDir),
      JSON.stringify(folder, null, 2),
      'utf8',
    );
  }
}

function collectPromptFiles(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const files: string[] = [];

  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolutePath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // 跳过版本目录（.versions/ 与历史遗留 versions/）
        if (entry.name === VERSION_ROOT_DIR_NAME || entry.name === 'versions') {
          continue;
        }
        walk(absolutePath);
        continue;
      }

      if (
        entry.isFile() &&
        entry.name.endsWith('.md') &&
        entry.name !== FOLDER_METADATA_FILE_NAME
      ) {
        files.push(absolutePath);
      }
    }
  };

  walk(rootDir);
  return files;
}

function collectFolderMetadataFiles(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === VERSION_ROOT_DIR_NAME) continue;
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
        return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Folder;
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

function toIsoString(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  return fallback;
}

function parsePromptFile(filePath: string): Prompt {
  const { metadata, body } = parseFrontmatter(fs.readFileSync(filePath, 'utf8'));
  const parsedBody = parsePromptBody(body);
  const now = new Date().toISOString();

  return {
    id: String(metadata.id),
    ownerUserId:
      typeof metadata.ownerUserId === 'string' ? metadata.ownerUserId : null,
    visibility: metadata.visibility === 'shared' ? 'shared' : 'private',
    title: String(metadata.title ?? 'Untitled Prompt'),
    description:
      typeof metadata.description === 'string' ? metadata.description : null,
    promptType:
      metadata.promptType === 'image' || metadata.promptType === 'video'
        ? metadata.promptType
        : 'text',
    systemPrompt: parsedBody.systemPrompt,
    systemPromptEn:
      typeof metadata.systemPromptEn === 'string'
        ? metadata.systemPromptEn
        : null,
    userPrompt: parsedBody.userPrompt,
    userPromptEn:
      typeof metadata.userPromptEn === 'string' ? metadata.userPromptEn : null,
    variables: Array.isArray(metadata.variables)
      ? (metadata.variables as Prompt['variables'])
      : [],
    tags: Array.isArray(metadata.tags) ? (metadata.tags as string[]) : [],
    folderId: typeof metadata.folderId === 'string' ? metadata.folderId : null,
    images: Array.isArray(metadata.images) ? (metadata.images as string[]) : [],
    videos: Array.isArray(metadata.videos) ? (metadata.videos as string[]) : [],
    isFavorite: metadata.isFavorite === true,
    isPinned: metadata.isPinned === true,
    version:
      typeof metadata.currentVersion === 'number' ? metadata.currentVersion : 1,
    currentVersion:
      typeof metadata.currentVersion === 'number' ? metadata.currentVersion : 1,
    usageCount:
      typeof metadata.usageCount === 'number' ? metadata.usageCount : 0,
    source: typeof metadata.source === 'string' ? metadata.source : null,
    notes: typeof metadata.notes === 'string' ? metadata.notes : null,
    lastAiResponse:
      typeof metadata.lastAiResponse === 'string'
        ? metadata.lastAiResponse
        : null,
    createdAt: toIsoString(metadata.createdAt, now),
    updatedAt: toIsoString(metadata.updatedAt, now),
  };
}

function parseVersionFile(filePath: string, promptId: string): PromptVersion {
  const { metadata, body } = parseFrontmatter(fs.readFileSync(filePath, 'utf8'));
  const parsedBody = parsePromptBody(body);

  return {
    id: String(metadata.id),
    promptId,
    version:
      typeof metadata.version === 'number'
        ? metadata.version
        : Number.parseInt(path.basename(filePath, '.md'), 10) || 1,
    systemPrompt: parsedBody.systemPrompt,
    systemPromptEn:
      typeof metadata.systemPromptEn === 'string'
        ? metadata.systemPromptEn
        : null,
    userPrompt: parsedBody.userPrompt,
    userPromptEn:
      typeof metadata.userPromptEn === 'string' ? metadata.userPromptEn : null,
    variables: Array.isArray(metadata.variables)
      ? (metadata.variables as PromptVersion['variables'])
      : [],
    note: typeof metadata.note === 'string' ? metadata.note : null,
    aiResponse:
      typeof metadata.aiResponse === 'string' ? metadata.aiResponse : null,
    createdAt: toIsoString(metadata.createdAt, new Date().toISOString()),
  };
}

function readPromptVersions(
  promptsDir: string,
  promptId: string,
): PromptVersion[] {
  const versionsDir = getPromptVersionDir(promptsDir, promptId);
  if (!fs.existsSync(versionsDir)) {
    return [];
  }

  return fs
    .readdirSync(versionsDir)
    .filter((file) => file.endsWith('.md'))
    .sort()
    .map((file) => parseVersionFile(path.join(versionsDir, file), promptId));
}

function workspaceHasPromptData(promptsDir: string): boolean {
  if (collectPromptFiles(promptsDir).length > 0) {
    return true;
  }
  return collectFolderMetadataFiles(promptsDir).length > 0;
}

function resolveOwnerUserId(
  db: Database.Database,
  ownerUserId: string | null | undefined,
): string | null {
  if (!ownerUserId) {
    return null;
  }

  const row = db
    .prepare('SELECT id FROM users WHERE id = ?')
    .get(ownerUserId) as { id: string } | undefined;

  return row?.id ?? null;
}

function listAllFolders(db: Database.Database, folderDb: FolderDB): Folder[] {
  const rows = db
    .prepare(
      'SELECT id, owner_user_id, visibility FROM folders ORDER BY sort_order ASC',
    )
    .all() as FolderRowMeta[];

  return rows
    .map((row) => {
      const folder = folderDb.getById(row.id);
      if (!folder) {
        return null;
      }
      return {
        ...folder,
        ownerUserId: row.owner_user_id,
        visibility: row.visibility,
      } as Folder;
    })
    .filter((folder): folder is Folder => folder !== null);
}

function listAllPrompts(db: Database.Database, promptDb: PromptDB): Prompt[] {
  const rows = db
    .prepare(
      'SELECT id, owner_user_id, visibility FROM prompts ORDER BY updated_at DESC',
    )
    .all() as PromptRowMeta[];

  return rows
    .map((row) => {
      const prompt = promptDb.getById(row.id);
      if (!prompt) {
        return null;
      }
      return {
        ...prompt,
        ownerUserId: row.owner_user_id,
        visibility: row.visibility,
      } as Prompt;
    })
    .filter((prompt): prompt is Prompt => prompt !== null);
}

function updateFolderOwnership(db: Database.Database, folder: Folder): void {
  db.prepare(
    'UPDATE folders SET owner_user_id = ?, visibility = ? WHERE id = ?',
  ).run(
    resolveOwnerUserId(db, folder.ownerUserId),
    folder.visibility ?? 'private',
    folder.id,
  );
}

function updatePromptOwnership(db: Database.Database, prompt: Prompt): void {
  db.prepare(
    'UPDATE prompts SET owner_user_id = ?, visibility = ? WHERE id = ?',
  ).run(
    resolveOwnerUserId(db, prompt.ownerUserId),
    prompt.visibility ?? 'private',
    prompt.id,
  );
}

/**
 * 推土机式同步：清空 `<promptsDir>` 后按 DB 重写整棵文件树。
 *
 * 安全性：Web 服务进程独占数据卷、用户不会手动改文件，因此无需桌面端的
 * `.trash/` 软删除保护。数据安全由上层的 `.phub.gz` 备份机制兜底。
 */
export function syncPromptWorkspaceFromDatabase(
  db: Database.Database,
  promptDb: PromptDB,
  folderDb: FolderDB,
): PromptWorkspaceSyncResult {
  const promptsDir = getPromptsDir();
  const folders = listAllFolders(db, folderDb);
  const prompts = listAllPrompts(db, promptDb);
  const folderMap = new Map(folders.map((folder) => [folder.id, folder]));

  fs.rmSync(promptsDir, { recursive: true, force: true });
  ensureDir(promptsDir);

  writeFolderMetadataFiles(promptsDir, folders, folderMap);

  const takenPromptPaths = new Set<string>();
  let versionCount = 0;

  for (const prompt of prompts) {
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
      'utf8',
    );

    const versions = promptDb
      .getVersions(prompt.id)
      .sort((left, right) => left.version - right.version);

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

  return {
    promptCount: prompts.length,
    folderCount: folders.length,
    versionCount,
  };
}

/**
 * 从磁盘导入 Prompt 到数据库。用于 bootstrap 阶段：当磁盘有内容而 DB 为空
 * （典型场景：容器重建、从备份卷挂载启动）时把文件树灌入数据库。
 */
export function importPromptWorkspaceIntoDatabase(
  db: Database.Database,
  promptDb: PromptDB,
  folderDb: FolderDB,
): PromptWorkspaceSyncResult {
  const promptsDir = getPromptsDir();

  if (!workspaceHasPromptData(promptsDir)) {
    return { promptCount: 0, folderCount: 0, versionCount: 0 };
  }

  const folders = readFolderMetadataFiles(promptsDir);
  const promptFiles = collectPromptFiles(promptsDir);

  for (const folder of folders) {
    folderDb.insertFolderDirect(folder);
    updateFolderOwnership(db, folder);
  }

  let versionCount = 0;
  for (const promptFile of promptFiles) {
    const prompt = parsePromptFile(promptFile);
    promptDb.insertPromptDirect(prompt);
    updatePromptOwnership(db, prompt);

    const versions = readPromptVersions(promptsDir, prompt.id);
    for (const version of versions) {
      promptDb.insertVersionDirect(version);
    }
    versionCount += versions.length;
  }

  return {
    promptCount: promptFiles.length,
    folderCount: folders.length,
    versionCount,
  };
}

/**
 * 启动时对齐 DB ↔ 磁盘：
 * - DB 空且磁盘有内容 → 先从磁盘灌入 DB，再同步回磁盘（规范化文件名）。
 * - 其它情况 → 直接以 DB 为准重写磁盘。
 */
export function bootstrapPromptWorkspace(
  db: Database.Database,
  promptDb: PromptDB,
  folderDb: FolderDB,
): { imported: boolean; exported: boolean } {
  const promptsDir = getPromptsDir();
  const hasDatabasePrompts = promptDb.getAll().length > 0;
  const hasWorkspaceData = workspaceHasPromptData(promptsDir);

  if (!hasDatabasePrompts && hasWorkspaceData) {
    importPromptWorkspaceIntoDatabase(db, promptDb, folderDb);
    syncPromptWorkspaceFromDatabase(db, promptDb, folderDb);
    return { imported: true, exported: true };
  }

  syncPromptWorkspaceFromDatabase(db, promptDb, folderDb);
  return { imported: false, exported: true };
}

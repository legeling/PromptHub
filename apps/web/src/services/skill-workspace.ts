import fs from 'node:fs';
import path from 'node:path';
import type { Database, SkillDB } from '@prompthub/db';
import type { Skill, SkillFileSnapshot, SkillVersion } from '@prompthub/shared';
import { getSkillsDir } from '../runtime-paths.js';

const SKILL_FILE_NAME = 'SKILL.md';
const SKILL_META_FILE_NAME = 'skill.json';
const VERSIONS_DIR_NAME = 'versions';
const MAX_WORKSPACE_PATH_BYTES = 900;
const MAX_WORKSPACE_SEGMENT_BYTES = 240;
const STAGING_DIR_PREFIX = '.skills-staging-';
const BACKUP_DIR_PREFIX = '.skills-backup-';

interface SkillWorkspaceSyncResult {
  skillCount: number;
  versionCount: number;
}

interface SkillRowMeta {
  id: string;
  owner_user_id: string | null;
  visibility: 'private' | 'shared';
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

function ensureDir(targetPath: string): void {
  fs.mkdirSync(targetPath, { recursive: true });
}

function createSiblingWorkspaceDir(skillsDir: string, prefix: string): string {
  ensureDir(path.dirname(skillsDir));
  return fs.mkdtempSync(path.join(path.dirname(skillsDir), prefix));
}

function removeDirectoryIfExists(targetPath: string): void {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function tryRemoveDirectory(targetPath: string): void {
  try {
    removeDirectoryIfExists(targetPath);
  } catch (error) {
    console.warn(`[skill-workspace] failed to clean up ${targetPath}:`, error);
  }
}

function isWorkspaceScratchDirectory(name: string): boolean {
  return name.startsWith(STAGING_DIR_PREFIX) || name.startsWith(BACKUP_DIR_PREFIX);
}

function replaceSkillWorkspace(skillsDir: string, stagingDir: string): void {
  const backupDir = createSiblingWorkspaceDir(skillsDir, BACKUP_DIR_PREFIX);
  removeDirectoryIfExists(backupDir);

  let liveMoved = false;
  try {
    if (fs.existsSync(skillsDir)) {
      fs.renameSync(skillsDir, backupDir);
      liveMoved = true;
    }

    fs.renameSync(stagingDir, skillsDir);
    tryRemoveDirectory(backupDir);
  } catch (error) {
    if (!fs.existsSync(skillsDir) && liveMoved && fs.existsSync(backupDir)) {
      fs.renameSync(backupDir, skillsDir);
    }
    throw error;
  }
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

function getSkillDirectory(skillsDir: string, skill: Skill): string {
  return path.join(skillsDir, `${slugify(skill.name)}__${skill.id}`);
}

function getSkillVersionPath(skillDir: string, version: SkillVersion): string {
  return path.join(
    skillDir,
    VERSIONS_DIR_NAME,
    `${padVersion(version.version)}.json`,
  );
}

function assertWorkspacePathFits(targetPath: string, label: string): void {
  if (Buffer.byteLength(targetPath, 'utf8') > MAX_WORKSPACE_PATH_BYTES) {
    throw new Error(
      `Sync snapshot is invalid: skill workspace path is too long for ${label}`,
    );
  }

  for (const segment of targetPath.split(path.sep)) {
    if (Buffer.byteLength(segment, 'utf8') > MAX_WORKSPACE_SEGMENT_BYTES) {
      throw new Error(
        `Sync snapshot is invalid: skill workspace path segment is too long for ${label}`,
      );
    }
  }
}

function normalizeWorkspaceRelativePath(relativePath: string): string {
  if (/[\u0000-\u001F\u007F]/u.test(relativePath)) {
    throw new Error(`Invalid skill file path: ${relativePath}`);
  }

  const normalized = path.posix.normalize(relativePath.replace(/\\/g, '/'));
  if (
    normalized === '' ||
    normalized === '.' ||
    normalized === '..' ||
    path.posix.isAbsolute(normalized) ||
    /^[a-zA-Z]:/u.test(relativePath) ||
    normalized.startsWith('../')
  ) {
    throw new Error(`Invalid skill file path: ${relativePath}`);
  }

  return normalized;
}

function isReservedWorkspaceFile(relativePath: string): boolean {
  const normalized = normalizeWorkspaceRelativePath(relativePath).toLowerCase();
  return (
    normalized === SKILL_META_FILE_NAME.toLowerCase() ||
    normalized === VERSIONS_DIR_NAME.toLowerCase() ||
    normalized.startsWith(`${VERSIONS_DIR_NAME.toLowerCase()}/`)
  );
}

function isPrimarySkillFile(relativePath: string): boolean {
  return normalizeWorkspaceRelativePath(relativePath).toLowerCase() === SKILL_FILE_NAME.toLowerCase();
}

function collectAdditionalSkillFiles(
  skillDir: string,
  rootDir: string = skillDir,
): SkillFileSnapshot[] {
  if (!fs.existsSync(skillDir)) {
    return [];
  }

  const snapshots: SkillFileSnapshot[] = [];
  for (const entry of fs.readdirSync(skillDir, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(skillDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === VERSIONS_DIR_NAME) {
        continue;
      }

      snapshots.push(...collectAdditionalSkillFiles(entryPath, rootDir));
      continue;
    }

    const relativePath = path.relative(rootDir, entryPath).split(path.sep).join('/');
    if (isReservedWorkspaceFile(relativePath) || isPrimarySkillFile(relativePath)) {
      continue;
    }

    snapshots.push({
      relativePath,
      content: fs.readFileSync(entryPath, 'utf8'),
    });
  }

  return snapshots;
}

function readAdditionalSkillFileMap(skillsDir: string): Map<string, SkillFileSnapshot[]> {
  const fileMap = new Map<string, SkillFileSnapshot[]>();
  for (const skillDir of collectSkillDirectories(skillsDir)) {
    const metadata = parseSkillMetadata(path.join(skillDir, SKILL_META_FILE_NAME));
    const files = collectAdditionalSkillFiles(skillDir);
    if (files.length > 0) {
      fileMap.set(metadata.id, files);
    }
  }

  return fileMap;
}

function writeSkillFileSnapshots(skillDir: string, files: SkillFileSnapshot[]): void {
  for (const file of files) {
    const relativePath = normalizeWorkspaceRelativePath(file.relativePath);
    if (isReservedWorkspaceFile(relativePath)) {
      throw new Error(`Reserved skill file path is not allowed: ${file.relativePath}`);
    }

    const targetPath = path.join(skillDir, relativePath);
    ensureDir(path.dirname(targetPath));
    fs.writeFileSync(targetPath, file.content, 'utf8');
  }
}

export function validateSkillWorkspaceSnapshotPaths(
  skills: Skill[],
  skillVersions: SkillVersion[],
  skillFilesById?: Record<string, SkillFileSnapshot[]>,
): void {
  const skillsDir = getSkillsDir();
  const skillById = new Map(skills.map((skill) => [skill.id, skill]));

  for (const skill of skills) {
    const skillDir = getSkillDirectory(skillsDir, skill);
    assertWorkspacePathFits(skillDir, `skill ${skill.id}`);
    assertWorkspacePathFits(
      path.join(skillDir, SKILL_META_FILE_NAME),
      `skill ${skill.id}`,
    );
    assertWorkspacePathFits(
      path.join(skillDir, SKILL_FILE_NAME),
      `skill ${skill.id}`,
    );

    for (const file of skillFilesById?.[skill.id] ?? []) {
      const relativePath = normalizeWorkspaceRelativePath(file.relativePath);
      if (isReservedWorkspaceFile(relativePath)) {
        throw new Error(`Reserved skill file path is not allowed: ${file.relativePath}`);
      }
      assertWorkspacePathFits(
        path.join(skillDir, relativePath),
        `skill file ${skill.id}:${relativePath}`,
      );
    }
  }

  for (const version of skillVersions) {
    const skill = skillById.get(version.skillId);
    if (!skill) {
      continue;
    }

    const skillDir = getSkillDirectory(skillsDir, skill);
    assertWorkspacePathFits(
      getSkillVersionPath(skillDir, version),
      `skill version ${version.id}`,
    );

    for (const file of version.filesSnapshot ?? []) {
      const relativePath = normalizeWorkspaceRelativePath(file.relativePath);
      if (isReservedWorkspaceFile(relativePath)) {
        throw new Error(`Reserved skill file path is not allowed: ${file.relativePath}`);
      }
      assertWorkspacePathFits(
        path.join(skillDir, relativePath),
        `skill version file ${version.id}:${relativePath}`,
      );
    }
  }
}

function listAllSkills(
  db: Database.Database,
  skillDb: SkillDB,
): Skill[] {
  const rows = db
    .prepare(
      'SELECT id, owner_user_id, visibility FROM skills ORDER BY updated_at DESC',
    )
    .all() as SkillRowMeta[];

  const skills: Skill[] = [];
  for (const row of rows) {
    const skill = skillDb.getById(row.id);
    if (!skill) {
      continue;
    }

    skills.push({
      ...skill,
      ownerUserId: row.owner_user_id,
      visibility: row.visibility,
    });
  }

  return skills;
}

function toSkillMetadata(skill: Skill): Record<string, unknown> {
  return {
    id: skill.id,
    ownerUserId: skill.ownerUserId ?? null,
    visibility: skill.visibility ?? 'private',
    name: skill.name,
    description: skill.description ?? null,
    protocol_type: skill.protocol_type,
    version: skill.version ?? null,
    author: skill.author ?? null,
    source_url: skill.source_url ?? null,
    local_repo_path: skill.local_repo_path ?? null,
    tags: skill.tags ?? [],
    original_tags: skill.original_tags ?? [],
    is_favorite: skill.is_favorite,
    currentVersion: skill.currentVersion ?? 0,
    versionTrackingEnabled: skill.versionTrackingEnabled ?? true,
    icon_url: skill.icon_url ?? null,
    icon_emoji: skill.icon_emoji ?? null,
    icon_background: skill.icon_background ?? null,
    category: skill.category ?? 'general',
    is_builtin: skill.is_builtin ?? false,
    registry_slug: skill.registry_slug ?? null,
    content_url: skill.content_url ?? null,
    prerequisites: skill.prerequisites ?? [],
    compatibility: skill.compatibility ?? [],
    mcp_config: skill.mcp_config ?? null,
    safetyReport: skill.safetyReport ?? null,
    created_at: skill.created_at,
    updated_at: skill.updated_at,
  };
}

function parseSkillMetadata(filePath: string): Skill {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Skill;
  return parsed;
}

function readSkillContent(skillDir: string): string {
  const skillFile = path.join(skillDir, SKILL_FILE_NAME);
  if (!fs.existsSync(skillFile)) {
    return '';
  }

  return fs.readFileSync(skillFile, 'utf8');
}

function readSkillVersions(skillDir: string): SkillVersion[] {
  const versionsDir = path.join(skillDir, VERSIONS_DIR_NAME);
  if (!fs.existsSync(versionsDir)) {
    return [];
  }

  return fs
    .readdirSync(versionsDir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) =>
      JSON.parse(
        fs.readFileSync(path.join(versionsDir, file), 'utf8'),
      ) as SkillVersion,
    );
}

function collectSkillDirectories(skillsDir: string): string[] {
  if (!fs.existsSync(skillsDir)) {
    return [];
  }

  return fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !isWorkspaceScratchDirectory(entry.name))
    .map((entry) => path.join(skillsDir, entry.name))
    .filter((skillDir) =>
      fs.existsSync(path.join(skillDir, SKILL_META_FILE_NAME)),
    );
}

function workspaceHasSkillData(skillsDir: string): boolean {
  return collectSkillDirectories(skillsDir).length > 0;
}

function updateSkillOwnership(
  db: Database.Database,
  skill: Skill,
): void {
  db.prepare(
    'UPDATE skills SET owner_user_id = ?, visibility = ? WHERE id = ?',
  ).run(
    resolveOwnerUserId(db, skill.ownerUserId),
    skill.visibility ?? 'private',
    skill.id,
  );
}

export function collectSkillWorkspaceFiles(skills: Skill[]): Record<string, SkillFileSnapshot[]> {
  const skillsDir = getSkillsDir();
  const existingAdditionalFiles = readAdditionalSkillFileMap(skillsDir);
  const skillFiles: Record<string, SkillFileSnapshot[]> = {};

  for (const skill of skills) {
    const files: SkillFileSnapshot[] = [
      {
        relativePath: SKILL_FILE_NAME,
        content: skill.content ?? skill.instructions ?? '',
      },
      ...(existingAdditionalFiles.get(skill.id) ?? []),
    ];

    if (files.length > 0) {
      skillFiles[skill.id] = files;
    }
  }

  return skillFiles;
}

export function syncSkillWorkspaceFromDatabase(
  db: Database.Database,
  skillDb: SkillDB,
  skillFilesById?: Record<string, SkillFileSnapshot[]>,
): SkillWorkspaceSyncResult {
  const skillsDir = getSkillsDir();
  const skills = listAllSkills(db, skillDb);
  const skillVersions = skills.flatMap((skill) =>
    skillDb.getVersions(skill.id),
  );
  validateSkillWorkspaceSnapshotPaths(skills, skillVersions, skillFilesById);

  const existingAdditionalFiles = skillFilesById
    ? new Map(Object.entries(skillFilesById))
    : readAdditionalSkillFileMap(skillsDir);

  const stagingDir = createSiblingWorkspaceDir(skillsDir, STAGING_DIR_PREFIX);

  try {
    let versionCount = 0;

    for (const skill of skills) {
      const skillDir = getSkillDirectory(stagingDir, skill);
      ensureDir(skillDir);

      fs.writeFileSync(
        path.join(skillDir, SKILL_META_FILE_NAME),
        JSON.stringify(toSkillMetadata(skill), null, 2),
        'utf8',
      );
      fs.writeFileSync(
        path.join(skillDir, SKILL_FILE_NAME),
        skill.content ?? skill.instructions ?? '',
        'utf8',
      );

      const versions = skillVersions
        .filter((version) => version.skillId === skill.id)
        .sort((left, right) => left.version - right.version);
      if (versions.length > 0) {
        const versionsDir = path.join(skillDir, VERSIONS_DIR_NAME);
        ensureDir(versionsDir);
        for (const version of versions) {
          fs.writeFileSync(
            getSkillVersionPath(skillDir, version),
            JSON.stringify(version, null, 2),
            'utf8',
          );
        }
        versionCount += versions.length;
      }

      writeSkillFileSnapshots(skillDir, existingAdditionalFiles.get(skill.id) ?? []);
    }

    replaceSkillWorkspace(skillsDir, stagingDir);

    return {
      skillCount: skills.length,
      versionCount,
    };
  } catch (error) {
    tryRemoveDirectory(stagingDir);
    throw error;
  }
}

export function importSkillWorkspaceIntoDatabase(
  db: Database.Database,
  skillDb: SkillDB,
): SkillWorkspaceSyncResult {
  const skillsDir = getSkillsDir();
  const skillDirectories = collectSkillDirectories(skillsDir);

  if (!workspaceHasSkillData(skillsDir)) {
    return { skillCount: 0, versionCount: 0 };
  }

  let versionCount = 0;

  for (const skillDir of skillDirectories) {
    const metadata = parseSkillMetadata(path.join(skillDir, SKILL_META_FILE_NAME));
    const content = readSkillContent(skillDir);
    const skill: Skill = {
      ...metadata,
      content,
      instructions: content,
    };

    skillDb.insertSkillDirect(skill);
    updateSkillOwnership(db, skill);

    const versions = readSkillVersions(skillDir);
    for (const version of versions) {
      skillDb.insertVersionDirect(version);
    }
    versionCount += versions.length;
  }

  return {
    skillCount: skillDirectories.length,
    versionCount,
  };
}

export function bootstrapSkillWorkspace(
  db: Database.Database,
  skillDb: SkillDB,
): { imported: boolean; exported: boolean } {
  const skillsDir = getSkillsDir();
  const hasDatabaseSkills = skillDb.getAll().length > 0;
  const hasWorkspaceData = workspaceHasSkillData(skillsDir);

  if (!hasDatabaseSkills && hasWorkspaceData) {
    importSkillWorkspaceIntoDatabase(db, skillDb);
    syncSkillWorkspaceFromDatabase(db, skillDb);
    return { imported: true, exported: true };
  }

  syncSkillWorkspaceFromDatabase(db, skillDb);
  return { imported: false, exported: true };
}

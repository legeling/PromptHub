import fs from 'node:fs';
import path from 'node:path';
import type { Database, SkillDB } from '@prompthub/db';
import type { Skill, SkillVersion } from '@prompthub/shared';
import { getSkillsDir } from '../runtime-paths.js';

const SKILL_FILE_NAME = 'SKILL.md';
const SKILL_META_FILE_NAME = 'skill.json';
const VERSIONS_DIR_NAME = 'versions';

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
    .filter((entry) => entry.isDirectory())
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

export function syncSkillWorkspaceFromDatabase(
  db: Database.Database,
  skillDb: SkillDB,
): SkillWorkspaceSyncResult {
  const skillsDir = getSkillsDir();
  const skills = listAllSkills(db, skillDb);

  fs.rmSync(skillsDir, { recursive: true, force: true });
  ensureDir(skillsDir);

  let versionCount = 0;

  for (const skill of skills) {
    const skillDir = getSkillDirectory(skillsDir, skill);
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

    const versions = skillDb.getVersions(skill.id).sort(
      (left, right) => left.version - right.version,
    );
    if (versions.length > 0) {
      const versionsDir = path.join(skillDir, VERSIONS_DIR_NAME);
      ensureDir(versionsDir);
      for (const version of versions) {
        fs.writeFileSync(
          path.join(versionsDir, `${padVersion(version.version)}.json`),
          JSON.stringify(version, null, 2),
          'utf8',
        );
      }
      versionCount += versions.length;
    }
  }

  return {
    skillCount: skills.length,
    versionCount,
  };
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

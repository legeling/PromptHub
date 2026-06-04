import * as crypto from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import type { SkillPlatform } from "@prompthub/shared/constants/platforms";
import DatabaseAdapter from "../database/sqlite";
import { parseSkillMd } from "./skill-validator";
import { isPathWithin } from "./skill-installer-internal";
import { isInternalSkillRepoEntry } from "./skill-installer-repo";
import {
  getPlatformRootDir,
  getPlatformSkillsDir,
  resolvePlatformPath,
} from "./skill-installer-utils";

interface CherryStudioSkillRow {
  id: string;
  folder_name: string;
  source?: string | null;
  builtin?: number | null;
  is_builtin?: number | null;
}

interface CherryStudioAgentWorkspaceRow {
  accessible_paths: string;
}

type CherryStudioDbSchema = "modern" | "legacy";

interface CherryStudioDbHandle {
  db: DatabaseAdapter.Database;
  schema: CherryStudioDbSchema;
  path: string;
}

export interface CherryStudioPlatformOptions {
  overrides?: Record<string, string>;
  mode?: "copy" | "symlink";
}

export interface CherryStudioPlatformSkillMetadata {
  isBuiltin: boolean;
}

const CHERRY_STUDIO_PLATFORM_ID = "cherry-studio";
const CHERRY_STUDIO_DB_CANDIDATES = [
  path.join("Data", "agent.db"),
  path.join("Data", "agents.db"),
  "cherrystudio.sqlite",
] as const;
const CHERRY_STUDIO_SOURCE = "local";
const MAX_FOLDER_NAME_LENGTH = 80;

export function isCherryStudioPlatform(platformId: string): boolean {
  return platformId === CHERRY_STUDIO_PLATFORM_ID;
}

function getCherryStudioDbPaths(
  platform: SkillPlatform,
  options?: CherryStudioPlatformOptions,
): string[] {
  const rootDir = getCherryStudioRootDir(platform, options);
  return CHERRY_STUDIO_DB_CANDIDATES.map((candidate) =>
    path.join(rootDir, candidate),
  );
}

function getCherryStudioRootDir(
  platform: SkillPlatform,
  options?: CherryStudioPlatformOptions,
): string {
  const overridePath = options?.overrides?.[platform.id];
  if (overridePath?.trim()) {
    return resolvePlatformPath(overridePath.trim());
  }
  return getPlatformRootDir(platform);
}

function getCherryStudioSkillsDir(
  platform: SkillPlatform,
  options?: CherryStudioPlatformOptions,
): string {
  const overridePath = options?.overrides?.[platform.id];
  if (!overridePath?.trim()) {
    return getPlatformSkillsDir(platform);
  }

  return path.join(
    resolvePlatformPath(overridePath.trim()),
    ...platform.skillsRelativePath.split(/[\\/]+/).filter(Boolean),
  );
}

function sanitizeCherryStudioFolderName(folderName: string): string {
  const sanitized = folderName
    .replace(/[/\\]/g, "_")
    .replace(/\0/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_");
  return sanitized.slice(0, MAX_FOLDER_NAME_LENGTH);
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function copySkillRepoToCherryStudio(
  sourceDir: string,
  targetDir: string,
): Promise<void> {
  const canonicalSourceDir = await fs.realpath(sourceDir);
  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.cp(canonicalSourceDir, targetDir, {
    recursive: true,
    filter: async (_src, dest) => {
      const relativePath = path.relative(targetDir, dest);
      return !relativePath || !isInternalSkillRepoEntry(relativePath);
    },
  });
}

async function symlinkSkillRepoToCherryStudio(
  sourceDir: string,
  targetDir: string,
): Promise<void> {
  await fs.rm(targetDir, { recursive: true, force: true });
  const symlinkType = process.platform === "win32" ? "junction" : "dir";
  await fs.symlink(sourceDir, targetDir, symlinkType);
}

async function readSkillMd(sourceDir: string): Promise<string> {
  const skillMdPath = path.join(sourceDir, "SKILL.md");
  return fs.readFile(skillMdPath, "utf-8");
}

function parseJsonStringArray(rawValue: string | null | undefined): string[] {
  if (!rawValue) {
    return [];
  }
  try {
    const parsed = JSON.parse(rawValue) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

async function openCherryStudioDb(
  platform: SkillPlatform,
  options?: CherryStudioPlatformOptions,
): Promise<CherryStudioDbHandle | null> {
  for (const dbPath of getCherryStudioDbPaths(platform, options)) {
    if (!(await pathExists(dbPath))) {
      continue;
    }

    const db = new DatabaseAdapter(dbPath);
    const modernTable = db.get(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'skills'",
    );
    if (modernTable) {
      return { db, schema: "modern", path: dbPath };
    }

    const legacyTable = db.get(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'agent_global_skill'",
    );
    if (legacyTable) {
      return { db, schema: "legacy", path: dbPath };
    }

    db.close();
    throw new Error(
      `Cherry Studio database is missing supported skills table: ${dbPath}`,
    );
  }

  return null;
}

async function requireCherryStudioDb(
  platform: SkillPlatform,
  options?: CherryStudioPlatformOptions,
): Promise<CherryStudioDbHandle> {
  const handle = await openCherryStudioDb(platform, options);
  if (!handle) {
    throw new Error(
      `Cherry Studio database not found: ${getCherryStudioDbPaths(platform, options).join(", ")}`,
    );
  }
  return handle;
}

function getSkillTable(schema: CherryStudioDbSchema): string {
  return schema === "modern" ? "skills" : "agent_global_skill";
}

function getAgentSkillTable(schema: CherryStudioDbSchema): string {
  return schema === "modern" ? "agent_skills" : "agent_skill";
}

function getAgentTable(schema: CherryStudioDbSchema): string {
  return schema === "modern" ? "agents" : "agent";
}

function tableHasColumn(
  db: DatabaseAdapter.Database,
  tableName: string,
  columnName: string,
): boolean {
  const rows = db.all(`PRAGMA table_info(${tableName})`) as Array<{
    name?: unknown;
  }>;
  return rows.some((row) => row.name === columnName);
}

function getExistingSkillRow(
  db: DatabaseAdapter.Database,
  schema: CherryStudioDbSchema,
  folderName: string,
): CherryStudioSkillRow | undefined {
  const skillTable = getSkillTable(schema);
  const extraColumns = [
    tableHasColumn(db, skillTable, "source") ? "source" : null,
    tableHasColumn(db, skillTable, "builtin") ? "builtin" : null,
    tableHasColumn(db, skillTable, "is_builtin") ? "is_builtin" : null,
  ].filter(Boolean);

  return db.get(
    `SELECT id, folder_name${extraColumns.length ? `, ${extraColumns.join(", ")}` : ""}
     FROM ${skillTable}
     WHERE folder_name = ?
     LIMIT 1`,
    folderName,
  ) as CherryStudioSkillRow | undefined;
}

function isCherryStudioBuiltinSkill(row: CherryStudioSkillRow): boolean {
  return Boolean(
    row.builtin ||
    row.is_builtin ||
    row.source?.trim().toLowerCase() === "builtin",
  );
}

function upsertCherryStudioSkillRow(
  db: DatabaseAdapter.Database,
  schema: CherryStudioDbSchema,
  skillName: string,
  folderName: string,
  skillMdContent: string,
): void {
  const parsed = parseSkillMd(skillMdContent);
  const metadata = parsed?.frontmatter;
  const now = Date.now();
  const existing = getExistingSkillRow(db, schema, folderName);
  const contentHash = crypto
    .createHash("sha256")
    .update(skillMdContent)
    .digest("hex");
  const name = metadata?.name?.trim() || skillName;
  const description = metadata?.description?.trim() || null;
  const author = metadata?.author?.trim() || null;
  const tags = JSON.stringify(metadata?.tags ?? []);
  const skillTable = getSkillTable(schema);

  if (existing) {
    db.run(
      `UPDATE ${skillTable}
       SET name = ?, description = ?, author = ?, tags = ?, content_hash = ?, updated_at = ?
       WHERE id = ?`,
      name,
      description,
      author,
      tags,
      contentHash,
      now,
      existing.id,
    );
    return;
  }

  db.run(
    `INSERT INTO ${skillTable}
     (id, name, description, folder_name, source, source_url, namespace, author, tags, content_hash, is_enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, 0, ?, ?)`,
    crypto.randomUUID(),
    name,
    description,
    folderName,
    CHERRY_STUDIO_SOURCE,
    author,
    tags,
    contentHash,
    now,
    now,
  );
}

export async function installCherryStudioSkill(
  platform: SkillPlatform,
  skillName: string,
  sourceDir: string,
  options?: CherryStudioPlatformOptions,
): Promise<void> {
  const folderName = sanitizeCherryStudioFolderName(skillName);
  const skillsDir = getCherryStudioSkillsDir(platform, options);
  const targetDir = path.join(skillsDir, folderName);
  const skillMdContent = await readSkillMd(sourceDir);
  const { db, schema } = await requireCherryStudioDb(platform, options);

  try {
    await fs.mkdir(skillsDir, { recursive: true });
    if (options?.mode === "symlink") {
      await symlinkSkillRepoToCherryStudio(sourceDir, targetDir);
    } else {
      await copySkillRepoToCherryStudio(sourceDir, targetDir);
    }
    upsertCherryStudioSkillRow(
      db,
      schema,
      skillName,
      folderName,
      skillMdContent,
    );
  } catch (error) {
    await fs.rm(targetDir, { recursive: true, force: true });
    throw error;
  } finally {
    db.close();
  }
}

export async function uninstallCherryStudioSkill(
  platform: SkillPlatform,
  skillName: string,
  options?: CherryStudioPlatformOptions,
): Promise<void> {
  const folderName = sanitizeCherryStudioFolderName(skillName);
  const skillsDir = getCherryStudioSkillsDir(platform, options);
  const targetDir = path.join(skillsDir, folderName);
  const handle = await openCherryStudioDb(platform, options);

  if (!handle) {
    await fs.rm(targetDir, { recursive: true, force: true });
    return;
  }

  const { db, schema } = handle;
  try {
    const existing = getExistingSkillRow(db, schema, folderName);
    if (existing) {
      if (isCherryStudioBuiltinSkill(existing)) {
        throw new Error(
          `Cannot uninstall Cherry Studio built-in skill: ${skillName}`,
        );
      }
      await removeEnabledAgentSymlinks(db, schema, existing.id, folderName);
      db.run(
        `DELETE FROM ${getAgentSkillTable(schema)} WHERE skill_id = ?`,
        existing.id,
      );
      db.run(`DELETE FROM ${getSkillTable(schema)} WHERE id = ?`, existing.id);
    }
    await fs.rm(targetDir, { recursive: true, force: true });
  } finally {
    db.close();
  }
}

export async function uninstallCherryStudioPlatformSkill(
  platform: SkillPlatform,
  platformSkillPath: string,
  options?: CherryStudioPlatformOptions,
): Promise<void> {
  const skillsDir = path.resolve(getCherryStudioSkillsDir(platform, options));
  const targetPath = path.resolve(platformSkillPath);
  const relativeTarget = path.relative(skillsDir, targetPath);
  if (
    !isPathWithin(skillsDir, targetPath) ||
    relativeTarget === "" ||
    relativeTarget === "."
  ) {
    throw new Error("Path traversal detected: skill path is outside platform");
  }

  await uninstallCherryStudioSkill(
    platform,
    path.basename(targetPath),
    options,
  );
}

export async function getCherryStudioPlatformSkillMetadata(
  platform: SkillPlatform,
  platformSkillPath: string,
  options?: CherryStudioPlatformOptions,
): Promise<CherryStudioPlatformSkillMetadata> {
  const skillsDir = path.resolve(getCherryStudioSkillsDir(platform, options));
  const targetPath = path.resolve(platformSkillPath);
  const relativeTarget = path.relative(skillsDir, targetPath);
  if (
    !isPathWithin(skillsDir, targetPath) ||
    relativeTarget === "" ||
    relativeTarget === "."
  ) {
    throw new Error("Path traversal detected: skill path is outside platform");
  }

  const handle = await openCherryStudioDb(platform, options);
  if (!handle) {
    return { isBuiltin: false };
  }

  const { db, schema } = handle;
  try {
    const row = getExistingSkillRow(db, schema, path.basename(targetPath));
    return { isBuiltin: row ? isCherryStudioBuiltinSkill(row) : false };
  } finally {
    db.close();
  }
}

export async function getCherryStudioSkillStatus(
  platform: SkillPlatform,
  skillName: string,
  options?: CherryStudioPlatformOptions,
): Promise<boolean> {
  const folderName = sanitizeCherryStudioFolderName(skillName);
  const skillMdPath = path.join(
    getCherryStudioSkillsDir(platform, options),
    folderName,
    "SKILL.md",
  );
  if (!(await pathExists(skillMdPath))) {
    return false;
  }

  const handle = await openCherryStudioDb(platform, options);
  if (!handle) {
    return false;
  }

  const { db, schema } = handle;
  try {
    return Boolean(getExistingSkillRow(db, schema, folderName));
  } finally {
    db.close();
  }
}

async function removeEnabledAgentSymlinks(
  db: DatabaseAdapter.Database,
  schema: CherryStudioDbSchema,
  skillId: string,
  folderName: string,
): Promise<void> {
  const rows = db.all(
    `SELECT agent.accessible_paths
     FROM ${getAgentSkillTable(schema)} AS agent_skill
     JOIN ${getAgentTable(schema)} AS agent ON agent.id = agent_skill.agent_id
     WHERE agent_skill.skill_id = ? AND agent_skill.is_enabled = 1`,
    skillId,
  ) as CherryStudioAgentWorkspaceRow[];

  for (const row of rows) {
    const workspace = parseJsonStringArray(row.accessible_paths)[0];
    if (!workspace) {
      continue;
    }

    const linkPath = path.join(workspace, ".claude", "skills", folderName);
    try {
      const stat = await fs.lstat(linkPath);
      if (stat.isSymbolicLink()) {
        await fs.unlink(linkPath);
      }
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        continue;
      }
      throw error;
    }
  }
}

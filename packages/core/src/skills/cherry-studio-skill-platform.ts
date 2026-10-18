import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import path from "node:path";
import type { SkillPlatform } from "@prompthub/shared/constants/platforms";
import { DatabaseAdapter } from "@prompthub/db";
import { parseSkillMd } from "./skill-frontmatter";
import { SkillPlatformError } from "./platform-error";
import { getDefaultPlatformRootDir } from "../platform-paths";
import {
  assertCherrySkillDirectory,
  installCherrySkillFiles,
  publishCherrySkillFiles,
} from "./cherry-studio-skill-files";

export interface CherryStudioPlatformOptions {
  overrides?: Record<string, string>;
  mode?: "copy" | "symlink";
}

export interface CherryStudioPlatformSkillMetadata {
  isBuiltin: boolean;
}

interface CherryStudioSkillRow {
  id: string;
  folder_name: string;
  source: string;
}

interface CherryPaths {
  root: string;
  database: string;
  library: string;
  mirror: string;
}

// Current upstream contract: CherryHQ/cherry-studio dac9b72 (2.1.6).
const REQUIRED_COLUMNS = {
  agent_global_skill: [
    "id",
    "name",
    "description",
    "folder_name",
    "source",
    "source_url",
    "namespace",
    "author",
    "version",
    "tags",
    "content_hash",
    "is_enabled",
    "created_at",
    "updated_at",
  ],
  agent_skill: [
    "agent_id",
    "skill_id",
    "is_enabled",
    "created_at",
    "updated_at",
  ],
};
const mutations = new Map<string, Promise<void>>();

export function isCherryStudioPlatform(platformId: string): boolean {
  return platformId === "cherry-studio";
}

function resolvePaths(
  platform: SkillPlatform,
  options?: CherryStudioPlatformOptions,
): CherryPaths {
  const override = options?.overrides?.[platform.id]?.trim();
  const root = path.resolve(override ?? getDefaultPlatformRootDir(platform));
  return {
    root,
    database: path.join(root, "Data", "cherrystudio.sqlite"),
    library: path.join(root, "Data", "Skills"),
    mirror: path.join(root, "Data", "Agents", ".claude", "skills"),
  };
}

function validateFolderName(name: string): string {
  if (
    !name ||
    name.length > 80 ||
    !/^[a-zA-Z0-9_-]+$/.test(name) ||
    path.isAbsolute(name)
  ) {
    throw new Error("Invalid Cherry Studio Skill folder name");
  }
  return name;
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.lstat(target);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return false;
    throw error;
  }
}

function validateSchema(db: DatabaseAdapter.Database): void {
  for (const [table, required] of Object.entries(REQUIRED_COLUMNS)) {
    const columns = db.all(`PRAGMA table_info(${table})`).map((row) => {
      if (
        typeof row !== "object" ||
        row === null ||
        !("name" in row) ||
        typeof row.name !== "string"
      )
        throw new Error("Invalid Cherry Studio schema metadata");
      return row.name;
    });
    if (required.some((column) => !columns.includes(column))) {
      throw new SkillPlatformError(
        "cherry-schema-unsupported",
        `Cherry Studio current Skill schema is required: ${table}`,
      );
    }
  }
}

async function openDatabase(
  paths: CherryPaths,
  readOnly = false,
): Promise<DatabaseAdapter.Database | null> {
  if (!(await pathExists(paths.database))) return null;
  assertCherrySkillDirectory(paths.root, path.dirname(paths.database));
  const stat = await fs.lstat(paths.database);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error("Unsafe Cherry Studio database path");
  const db = new DatabaseAdapter(paths.database, { readOnly });
  try {
    db.pragma("foreign_keys = ON");
    validateSchema(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

async function requireDatabase(
  paths: CherryPaths,
): Promise<DatabaseAdapter.Database> {
  const db = await openDatabase(paths);
  if (!db)
    throw new SkillPlatformError(
      "cherry-database-unavailable",
      `Cherry Studio Skill database not found: ${paths.database}`,
    );
  return db;
}

function getSkill(
  db: DatabaseAdapter.Database,
  folder: string,
): CherryStudioSkillRow | undefined {
  const rows = db
    .all(
      "SELECT id, folder_name, source FROM agent_global_skill WHERE folder_name = ? COLLATE NOCASE",
      folder,
    )
    .map((row): CherryStudioSkillRow => {
      if (
        typeof row !== "object" ||
        row === null ||
        !("id" in row) ||
        typeof row.id !== "string" ||
        !("folder_name" in row) ||
        typeof row.folder_name !== "string" ||
        !("source" in row) ||
        typeof row.source !== "string"
      )
        throw new Error("Invalid Cherry Studio Skill catalog row");
      return { id: row.id, folder_name: row.folder_name, source: row.source };
    });
  if (rows.length > 1 || (rows[0] && rows[0].folder_name !== folder)) {
    throw new SkillPlatformError(
      "target-conflict",
      `Cherry Studio Skill folder has a case conflict: ${folder}`,
    );
  }
  return rows[0];
}

function assertLocalReplacement(row: CherryStudioSkillRow | undefined): void {
  if (row && row.source !== "local") {
    throw new SkillPlatformError(
      "target-protected",
      `Cannot overwrite Cherry Studio ${row.source} Skill with a local distribution`,
    );
  }
}

async function withMutation(
  paths: CherryPaths,
  action: () => Promise<void>,
): Promise<void> {
  const previous = mutations.get(paths.root) ?? Promise.resolve();
  const pending = previous.then(action);
  // The originating caller receives rejection; the queue must still allow the next operation.
  const settled = pending.then(
    () => undefined,
    () => undefined,
  );
  mutations.set(paths.root, settled);
  try {
    await pending;
  } finally {
    if (mutations.get(paths.root) === settled) mutations.delete(paths.root);
  }
}

function writeSkill(
  db: DatabaseAdapter.Database,
  folder: string,
  content: string,
  hash: string,
): void {
  const parsed = parseSkillMd(content);
  if (!parsed) throw new Error("Invalid Cherry Studio Skill entrypoint");
  const metadata = parsed.frontmatter;
  const row = getSkill(db, folder);
  assertLocalReplacement(row);
  const fields = [
    metadata.name || folder,
    metadata.description || null,
    metadata.author || null,
    metadata.version || null,
    JSON.stringify(metadata.tags ?? []),
    hash,
  ];
  const now = Date.now();
  if (row) {
    db.run(
      "UPDATE agent_global_skill SET name=?, description=?, author=?, version=?, tags=?, content_hash=?, updated_at=? WHERE id=?",
      ...fields,
      now,
      row.id,
    );
  } else {
    db.run(
      "INSERT INTO agent_global_skill (name, description, author, version, tags, content_hash, id, folder_name, source, source_url, namespace, is_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'local', NULL, NULL, 1, ?, ?)",
      ...fields,
      randomUUID(),
      folder,
      now,
      now,
    );
  }
}

async function assertUnambiguousTarget(
  directory: string,
  folder: string,
): Promise<void> {
  if (!(await pathExists(directory))) return;
  const entries = await fs.readdir(directory);
  if (
    entries.some(
      (entry) =>
        entry !== folder && entry.toLowerCase() === folder.toLowerCase(),
    )
  ) {
    throw new SkillPlatformError(
      "target-conflict",
      `Cherry Studio Skill directory has a case conflict: ${folder}`,
    );
  }
}

async function preparePaths(paths: CherryPaths, folder: string): Promise<void> {
  assertCherrySkillDirectory(paths.root, paths.library);
  assertCherrySkillDirectory(paths.root, paths.mirror);
  await assertUnambiguousTarget(paths.library, folder);
  await assertUnambiguousTarget(paths.mirror, folder);
}

async function resolveInstallSource(
  source: string,
  destinations: string[],
): Promise<string> {
  const canonicalSource = await fs.realpath(source);
  for (const destination of destinations) {
    const relative = path.relative(path.resolve(destination), canonicalSource);
    if (
      !relative ||
      (!relative.startsWith("..") && !path.isAbsolute(relative))
    ) {
      throw new Error("Cherry Studio Skill source overlaps destination");
    }
  }
  return canonicalSource;
}

async function installCurrentSkill(
  paths: CherryPaths,
  folder: string,
  source: string,
): Promise<void> {
  const db = await requireDatabase(paths);
  try {
    await preparePaths(paths, folder);
    const existing = getSkill(db, folder);
    assertLocalReplacement(existing);
    const target = path.join(paths.library, folder);
    const mirror = path.join(paths.mirror, folder);
    if (
      !existing &&
      ((await pathExists(target)) || (await pathExists(mirror)))
    ) {
      throw new SkillPlatformError(
        "target-conflict",
        `Unregistered Cherry Studio Skill already occupies target: ${folder}`,
      );
    }
    const canonicalSource = await resolveInstallSource(source, [
      target,
      mirror,
    ]);
    await installCherrySkillFiles(
      target,
      mirror,
      canonicalSource,
      (content, hash) =>
        db.transaction(() => writeSkill(db, folder, content, hash))(),
    );
  } finally {
    db.close();
  }
}

export async function installCherryStudioSkill(
  platform: SkillPlatform,
  skillName: string,
  sourceDir: string,
  options?: CherryStudioPlatformOptions,
): Promise<void> {
  if (options?.mode === "symlink")
    throw new SkillPlatformError(
      "cherry-copy-only",
      "Cherry Studio rejects symlinks in its managed Skill library",
    );
  const folder = validateFolderName(skillName);
  const paths = resolvePaths(platform, options);
  await withMutation(paths, () =>
    installCurrentSkill(paths, folder, sourceDir),
  );
}

async function removeCurrentSkill(
  paths: CherryPaths,
  folder: string,
): Promise<void> {
  const db = await requireDatabase(paths);
  try {
    await preparePaths(paths, folder);
    const row = getSkill(db, folder);
    if (row?.source === "builtin")
      throw new SkillPlatformError(
        "target-protected",
        `Cannot uninstall Cherry Studio built-in skill: ${folder}`,
      );
    const targets = [
      path.join(paths.library, folder),
      path.join(paths.mirror, folder),
    ];
    if (!row) {
      if ((await Promise.all(targets.map(pathExists))).some(Boolean))
        throw new SkillPlatformError(
          "target-conflict",
          `Cannot remove unregistered Cherry Studio Skill: ${folder}`,
        );
      return;
    }
    await publishCherrySkillFiles(
      targets.map((target) => ({ target })),
      () =>
        db.transaction(() => {
          const current = getSkill(db, folder);
          if (!current || current.id !== row.id || current.source === "builtin")
            throw new Error("Cherry Studio Skill changed during removal");
          db.run("DELETE FROM agent_skill WHERE skill_id = ?", row.id);
          db.run("DELETE FROM agent_global_skill WHERE id = ?", row.id);
        })(),
    );
  } finally {
    db.close();
  }
}

export async function uninstallCherryStudioSkill(
  platform: SkillPlatform,
  skillName: string,
  options?: CherryStudioPlatformOptions,
): Promise<void> {
  const folder = validateFolderName(skillName);
  const paths = resolvePaths(platform, options);
  await withMutation(paths, () => removeCurrentSkill(paths, folder));
}

function folderFromPath(paths: CherryPaths, targetPath: string): string {
  const target = path.resolve(targetPath);
  if (path.dirname(target) !== path.resolve(paths.library))
    throw new Error("Path traversal detected: skill path is outside platform");
  return validateFolderName(path.basename(target));
}

export async function uninstallCherryStudioPlatformSkill(
  platform: SkillPlatform,
  platformSkillPath: string,
  options?: CherryStudioPlatformOptions,
): Promise<void> {
  const paths = resolvePaths(platform, options);
  await uninstallCherryStudioSkill(
    platform,
    folderFromPath(paths, platformSkillPath),
    options,
  );
}

export async function getCherryStudioPlatformSkillMetadata(
  platform: SkillPlatform,
  platformSkillPath: string,
  options?: CherryStudioPlatformOptions,
): Promise<CherryStudioPlatformSkillMetadata> {
  const paths = resolvePaths(platform, options);
  const folder = folderFromPath(paths, platformSkillPath);
  const db = await openDatabase(paths, true);
  if (!db) return { isBuiltin: false };
  try {
    return { isBuiltin: getSkill(db, folder)?.source === "builtin" };
  } finally {
    db.close();
  }
}

export async function getCherryStudioSkillStatus(
  platform: SkillPlatform,
  skillName: string,
  options?: CherryStudioPlatformOptions,
): Promise<boolean> {
  const folder = validateFolderName(skillName);
  const paths = resolvePaths(platform, options);
  const db = await openDatabase(paths, true);
  if (!db) return false;
  try {
    if (!getSkill(db, folder)) return false;
    const libraryPath = path.join(paths.library, folder);
    if (!(await pathExists(libraryPath))) return false;
    const libraryStat = await fs.lstat(libraryPath);
    if (!libraryStat.isDirectory() || libraryStat.isSymbolicLink())
      return false;
    for (const directory of [paths.library, paths.mirror]) {
      try {
        if (!(await fs.stat(path.join(directory, folder, "SKILL.md"))).isFile())
          return false;
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "ENOENT"
        )
          return false;
        throw error;
      }
    }
    return true;
  } finally {
    db.close();
  }
}

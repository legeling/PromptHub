import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import {
  createDatabaseSafetyPoint,
  SkillDB,
  type DatabaseAdapter,
} from "@prompthub/db";
import type { Skill, SkillFileSnapshot, SkillVersion } from "@prompthub/shared";
import type { CanonicalEntryMutation } from "@prompthub/core/canonical-entry-publication";
import {
  publishSqliteEntries,
  recoverSqliteEntryPublication,
} from "@prompthub/core/sqlite-entry-publication";
import { assertStoragePathComponentsSafe } from "@prompthub/core/runtime-storage-context";
import { readSkillEntrypoint } from "@prompthub/core/skill-storage-files";
import {
  MAX_SKILL_PACKAGE_FILES,
  MAX_SKILL_PACKAGE_FILE_BYTES,
  MAX_SKILL_PACKAGE_TOTAL_BYTES,
  MAX_SKILL_PACKAGE_DEPTH,
  MAX_SKILL_PACKAGE_ENTRIES,
} from "@prompthub/shared/constants/skill-package";
import { encodeSkillFileSnapshot } from "@prompthub/shared/utils/skill-file-snapshot";
import { skillSchema, skillVersionSchema } from "./sync-snapshot.js";
import {
  getWebSkillPackagePath,
  prepareWebSkillPackage,
} from "./skill-workspace.js";

const MIGRATION_NAME = "web-skill-metadata-v1";
const legacySkillSchema = skillSchema
  .extend({ local_repo_path: z.string().optional() })
  .strict();
interface HistoricalSkill {
  skill: Skill;
  versions: SkillVersion[];
  entry: CanonicalEntryMutation;
}

function treeDigest(root: string, directory: string): string {
  assertStoragePathComponentsSafe(root, directory);
  const hash = crypto.createHash("sha256");
  const pending = [directory];
  while (pending.length) {
    const current = pending.pop()!;
    for (const item of fs
      .readdirSync(current, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(current, item.name);
      if (item.isSymbolicLink())
        throw new Error("Historical Skill tree contains a symbolic link");
      if (item.isDirectory()) pending.push(file);
      else if (item.isFile()) {
        const bytes = fs.readFileSync(file);
        hash.update(
          JSON.stringify([path.relative(directory, file), bytes.length]),
        );
        hash.update(bytes);
      } else throw new Error("Historical Skill tree contains an unsafe entry");
    }
  }
  return hash.digest("hex");
}

function readMetadata(file: string): { skill: Skill; keys: string[] } {
  const value: unknown = JSON.parse(readSkillEntrypoint(file));
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Historical Skill metadata is invalid");
  const normalized = Object.fromEntries(
    Object.entries(value).filter(
      ([key, entry]) => entry !== null || key === "ownerUserId",
    ),
  );
  if (Object.values(normalized).some((entry) => typeof entry === "string" && entry.includes("\0")))
    throw new Error("Historical Skill metadata contains a null byte");
  const skill = legacySkillSchema.parse(normalized);
  return { skill, keys: Object.keys(value) };
}

function comparable(key: string, value: unknown): unknown {
  if (["tags", "original_tags", "prerequisites", "compatibility"].includes(key))
    return value ?? [];
  return value ?? null;
}

function readHistoricalPackage(directory: string): SkillFileSnapshot[] {
  const files: SkillFileSnapshot[] = [];
  const pending = [directory];
  let totalBytes = 0;
  let entries = 0;
  while (pending.length) {
    const current = pending.pop()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (
        current === directory &&
        ["skill.json", "versions"].includes(entry.name)
      )
        continue;
      if (++entries > MAX_SKILL_PACKAGE_ENTRIES)
        throw new Error("Historical Skill package entry limit exceeded");
      const file = path.join(current, entry.name);
      const relativePath = path
        .relative(directory, file)
        .split(path.sep)
        .join("/");
      if (entry.isSymbolicLink())
        throw new Error("Historical Skill package contains a symbolic link");
      if (entry.isDirectory()) {
        if (relativePath.split("/").length > MAX_SKILL_PACKAGE_DEPTH)
          throw new Error("Historical Skill package depth limit exceeded");
        pending.push(file);
      } else {
        const size = fs.lstatSync(file).size;
        totalBytes += size;
        if (
          !entry.isFile() ||
          size > MAX_SKILL_PACKAGE_FILE_BYTES ||
          totalBytes > MAX_SKILL_PACKAGE_TOTAL_BYTES ||
          files.length >= MAX_SKILL_PACKAGE_FILES
        )
          throw new Error("Historical Skill package exceeds its file budget");
        files.push(
          encodeSkillFileSnapshot(relativePath, fs.readFileSync(file)),
        );
      }
    }
  }
  return files;
}

function readHistorical(
  directory: string,
  repository: SkillDB,
  db: DatabaseAdapter.Database,
): HistoricalSkill {
  const parsed = readMetadata(path.join(directory, "skill.json"));
  const skill = parsed.skill;
  if (
    skill.ownerUserId &&
    !db.get("SELECT id FROM users WHERE id = ?", skill.ownerUserId)
  )
    throw new Error("Historical Skill has an unknown owner");
  const content = readSkillEntrypoint(path.join(directory, "SKILL.md"));
  const previous = repository.getById(skill.id);
  if (previous) {
    for (const key of [...parsed.keys, "content"]) {
      const before: Record<string, unknown> = { ...previous };
      const after: Record<string, unknown> = { ...skill, content };
      if (
        !isDeepStrictEqual(
          comparable(key, before[key]),
          comparable(key, after[key]),
        )
      )
        throw new Error(
          `Historical Web Skill metadata conflict: ${skill.id} (${key})`,
        );
    }
  }
  const merged = { ...previous, ...skill, content, instructions: content };
  const versionsDirectory = path.join(directory, "versions");
  const versions = fs.existsSync(versionsDirectory)
    ? fs
        .readdirSync(versionsDirectory)
        .sort()
        .map((name) => {
          if (!name.endsWith(".json"))
            throw new Error("Unrecognized historical Skill version");
          const version = skillVersionSchema.parse(
            JSON.parse(readSkillEntrypoint(path.join(versionsDirectory, name))),
          );
          if (version.skillId !== skill.id)
            throw new Error("Historical Skill version owner mismatch");
          return {
            ...version,
            createdAt:
              typeof version.createdAt === "number"
                ? new Date(version.createdAt).toISOString()
                : version.createdAt,
          };
        })
    : [];
  const files = readHistoricalPackage(directory);
  return {
    skill: merged,
    versions,
    entry: prepareWebSkillPackage(merged, files, true),
  };
}

/** Only startup reads historical JSON; CRUD and reopen use the SQL owner. */
export function migrateWebSkillMetadata(
  database: DatabaseAdapter.Database,
  root: string,
  databasePath: string,
): void {
  recoverSqliteEntryPublication(database, root, MIGRATION_NAME);
  const legacyRoot = path.join(root, "data", "skills");
  assertStoragePathComponentsSafe(root, legacyRoot);
  const completed = database.get(
    "SELECT name FROM schema_migrations WHERE name = ?",
    MIGRATION_NAME,
  );
  if (completed) {
    if (fs.existsSync(legacyRoot))
      throw new Error("Retired Web Skill source requires explicit recovery");
    return;
  }
  const repository = new SkillDB(database);
  const graphs: HistoricalSkill[] = [];
  const entries: CanonicalEntryMutation[] = [];
  if (fs.existsSync(legacyRoot)) {
    const digest = treeDigest(root, legacyRoot);
    for (const item of fs.readdirSync(legacyRoot, { withFileTypes: true })) {
      if (
        item.name.startsWith(".skills-staging-") ||
        item.name.startsWith(".skills-backup-")
      )
        continue;
      if (!item.isDirectory())
        throw new Error("Unrecognized historical Skill entry");
      graphs.push(
        readHistorical(path.join(legacyRoot, item.name), repository, database),
      );
    }
    const backup = path.join(root, "recovery", MIGRATION_NAME, digest);
    if (fs.existsSync(backup)) {
      if (treeDigest(root, backup) !== digest)
        throw new Error("Web Skill recovery copy mismatch");
    } else
      entries.push({
        targetPath: backup,
        prepare(stage) {
          fs.cpSync(legacyRoot, stage, {
            recursive: true,
            dereference: false,
            errorOnExist: true,
            force: false,
          });
          if (treeDigest(root, stage) !== digest)
            throw new Error("Web Skill recovery verification failed");
        },
      });
    entries.push({ targetPath: legacyRoot, delete: true });
  }
  const ids = new Set<string>();
  for (const graph of graphs) {
    if (ids.has(graph.skill.id))
      throw new Error("Duplicate historical Skill identity");
    ids.add(graph.skill.id);
    entries.push(graph.entry);
  }
  for (const skill of repository.getAll()) {
    if (ids.has(skill.id)) continue;
    const target = getWebSkillPackagePath(skill.id);
    if (fs.existsSync(target))
      throw new Error("Untracked Web Skill package requires recovery");
    entries.push(prepareWebSkillPackage(skill, undefined, true));
  }
  if (entries.length) createDatabaseSafetyPoint(databasePath, "pre-migration");
  publishSqliteEntries(database, {
    rootPath: root,
    databasePath,
    operationKey: MIGRATION_NAME,
    entries,
    commit() {
      for (const graph of graphs) {
        repository.insertSkillDirect(graph.skill);
        for (const version of graph.versions)
          repository.insertVersionDirect(version);
      }
      database.run(
        "INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)",
        MIGRATION_NAME,
        Date.now(),
      );
    },
  });
}

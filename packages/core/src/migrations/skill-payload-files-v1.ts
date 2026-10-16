import fs from "node:fs";
import path from "node:path";
import {
  SkillDB,
  createDatabaseSafetyPoint,
  type DatabaseAdapter,
} from "@prompthub/db";
import type { Skill } from "@prompthub/shared/types";
import type { CanonicalEntryMutation } from "../canonical-entry-publication";
import {
  getManagedSkillPackagePath,
  readSkillEntrypoint,
  skillPackageEntry,
} from "../skill-storage-files";
import {
  getSkillVersionPayloadPath,
  skillVersionPayloadEntry,
} from "../skill-version-files";
import {
  publishSqliteEntries,
  recoverSqliteEntryPublication,
} from "../sqlite-entry-publication";
import {
  completeSkillPayloadMigration,
  ensureSkillPayloadGuards,
} from "@prompthub/db/init";
import { assertStoragePathComponentsSafe } from "../runtime-storage-context";

export const SKILL_PAYLOAD_MIGRATION = "skill-payload-files-v1";

interface MigrationOptions {
  rootPath: string;
  databasePath: string;
  skillsRoot: string;
  allowLinkedPackages?: boolean;
  injectFailure?: (targetPath: string) => void;
}

function currentPackage(
  skill: Skill,
  options: MigrationOptions,
): {
  skill: Skill;
  entry?: CanonicalEntryMutation;
} {
  const targetPath = getManagedSkillPackagePath(skill.id, options.skillsRoot);
  assertStoragePathComponentsSafe(options.rootPath, targetPath);
  const selected =
    (options.allowLinkedPackages === false
      ? undefined
      : skill.local_repo_path) ??
    (fs.existsSync(targetPath) ? targetPath : undefined);
  if (selected) {
    const content = readSkillEntrypoint(path.join(selected, "SKILL.md"));
    return {
      skill: {
        ...skill,
        content,
        instructions: content,
        local_repo_path: selected,
      },
    };
  }
  const content = skill.instructions ?? skill.content;
  if (content === undefined) return { skill };
  return {
    skill: { ...skill, local_repo_path: targetPath },
    entry: skillPackageEntry(targetPath, [], content, options.rootPath),
  };
}

/** The old SQL payload is cleared only inside the receipt transaction after file publication. */
export function migrateSkillPayloadFilesV1(
  database: DatabaseAdapter.Database,
  options: MigrationOptions,
): void {
  recoverSqliteEntryPublication(
    database,
    options.rootPath,
    SKILL_PAYLOAD_MIGRATION,
  );
  if (
    database.get(
      "SELECT name FROM schema_migrations WHERE name = ?",
      SKILL_PAYLOAD_MIGRATION,
    )
  ) {
    ensureSkillPayloadGuards(database);
    return;
  }
  const legacy = new SkillDB(database);
  const entries: CanonicalEntryMutation[] = [];
  const skills = legacy.getAll().map((skill) => {
    const current = currentPackage(skill, options);
    if (current.entry) entries.push(current.entry);
    return {
      id: current.skill.id,
      local_repo_path: current.skill.local_repo_path,
    };
  });
  // The adapter returns untyped rows from this fixed metadata-only query.
  const versions = database.all(
    "SELECT id, skill_id, version FROM skill_versions ORDER BY skill_id, version",
  ) as Array<{ id: string; skill_id: string; version: number }>;
  // Keep only identities in memory; decode one historical package during staging.
  for (const version of versions) {
    const targetPath = getSkillVersionPayloadPath(
      version.skill_id,
      version.id,
      options.skillsRoot,
    );
    if (fs.existsSync(targetPath))
      throw new Error("Untracked Skill history payload requires recovery");
    entries.push({
      targetPath,
      prepare(stage) {
        const snapshot = legacy.getVersion(version.skill_id, version.version);
        if (!snapshot)
          throw new Error("Skill history disappeared during migration");
        skillVersionPayloadEntry(snapshot, options.skillsRoot, options.rootPath)
          .prepare!(stage);
      },
    });
  }
  if (skills.length)
    createDatabaseSafetyPoint(options.databasePath, "pre-migration");
  publishSqliteEntries(database, {
    rootPath: options.rootPath,
    databasePath: options.databasePath,
    operationKey: SKILL_PAYLOAD_MIGRATION,
    entries,
    injectFailure: options.injectFailure,
    commit() {
      for (const skill of skills)
        database.run(
          "UPDATE skills SET local_repo_path = ? WHERE id = ?",
          skill.local_repo_path ?? null,
          skill.id,
        );
      completeSkillPayloadMigration(database, SKILL_PAYLOAD_MIGRATION);
    },
  });
}

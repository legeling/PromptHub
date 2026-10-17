import { createDatabaseSafetyPoint, type DatabaseAdapter } from "@prompthub/db";
import type { SkillFileSnapshot } from "@prompthub/shared/types";
import { validateSkillFileSnapshots } from "@prompthub/shared/utils/skill-file-snapshot";
import { recoverSqliteEntryPublication } from "../sqlite-entry-publication";
import {
  migrateSkillPayloadFilesV1,
  SKILL_PAYLOAD_MIGRATION,
} from "./skill-payload-files-v1";

const PATH_MIGRATION = "skill-snapshot-paths-v1";
type MigrationOptions = Parameters<typeof migrateSkillPayloadFilesV1>[1];
interface LegacyVersionIdentity {
  id: string;
  skill_id: string;
  version: number;
}

function normalizeLegacySnapshot(json: string): string {
  // Legacy SQL JSON is untyped; the shared validator checks the converted
  // shape, encodings, limits and duplicate paths before any SQL update.
  const files = JSON.parse(json) as SkillFileSnapshot[];
  if (!Array.isArray(files)) throw new Error("Invalid legacy Skill snapshot");
  let changed = false;
  const normalized = files.map((file) => {
    if (!file || typeof file.relativePath !== "string") return file;
    const relativePath = file.relativePath.replace(/\\/g, "/");
    changed ||= relativePath !== file.relativePath;
    return { ...file, relativePath };
  });
  // Replacing separators must not resolve traversal or merge colliding paths.
  validateSkillFileSnapshots(normalized);
  return changed ? JSON.stringify(normalized) : json;
}

function correctLegacyVersion(
  database: DatabaseAdapter.Database,
  version: LegacyVersionIdentity,
): void {
  // This fixed query selects a non-null legacy JSON column by primary key.
  const row = database.get(
    "SELECT files_snapshot FROM skill_versions WHERE id = ?",
    version.id,
  ) as { files_snapshot: string };
  let normalized: string;
  try {
    normalized = normalizeLegacySnapshot(row.files_snapshot);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Cannot migrate Skill ${version.skill_id} history version ${version.version}: ${reason}`,
      { cause: error },
    );
  }
  if (normalized !== row.files_snapshot)
    database.run(
      "UPDATE skill_versions SET files_snapshot = ? WHERE id = ?",
      normalized,
      version.id,
    );
}

function correctLegacySnapshotPaths(
  database: DatabaseAdapter.Database,
  options: MigrationOptions,
): void {
  if (
    database.get(
      "SELECT name FROM schema_migrations WHERE name IN (?, ?)",
      PATH_MIGRATION,
      SKILL_PAYLOAD_MIGRATION,
    )
  )
    return;
  // Fixed metadata-only query: keep large historical payloads out of this list.
  const versions = database.all(
    "SELECT id, skill_id, version FROM skill_versions WHERE files_snapshot IS NOT NULL ORDER BY skill_id, version",
  ) as LegacyVersionIdentity[];
  if (versions.length)
    createDatabaseSafetyPoint(options.databasePath, "pre-migration");
  database.transaction(() => {
    for (const version of versions) correctLegacyVersion(database, version);
    database.run(
      "INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)",
      PATH_MIGRATION,
      Date.now(),
    );
  })();
}

/** Apply the named legacy-path correction before the immutable payload migration. */
export function migrateSkillPayloadFiles(
  database: DatabaseAdapter.Database,
  options: MigrationOptions,
): void {
  // Resolve any earlier payload publication before correcting its SQL source.
  recoverSqliteEntryPublication(
    database,
    options.rootPath,
    SKILL_PAYLOAD_MIGRATION,
  );
  correctLegacySnapshotPaths(database, options);
  migrateSkillPayloadFilesV1(database, options);
}

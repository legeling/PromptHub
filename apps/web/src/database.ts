import { migrateSkillPayloadFilesV1 } from "@prompthub/core/migrations/skill-payload-files-v1";
import { recoverSqliteEntryPublication } from "@prompthub/core/sqlite-entry-publication";
import { migrateWebRuleMetadata } from "./services/rule-metadata-migration.js";
import { migrateWebSkillMetadata } from "./services/skill-metadata-migration.js";
import { migrateWebSettings } from "./services/settings-migration.js";
import { migratePromptWorkspaceV1 } from "@prompthub/core/migrations/prompt-workspace-v1";
import { closeDatabase, getDatabase, initDatabase } from "@prompthub/db";
import { getDatabasePath, getRootDir, getSkillsDir } from "./runtime-paths.js";
import { seedTestDatabaseFromTemplate } from "./test-helpers/database-template.js";

let initialized = false;

export function getServerDatabase(): ReturnType<typeof getDatabase> {
  if (!initialized) {
    // The Web image is a single-server deployment per mounted DATA_ROOT. Allow
    // the shared initializer to recover a lock left by a pre-lease/crashed run;
    // live registered clients are still protected by the lease scan.
    const databasePath = getDatabasePath();
    seedTestDatabaseFromTemplate(databasePath);
    const database = initDatabase(databasePath, {
      recoverUnregisteredLock: true,
    });
    try {
      for (const key of [
        "rule-storage",
        "web-skill-storage",
        "skill-storage",
        "web-backup-import",
      ])
        recoverSqliteEntryPublication(database, getRootDir(), key);
      migrateWebRuleMetadata(database, getRootDir(), databasePath);
      migrateWebSettings(database, getRootDir(), databasePath);
      migrateWebSkillMetadata(database, getRootDir(), databasePath);
      migrateSkillPayloadFilesV1(database, {
        rootPath: getRootDir(),
        databasePath,
        skillsRoot: getSkillsDir(),
        allowLinkedPackages: false,
      });
      migratePromptWorkspaceV1(database, {
        rootPath: getRootDir(),
        databasePath,
        sourceFormat: "web",
      });
      initialized = true;
    } catch (error) {
      closeDatabase();
      throw error;
    }
  }

  return getDatabase();
}

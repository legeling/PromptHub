import {
  DatabaseAdapter,
  db as activeDatabase,
  closeDatabase,
  getDatabase,
  initDatabase as dbInit,
  isDatabaseEmpty,
  SCHEMA,
  SCHEMA_INDEXES,
  SCHEMA_TABLES,
} from "@prompthub/db";
import type { InitDatabaseHooks } from "@prompthub/db";

import { getDataDir, getDatabasePath, getUserDataPath } from "./runtime-paths";
import { recoverCanonicalResourcePublications } from "./resource-bundle-publication";
import { recoverCanonicalEntryPublications } from "./canonical-entry-publication";
import { assertStorageMaintenanceAvailable } from "./storage-maintenance-intent";
import { reconcileCanonicalStorageCatalog } from "./canonical-catalog-reconciliation";
import { CanonicalSkillDB } from "./canonical-skill-db";
import { CanonicalRuleDB } from "./canonical-rule-db";
import {
  CanonicalFolderDB,
  CanonicalPromptDB,
  CanonicalPromptOutputFormatDB,
  CanonicalPromptRelationDB,
  assertCanonicalPromptCatalogCurrent,
} from "./canonical-prompt-graph-db";
import { getRuntimeStorageContext } from "./runtime-paths";

export function initDatabase(
  hooks?: InitDatabaseHooks,
): DatabaseAdapter.Database {
  assertStorageMaintenanceAvailable(getUserDataPath());
  if (
    !activeDatabase &&
    getRuntimeStorageContext().localAuthority === "canonical-files"
  ) {
    reconcileCanonicalStorageCatalog({
      activeRoot: getUserDataPath(),
      databasePath: getDatabasePath(),
    });
  } else {
    recoverCanonicalEntryPublications(getUserDataPath());
    recoverCanonicalResourcePublications(getDataDir());
  }
  const database = dbInit(getDatabasePath(), hooks);
  if (getRuntimeStorageContext().localAuthority === "canonical-files") {
    try {
      assertCanonicalPromptCatalogCurrent(database);
      new CanonicalSkillDB(database).reconcileCanonicalWorkspaces();
      new CanonicalRuleDB(database).reconcileCanonicalWorkspaces();
    } catch (error) {
      closeDatabase();
      throw error;
    }
  }
  return database;
}

export {
  closeDatabase,
  DatabaseAdapter,
  getDatabase,
  isDatabaseEmpty,
  SCHEMA,
  SCHEMA_INDEXES,
  SCHEMA_TABLES,
};

export { CanonicalSkillDB as SkillDB };
export { CanonicalRuleDB as RuleDB };
export { CanonicalPromptDB as PromptDB };
export { CanonicalFolderDB as FolderDB };
export { CanonicalPromptRelationDB as PromptRelationDB };
export { CanonicalPromptOutputFormatDB as PromptOutputFormatDB };

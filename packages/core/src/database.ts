import { migrateWorkspaceData } from "./workspace-data-migrations";
import {
  DatabaseAdapter,
  db as activeDatabase,
  closeDatabase,
  getDatabase,
  initDatabase as dbInit,
  isDatabaseEmpty,
  inspectDatabaseClientLeases,
  SCHEMA,
  SCHEMA_INDEXES,
  SCHEMA_TABLES,
} from "@prompthub/db";
import type { InitDatabaseHooks } from "@prompthub/db";

import { getDataDir, getDatabasePath, getSkillsDir, getUserDataPath } from "./runtime-paths";
import { recoverCanonicalResourcePublications } from "./resource-bundle-publication";
import { recoverStorageEntryPublications } from "./sqlite-entry-publication";
import { assertStorageMaintenanceAvailable } from "./storage-maintenance-intent";
import { reconcileCanonicalStorageCatalog } from "./canonical-catalog-reconciliation";
import { SkillStorageDB } from "./skill-storage";
import { RuleStorageDB } from "./rule-storage";
import { getRuntimeStorageContext } from "./runtime-paths";
import { initializeMcpStorage } from "./mcp-storage-migration";
import type { McpStorageOptions } from "./mcp-storage";

function requiresCatalogReconciliation(): boolean {
  if (
    activeDatabase ||
    getRuntimeStorageContext().localAuthority !== "canonical-files"
  ) return false;
  const clients = inspectDatabaseClientLeases(getDatabasePath());
  // Rebuilding replaces the database file and requires exclusive ownership.
  // A live runtime instead shares the existing SQLite connection contract;
  // dbInit still enforces schema compatibility, integrity and migration locks.
  return clients.unknownEntries.length > 0 || clients.livePids.length === 0;
}

export function initDatabase(
  hooks?: InitDatabaseHooks,
  mcpOptions: Pick<
    McpStorageOptions,
    "masterKeyStore" | "secretStore" | "injectPublicationFailure"
  > = {},
): DatabaseAdapter.Database {
  assertStorageMaintenanceAvailable(getUserDataPath());
  if (requiresCatalogReconciliation()) {
    reconcileCanonicalStorageCatalog({
      activeRoot: getUserDataPath(),
      databasePath: getDatabasePath(),
    });
  } else {
    recoverStorageEntryPublications(getUserDataPath());
    recoverCanonicalResourcePublications(getDataDir());
  }
  const database = dbInit(getDatabasePath(), hooks);
  try {
    migrateWorkspaceData(database, getUserDataPath(), getSkillsDir());
    initializeMcpStorage({ ...mcpOptions, database });
  } catch (error) {
    closeDatabase();
    throw error;
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

export { SkillStorageDB as SkillDB };
export { RuleStorageDB as RuleDB };
export {
  PromptDB,
  FolderDB,
  PromptRelationDB,
  PromptOutputFormatDB,
} from "@prompthub/db";

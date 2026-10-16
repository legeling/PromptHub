import { migrateSkillPayloadFilesV1 } from "./migrations/skill-payload-files-v1";
import { migrateGenerationSqliteV1 } from "./migrations/generation-sqlite-v1";
import { migrateSkillSqliteV1 } from "./migrations/skill-sqlite-v1";
import { migrateRuleMetadataV1 } from "./migrations/rule-metadata-v1";
import { migratePromptWorkspaceV1 } from "./migrations/prompt-workspace-v1";
import { migratePluginSqliteV1 } from "./migrations/plugin-sqlite-v1";
import { migrateAgentProviderSqliteV1 } from "./migrations/agent-provider-sqlite-v1";
import { migratePromptSqliteV1 } from "./migrations/prompt-sqlite-v1";
import { migrateAgentSettingsV1 } from "./migrations/agent-settings-v1";
import { migrateGeminiDefaultDisabled } from "./migrations/gemini-default-disabled-v1";
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

export function initDatabase(
  hooks?: InitDatabaseHooks,
  mcpOptions: Pick<
    McpStorageOptions,
    "masterKeyStore" | "secretStore" | "injectPublicationFailure"
  > = {},
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
    recoverStorageEntryPublications(getUserDataPath());
    recoverCanonicalResourcePublications(getDataDir());
  }
  const database = dbInit(getDatabasePath(), hooks);
  try {
    migrateSkillSqliteV1(database, {
      rootPath: getUserDataPath(),
      databasePath: getDatabasePath(),
    });
    migrateSkillPayloadFilesV1(database, { rootPath: getUserDataPath(), databasePath: getDatabasePath(), skillsRoot: getSkillsDir() });
    migrateAgentProviderSqliteV1(database, {
      rootPath: getUserDataPath(),
      databasePath: getDatabasePath(),
    });
    migratePromptSqliteV1(database, {
      rootPath: getUserDataPath(),
      databasePath: getDatabasePath(),
    });
    migratePromptWorkspaceV1(database, {
      rootPath: getUserDataPath(),
      databasePath: getDatabasePath(),
    });
    migrateGenerationSqliteV1(database, { rootPath: getUserDataPath(), databasePath: getDatabasePath() });
    migrateRuleMetadataV1(database, {
      rootPath: getUserDataPath(),
      databasePath: getDatabasePath(),
    });
    migratePluginSqliteV1(database, { rootPath: getUserDataPath(), databasePath: getDatabasePath() });
    initializeMcpStorage({ ...mcpOptions, database });
    migrateAgentSettingsV1(database, getUserDataPath());
    migrateGeminiDefaultDisabled(database);
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

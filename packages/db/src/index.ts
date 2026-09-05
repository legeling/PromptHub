// Database adapter
export { default as DatabaseAdapter } from "./adapter";
export type { default as Database } from "./adapter";

// Schema
export { SCHEMA_TABLES, SCHEMA_INDEXES, SCHEMA } from "./schema";

// Initialization
export {
  initDatabase,
  getDatabase,
  closeDatabase,
  isDatabaseEmpty,
  db,
} from "./init";
export type { InitDatabaseHooks } from "./init";
export {
  createDatabaseSafetyPoint,
  createConsistentDatabaseImage,
  getDatabaseSafetyPointRoot,
  listDatabaseSafetyPoints,
  pruneDatabaseSafetyPoints,
} from "./database-safety-point";
export type {
  DatabaseSafetyPoint,
  DatabaseSafetyPointFile,
  DatabaseSafetyPointManifest,
  DatabaseSafetyPointReason,
  DatabaseSafetyPointRetention,
} from "./database-safety-point";
export {
  cleanupOwnedTemporaryDatabase,
  createOwnedTemporaryDatabasePath,
  OWNED_TEMPORARY_DATABASE_MAX_BASENAME_LENGTH,
  OWNED_TEMPORARY_DATABASE_MAX_LABEL_LENGTH,
} from "./owned-temporary-database";
export {
  CURRENT_DATABASE_SCHEMA_VERSION,
  CURRENT_LEGACY_SCHEMA_MIGRATION_NAMES,
  DATABASE_MIGRATION_MANIFEST,
  getCurrentDatabaseSchemaInvariants,
} from "./database-migration-state";
export {
  recordCurrentDatabaseMigration,
  recordCurrentLegacySchemaMigrations,
} from "./database-migration-state";
export type {
  DatabaseLegacyMigrationManifestEntry,
  DatabaseMigrationManifestEntry,
  DatabaseSchemaInvariants,
} from "./database-migration-state";
export {
  acquireDatabaseClientLease,
  inspectDatabaseClientLeases,
  inspectDatabaseClientLock,
  recoverDatabaseClientLock,
} from "./database-client-lock";
export type {
  DatabaseClientLease,
  DatabaseClientLeaseInspection,
  DatabaseClientLeaseOptions,
  DatabaseLockInspection,
  DatabaseLockRecoveryReason,
  DatabaseLockRecoveryResult,
} from "./database-client-lock";
export {
  acquireDatabaseMigrationIntent,
  DatabaseMigrationBusyError,
} from "./database-migration-intent";
export type {
  DatabaseMigrationIntent,
  DatabaseMigrationIntentOptions,
} from "./database-migration-intent";

// DB classes
export { PromptDB } from "./prompt";
export {
  repairPromptVersionConsistency,
  type PromptVersionConsistencyRepair,
} from "./prompt-version-consistency";
export { PromptRelationDB } from "./prompt-relation";
export { PromptOutputFormatDB } from "./prompt-output-format";
export { FolderDB } from "./folder";
export { SkillDB } from "./skill";
export { RuleDB } from "./rule";
export { AgentProviderProfileDB } from "./agent-provider-profile";
export {
  CanonicalResourceDB,
  type CanonicalResourceRecord,
} from "./canonical-resource";
export { AgentSessionIndexDB } from "./agent-session-index";
export { AgentConversationDB } from "./agent-conversation";

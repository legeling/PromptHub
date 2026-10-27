import { resolveRuntimeStorageContext } from "./runtime-storage-context";
import type { DatabaseAdapter } from "@prompthub/db";
import { migrateSkillSqliteV1 } from "./migrations/skill-sqlite-v1";
import { migrateSkillPayloadFiles } from "./migrations/skill-payload-upgrade";
import { migrateAgentProviderSqliteV1 } from "./migrations/agent-provider-sqlite-v1";
import { migratePromptSqliteV1 } from "./migrations/prompt-sqlite-v1";
import { migratePromptWorkspaceV2 } from "./migrations/prompt-workspace-v2";
import { migrateGenerationSqliteV1 } from "./migrations/generation-sqlite-v1";
import { migrateRuleMetadataV1 } from "./migrations/rule-metadata-v1";
import { migratePluginSqliteV1 } from "./migrations/plugin-sqlite-v1";
import { migrateAgentSettingsV1 } from "./migrations/agent-settings-v1";
import { migrateGeminiDefaultDisabled } from "./migrations/gemini-default-disabled-v1";

/** Startup and staged restore run the same ordered business-data conversions. */
export function migrateWorkspaceData(
  database: DatabaseAdapter.Database,
  rootPath: string,
  skillsRoot: string,
): void {
  const options = {
    rootPath,
    databasePath: resolveRuntimeStorageContext(rootPath).databasePath,
  };
  migrateSkillSqliteV1(database, options);
  migrateSkillPayloadFiles(database, { ...options, skillsRoot });
  migrateAgentProviderSqliteV1(database, options);
  migratePromptSqliteV1(database, options);
  migratePromptWorkspaceV2(database, options);
  migrateGenerationSqliteV1(database, options);
  migrateRuleMetadataV1(database, options);
  migratePluginSqliteV1(database, options);
  migrateAgentSettingsV1(database, rootPath);
  migrateGeminiDefaultDisabled(database);
}

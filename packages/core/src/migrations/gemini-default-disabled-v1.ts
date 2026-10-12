import type { DatabaseAdapter } from "@prompthub/db";
import { DEFAULT_DISABLED_PLATFORM_IDS } from "@prompthub/shared/types";
import { AgentSettingsRepository } from "../agent-management/agent-settings-repository";

const MIGRATION_NAME = "gemini-default-disabled-v1";

/** Apply the opt-in default once; subsequent user enablement remains authoritative. */
export function migrateGeminiDefaultDisabled(
  database: DatabaseAdapter.Database,
): void {
  database.transaction(() => {
    if (
      database
        .prepare("SELECT name FROM schema_migrations WHERE name = ?")
        .get(MIGRATION_NAME)
    )
      return;
    const repository = new AgentSettingsRepository(database);
    repository.patch({
      disabledPlatformIds: [
        ...new Set([
          ...repository.read().disabledPlatformIds,
          ...DEFAULT_DISABLED_PLATFORM_IDS,
        ]),
      ],
    });
    database
      .prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)")
      .run(MIGRATION_NAME, Date.now());
  })();
}

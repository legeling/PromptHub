import type Database from "./adapter";

export const ANTIGRAVITY_CLI_IDENTITY_MIGRATION =
  "split_antigravity_cli_identity_v1";

/** Runs inside initDatabase's migration transaction, before the completion receipt. */
export function migrateAntigravityCliIdentity(db: Database.Database): void {
  const desktop = "antigravity";
  const cli = "antigravity-cli";
  db.run(
    `UPDATE agent_provider_profiles SET platform_id = ?
    WHERE platform_id = ? AND json_valid(config_json)
      AND json_extract(config_json, '$.adapter') = ?`,
    cli,
    desktop,
    "antigravity-settings-v1",
  );
  // Snapshots remain immutable audit evidence, including the original identity.
  // Before the split the only Antigravity conversation reader was the CLI adapter.
  db.run(
    "UPDATE agent_conversation_metadata SET agent_id = ? WHERE agent_id = ?",
    cli,
    desktop,
  );
  db.run(
    "UPDATE agent_conversation_handoffs SET source_agent_id = ? WHERE source_agent_id = ?",
    cli,
    desktop,
  );
  db.run(
    "UPDATE agent_conversation_handoffs SET target_agent_id = ? WHERE target_agent_id = ?",
    cli,
    desktop,
  );
  db.run(
    "UPDATE agent_session_sources SET platform_id = ? WHERE platform_id = ? AND adapter_id = ?",
    cli,
    desktop,
    "antigravity-cli-transcript-v1",
  );
}

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { initDatabase, closeDatabase } from "@prompthub/db/init";
import { ANTIGRAVITY_CLI_IDENTITY_MIGRATION } from "@prompthub/db/antigravity-cli-identity-migration";
import { migrateAntigravityCliIdentity } from "@prompthub/db/antigravity-cli-identity-migration";

let root: string;
afterEach(() => {
  closeDatabase();
  if (root) fs.rmSync(root, { recursive: true, force: true });
});

it("upgrades real existing CLI profiles and annotations once without changing desktop assets", () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-agy-migration-"));
  const file = path.join(root, "data.db");
  let db = initDatabase(file);
  db.run(
    "DELETE FROM schema_migrations WHERE name = ?",
    ANTIGRAVITY_CLI_IDENTITY_MIGRATION,
  );
  for (const [id, config] of [
    ["cli-profile", '{"adapter":"antigravity-settings-v1"}'],
    ["unknown-profile", "{}"],
  ]) {
    db.run(
      `INSERT INTO agent_provider_profiles (id,platform_id,name,provider_kind,protocol,config_json,source,created_at,updated_at)
      VALUES (?, 'antigravity', ?, 'google-antigravity','platform-native',?,'native-import',1,1)`,
      id,
      id,
      config,
    );
  }
  db.run(
    "INSERT INTO agent_provider_model_mappings (id,provider_profile_id,route_key,model_id) VALUES ('mapping','cli-profile','primary','Gemini 3.8 Flash')",
  );
  db.run(
    "INSERT INTO agent_conversation_metadata (id,agent_id,session_id,note,created_at,updated_at) VALUES ('note','antigravity','session','Preserve me',1,1)",
  );
  closeDatabase();
  db = initDatabase(file);
  expect(
    db.get(
      "SELECT platform_id FROM agent_provider_profiles WHERE id = ?",
      "cli-profile",
    ),
  ).toEqual({ platform_id: "antigravity-cli" });
  expect(
    db.get(
      "SELECT platform_id FROM agent_provider_profiles WHERE id = ?",
      "unknown-profile",
    ),
  ).toEqual({ platform_id: "antigravity" });
  expect(
    db.get(
      "SELECT model_id FROM agent_provider_model_mappings WHERE id = ?",
      "mapping",
    ),
  ).toEqual({ model_id: "Gemini 3.8 Flash" });
  expect(
    db.get(
      "SELECT agent_id,note FROM agent_conversation_metadata WHERE id = ?",
      "note",
    ),
  ).toEqual({ agent_id: "antigravity-cli", note: "Preserve me" });
  closeDatabase();
  db = initDatabase(file);
  expect(
    db.get("SELECT COUNT(*) AS count FROM agent_provider_profiles"),
  ).toEqual({ count: 2 });
  expect(
    db.get(
      "SELECT COUNT(*) AS count FROM schema_migrations WHERE name = ?",
      ANTIGRAVITY_CLI_IDENTITY_MIGRATION,
    ),
  ).toEqual({ count: 1 });
});

it("rolls back the entire split on conflicting conversation identities", () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-agy-migration-"));
  const db = initDatabase(path.join(root, "data.db"));
  db.run(`INSERT INTO agent_provider_profiles (id,platform_id,name,provider_kind,protocol,config_json,source,created_at,updated_at)
    VALUES ('profile','antigravity','Native','google-antigravity','platform-native','{"adapter":"antigravity-settings-v1"}','native-import',1,1)`);
  for (const id of ["antigravity", "antigravity-cli"]) {
    db.run(
      "INSERT INTO agent_conversation_metadata (id,agent_id,session_id,note,created_at,updated_at) VALUES (?,?, 'session',?,1,1)",
      id,
      id,
      id,
    );
  }
  expect(() =>
    db.transaction(() => migrateAntigravityCliIdentity(db))(),
  ).toThrow();
  expect(
    db.get(
      "SELECT platform_id FROM agent_provider_profiles WHERE id = 'profile'",
    ),
  ).toEqual({ platform_id: "antigravity" });
  expect(
    db.all(
      "SELECT agent_id,note FROM agent_conversation_metadata ORDER BY agent_id",
    ),
  ).toEqual([
    { agent_id: "antigravity", note: "antigravity" },
    { agent_id: "antigravity-cli", note: "antigravity-cli" },
  ]);
});

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createDatabaseSafetyPoint, type DatabaseAdapter } from "@prompthub/db";
import { assertStoragePathComponentsSafe } from "@prompthub/core/runtime-storage-context";
import {
  publishSqliteEntries,
  recoverSqliteEntryPublication,
} from "@prompthub/core/sqlite-entry-publication";
import type { CanonicalEntryMutation } from "@prompthub/core/canonical-entry-publication";
import { importedSettingsSchema } from "./settings-validation.js";

const MIGRATION_NAME = "web-settings-sqlite-v1";
const historicalSettingsSchema = importedSettingsSchema.partial().passthrough();
interface SettingsSource {
  name: string;
  userId: string;
  digest: string;
  hasSqlSettings: boolean;
}
function digest(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}
function readHistoricalSettings(bytes: Buffer): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("Invalid historical Web settings JSON");
  }
  if (!historicalSettingsSchema.safeParse(value).success)
    throw new Error("Invalid historical Web settings fields");
  // The schema validates the object; preserve original values and unknown historical fields.
  return value as Record<string, unknown>;
}
function readSources(
  database: DatabaseAdapter.Database,
  root: string,
  directory: string,
): SettingsSource[] {
  assertStoragePathComponentsSafe(root, directory);
  if (!fs.lstatSync(directory).isDirectory())
    throw new Error("Historical Web settings root is not a directory");
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => {
      if (!entry.isFile() || !entry.name.endsWith(".json"))
        throw new Error(
          "Historical Web settings source is not a regular JSON file",
        );
      const userId = entry.name.slice(0, -".json".length);
      if (!database.get("SELECT id FROM users WHERE id = ?", userId))
        throw new Error("Historical Web settings source has an unknown owner");
      const file = path.join(directory, entry.name);
      const bytes = fs.readFileSync(file);
      const settings = readHistoricalSettings(bytes);
      if (
        Object.keys(settings).some(
          (key) => key.includes("\0") || key === "__proto__",
        )
      )
        throw new Error("Historical Web setting key is unsafe");
      return {
        name: entry.name,
        userId,
        digest: digest(bytes),
        hasSqlSettings:
          database.get(
            "SELECT key FROM user_settings WHERE user_id = ? LIMIT 1",
            userId,
          ) !== null,
      };
    });
}
function verifyRecovery(
  root: string,
  directory: string,
  sources: SettingsSource[],
): void {
  assertStoragePathComponentsSafe(root, directory);
  const names = fs.readdirSync(directory);
  if (names.length !== sources.length)
    throw new Error("Web settings recovery inventory mismatch");
  for (const source of sources) {
    const file = path.join(directory, source.name);
    assertStoragePathComponentsSafe(root, file);
    if (
      !fs.lstatSync(file).isFile() ||
      digest(fs.readFileSync(file)) !== source.digest
    )
      throw new Error("Web settings recovery copy mismatch");
  }
}
function recoveryEntry(
  root: string,
  legacy: string,
  recovery: string,
  sources: SettingsSource[],
): CanonicalEntryMutation {
  return {
    targetPath: recovery,
    prepare(stage) {
      fs.mkdirSync(stage, { mode: 0o700 });
      for (const source of sources) {
        const file = path.join(legacy, source.name);
        assertStoragePathComponentsSafe(root, file);
        const bytes = fs.readFileSync(file);
        if (digest(bytes) !== source.digest)
          throw new Error("Historical Web settings changed during conversion");
        fs.writeFileSync(path.join(stage, source.name), bytes, {
          mode: 0o600,
          flag: "wx",
        });
      }
      verifyRecovery(root, stage, sources);
    },
  };
}
export function migrateWebSettings(
  database: DatabaseAdapter.Database,
  root: string,
  databasePath: string,
): void {
  recoverSqliteEntryPublication(database, root, MIGRATION_NAME);
  const legacy = path.join(root, "config", "settings");
  assertStoragePathComponentsSafe(root, legacy);
  if (
    database.get(
      "SELECT name FROM schema_migrations WHERE name = ?",
      MIGRATION_NAME,
    )
  ) {
    if (fs.existsSync(legacy))
      throw new Error("Retired Web settings source requires explicit recovery");
    return;
  }
  const sources = fs.existsSync(legacy)
    ? readSources(database, root, legacy)
    : [];
  const sourceDigest = crypto
    .createHash("sha256")
    .update(
      JSON.stringify(sources.map(({ name, digest: hash }) => [name, hash])),
    )
    .digest("hex");
  const recovery = path.join(root, "recovery", MIGRATION_NAME, sourceDigest);
  const entries: CanonicalEntryMutation[] = [];
  if (fs.existsSync(legacy)) {
    assertStoragePathComponentsSafe(root, recovery);
    if (fs.existsSync(recovery)) verifyRecovery(root, recovery, sources);
    else entries.push(recoveryEntry(root, legacy, recovery, sources));
    entries.push({ targetPath: legacy, delete: true });
    createDatabaseSafetyPoint(databasePath, "pre-migration");
  }
  publishSqliteEntries(database, {
    rootPath: root,
    databasePath,
    operationKey: MIGRATION_NAME,
    entries,
    commit() {
      const timestamp = Date.now();
      for (const source of sources) {
        if (source.hasSqlSettings) continue;
        const file = path.join(recovery, source.name);
        const bytes = fs.readFileSync(file);
        if (digest(bytes) !== source.digest)
          throw new Error("Web settings recovery changed during conversion");
        for (const [key, value] of Object.entries(
          readHistoricalSettings(bytes),
        )) {
          database.run(
            "INSERT INTO user_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)",
            source.userId,
            key,
            JSON.stringify(value),
            timestamp,
          );
        }
      }
      database.run(
        "INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)",
        MIGRATION_NAME,
        timestamp,
      );
    },
  });
}

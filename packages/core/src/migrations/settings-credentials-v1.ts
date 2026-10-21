import { SettingsDB, type DatabaseAdapter } from "@prompthub/db";
import { FLAT_SECRET_FIELDS } from "../renderer-persistence-policy";
import { encodeRendererSettings } from "../renderer-settings-codec";
import { SETTINGS_SQLITE_MIGRATION } from "../settings-storage";

export const SETTINGS_CREDENTIALS_MIGRATION = "settings-credentials-v1";
const CONNECTION_FIELDS = ["username", "password"] as const;
const AI_FIELDS = ["apiKey"] as const;

export interface SettingsCredentialsUpgrade {
  updates: Record<string, unknown>;
  deletions: string[];
  secrets: Record<string, string>;
  protectedSecrets: Array<{ ref: string; value: string }>;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid stored settings credential object");
  return value as Record<string, unknown>; // Object shape is validated before reading credential fields.
}

function withoutReferences(
  value: unknown,
  fields: readonly string[],
): Record<string, unknown> {
  const result = { ...record(value) };
  for (const field of fields) delete result[`${field}Ref`];
  return result;
}

function credentialInput(
  stored: Record<string, unknown>,
): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const field of FLAT_SECRET_FIELDS) {
    const value = stored[field];
    if (
      value !== undefined &&
      (value === null || typeof value !== "object" || Array.isArray(value))
    )
      input[field] = value;
  }
  for (const domain of ["networkProxy", "sync"] as const)
    if (stored[domain] !== undefined)
      input[domain] = withoutReferences(stored[domain], CONNECTION_FIELDS);
  for (const domain of ["aiProviders", "aiModels"] as const) {
    const entries = stored[domain];
    if (entries === undefined) continue;
    if (!Array.isArray(entries))
      throw new Error("Invalid stored AI credential collection");
    input[domain] = entries.map((entry) => withoutReferences(entry, AI_FIELDS));
  }
  return input;
}

function upgradedEntry(
  original: Record<string, unknown>,
  encoded: Record<string, unknown>,
  fields: readonly string[],
  plan: SettingsCredentialsUpgrade,
): Record<string, unknown> {
  const result = { ...original };
  for (const field of fields) {
    if (!(field in original)) continue;
    const refKey = `${field}Ref`,
      generatedRef = encoded[refKey];
    if (typeof generatedRef === "string") {
      const existingRef = original[refKey];
      if (refKey in original) {
        if (typeof existingRef !== "string")
          throw new Error("Invalid stored credential reference");
        plan.protectedSecrets.push({
          ref: existingRef,
          value: plan.secrets[generatedRef],
        });
        delete plan.secrets[generatedRef];
      } else result[refKey] = generatedRef;
    }
    delete result[field];
  }
  return result;
}

function nestedUpdates(
  stored: Record<string, unknown>,
  encoded: Record<string, unknown>,
  plan: SettingsCredentialsUpgrade,
): void {
  for (const domain of ["networkProxy", "sync"] as const) {
    if (stored[domain] === undefined) continue;
    const original = record(stored[domain]);
    if (CONNECTION_FIELDS.some((field) => field in original))
      plan.updates[domain] = upgradedEntry(
        original,
        record(encoded[domain]),
        CONNECTION_FIELDS,
        plan,
      );
  }
  for (const domain of ["aiProviders", "aiModels"] as const) {
    const original = stored[domain],
      normalized = encoded[domain];
    if (original === undefined) continue;
    if (!Array.isArray(original) || !Array.isArray(normalized))
      throw new Error("Invalid stored AI credential collection");
    if (original.some((entry) => "apiKey" in record(entry)))
      plan.updates[domain] = original.map((entry, index) =>
        upgradedEntry(
          record(entry),
          record(normalized[index]),
          AI_FIELDS,
          plan,
        ),
      );
  }
}

/** Convert issued SQL values once; the current encoder remains the credential contract. */
export function planSettingsCredentialsUpgrade(
  database: DatabaseAdapter.Database,
): SettingsCredentialsUpgrade | null {
  const migration = database.prepare(
    "SELECT name FROM schema_migrations WHERE name = ?",
  );
  if (migration.get(SETTINGS_CREDENTIALS_MIGRATION)) return null;
  if (!migration.get(SETTINGS_SQLITE_MIGRATION))
    throw new Error("Credential upgrade requires SQLite settings migration");
  const settings = new SettingsDB(database);
  const stored = Object.fromEntries(
    [
      ...FLAT_SECRET_FIELDS,
      "networkProxy",
      "sync",
      "aiProviders",
      "aiModels",
    ].map((key) => [key, settings.get(key)]),
  );
  const input = credentialInput(stored);
  const encoded = encodeRendererSettings(input);
  const plan: SettingsCredentialsUpgrade = {
    updates: {},
    deletions: [],
    secrets: encoded.secrets,
    protectedSecrets: [],
  };
  for (const field of FLAT_SECRET_FIELDS) {
    if (!(field in input)) continue;
    if (field in encoded.settings)
      plan.updates[field] = encoded.settings[field];
    else plan.deletions.push(field);
  }
  nestedUpdates(stored, encoded.settings, plan);
  return plan;
}

export function mergeSettingsCredentialUpgradeSecrets(
  plan: SettingsCredentialsUpgrade,
  current: Record<string, string>,
): Record<string, string> {
  for (const { ref, value } of plan.protectedSecrets)
    if (current[ref] !== value)
      throw new Error(
        "Settings credential conflict requires explicit recovery",
      );
  for (const [ref, value] of Object.entries(plan.secrets))
    if (
      Object.prototype.hasOwnProperty.call(current, ref) &&
      current[ref] !== value
    )
      throw new Error(
        "Settings credential conflict requires explicit recovery",
      );
  return { ...current, ...plan.secrets };
}

/** Called inside the settings owner's SQL/file publication transaction. */
export function commitSettingsCredentialsUpgrade(
  database: DatabaseAdapter.Database,
  plan: SettingsCredentialsUpgrade,
): void {
  const settings = new SettingsDB(database);
  settings.deleteKeys(plan.deletions);
  settings.set(plan.updates);
  database
    .prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)")
    .run(SETTINGS_CREDENTIALS_MIGRATION, Date.now());
}

import crypto from "node:crypto";
import fs from "node:fs";
import { assertStoragePathComponentsSafe } from "../runtime-storage-context";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { SettingsDB, type DatabaseAdapter } from "@prompthub/db";
import type { CanonicalEntryMutation } from "../canonical-entry-publication";
import {
  decodeRendererSettings,
  RENDERER_SETTING_KEYS,
} from "../renderer-settings-codec";
import { FLAT_SECRET_FIELDS } from "../renderer-persistence-policy";
import {
  SETTINGS_PRIVATE_KEYS,
  SETTINGS_SQLITE_MIGRATION,
  SETTINGS_VAULT_PATH,
  readSettingsBytes,
  settingsFileEntry,
} from "../settings-storage";

const LEGACY_FILES = [
  "config/app.json",
  "config/providers.json",
  "config/sync-providers.json",
  "config/ai-models.json",
] as const;
const LEGACY_MARKER = "data/operations/migrations/renderer-persistence-v1.json";

export interface LegacySettingsEncryption {
  isEncryptionAvailable(): boolean;
  decryptString(value: Buffer): string;
}
export interface SettingsUpgradePlan {
  settings: Record<string, unknown>;
  entries: CanonicalEntryMutation[];
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Invalid historical settings object");
  return value as Record<string, unknown>; // The migration rejects non-record source values before accessing fields.
}
function document(
  bytes: Buffer | null,
  kind: string,
): Record<string, unknown> | null {
  if (bytes === null) return null;
  const value = record(JSON.parse(bytes.toString("utf8")));
  if (value.kind !== kind || value.version !== 1)
    throw new Error("Unsupported historical settings document");
  return value;
}

function legacySecrets(
  bytes: Buffer | null,
  encryption?: LegacySettingsEncryption,
): Record<string, string> {
  const value = document(bytes, "prompthub-device-secret-vault");
  if (value === null) return {};
  const entries = Object.entries(record(value.secrets));
  if (entries.length && (!encryption || !encryption.isEncryptionAvailable()))
    throw new Error(
      "Start the desktop app to upgrade this profile's historical device credentials",
    );
  return Object.fromEntries(
    entries.map(([ref, ciphertext]) => {
      if (
        typeof ciphertext !== "string" ||
        !ciphertext ||
        Buffer.from(ciphertext, "base64").toString("base64") !== ciphertext ||
        !encryption
      )
        throw new Error("Invalid historical settings ciphertext");
      return [ref, encryption.decryptString(Buffer.from(ciphertext, "base64"))];
    }),
  );
}

function fileSettings(
  documents: Array<Record<string, unknown> | null>,
  secrets: Record<string, string>,
): Record<string, unknown> {
  const [app, providers, sync] = documents;
  const values = Object.assign(
    {},
    ...[app, sync, providers].map((value) =>
      value ? record(value.settings) : {},
    ),
  );
  for (const value of [app, sync, providers]) {
    if (!value) continue;
    for (const [field, ref] of Object.entries(record(value.secretRefs ?? {}))) {
      if (!FLAT_SECRET_FIELDS.some((known) => known === field))
        throw new Error("Unknown historical secret field");
      values[field] = { secretRef: ref };
    }
  }
  if (providers) {
    if (!Array.isArray(providers.providers) || !Array.isArray(providers.models))
      throw new Error("Invalid historical AI inventory");
    values.aiProviders = providers.providers;
    values.aiModels = providers.models;
  }
  return decodeRendererSettings(values, secrets);
}

function recoveryEntries(
  root: string,
  sources: Map<string, Buffer>,
): CanonicalEntryMutation[] {
  const digest = crypto.createHash("sha256");
  for (const [name, bytes] of sources) digest.update(name).update(bytes);
  const recovery = `recovery/${SETTINGS_SQLITE_MIGRATION}/${digest.digest("hex")}`;
  return [...sources].map(([name, bytes]) =>
    settingsFileEntry(root, `${recovery}/${name}`, bytes),
  );
}

function mergeLegacyAI(
  settings: Record<string, unknown>,
  ai: Record<string, unknown> | null,
  fileOwned: boolean,
): void {
  if (!ai || fileOwned) return;
  if (!Array.isArray(ai.providers) || !Array.isArray(ai.models))
    throw new Error("Invalid historical CLI AI inventory");
  for (const [field, value] of [
    ["aiProviders", ai.providers],
    ["aiModels", ai.models],
    ["modelRouteDefaults", ai.modelRouteDefaults ?? {}],
  ] as const) {
    // Before renderer conversion, nonempty CLI files owned the AI inventory.
    // Empty CLI defaults must not erase a populated browser/SQL inventory.
    if (Object.keys(value).length > 0 || !(field in settings))
      settings[field] = value;
  }
  if (!("settingsUpdatedAt" in settings) && typeof ai.updatedAt === "string")
    settings.settingsUpdatedAt = ai.updatedAt;
}

/** Historical readers are used once, before the SQL migration ledger is committed. */
export function planSettingsSqliteUpgrade(
  database: DatabaseAdapter.Database,
  root: string,
  encryption?: LegacySettingsEncryption,
  recoveredAIConfig?: { providers: unknown[]; models: unknown[] },
): SettingsUpgradePlan | null {
  if (
    database
      .prepare("SELECT name FROM schema_migrations WHERE name = ?")
      .get(SETTINGS_SQLITE_MIGRATION)
  ) {
    for (const name of LEGACY_FILES) {
      const file = path.join(root, name);
      assertStoragePathComponentsSafe(root, file);
      if (fs.existsSync(file))
        throw new Error("Retired settings files require explicit recovery");
    }
    return null;
  }
  const sources = new Map<string, Buffer>();
  for (const name of LEGACY_FILES) {
    const bytes = readSettingsBytes(root, name);
    if (bytes) sources.set(name, bytes);
  }
  const raw = new SettingsDB(database)
    .rawEntries()
    .filter(({ key }) => !SETTINGS_PRIVATE_KEYS.has(key));
  const settings = Object.fromEntries(
    raw.map(({ key, value }) => {
      try {
        return [key, JSON.parse(value)];
      } catch {
        return [key, value];
      } // Earlier settings rows allowed raw strings; this is the only conversion boundary.
    }),
  );
  if (raw.length)
    sources.set("settings-rows.json", Buffer.from(JSON.stringify(raw)));
  const marker = document(
    readSettingsBytes(root, LEGACY_MARKER),
    "prompthub-renderer-persistence-migration",
  );
  if (
    marker &&
    (marker.state !== "complete" ||
      typeof marker.completedAt !== "string" ||
      typeof marker.indexedDbMigrationDone !== "boolean")
  )
    throw new Error("Invalid historical renderer migration marker");
  const kinds = [
    "prompthub-app-config",
    "prompthub-provider-config",
    "prompthub-sync-provider-config",
    "prompthub-ai-config",
  ];
  const documents = LEGACY_FILES.map((name, index) =>
    document(sources.get(name) ?? null, kinds[index]),
  );
  if (marker && documents.slice(0, 3).some((value) => value === null))
    throw new Error(
      "Incomplete historical renderer settings; recover the missing configuration files",
    );
  const vault = readSettingsBytes(root, SETTINGS_VAULT_PATH);
  const secrets = legacySecrets(vault, encryption);
  if (vault) sources.set(SETTINGS_VAULT_PATH, vault);
  if (documents.slice(0, 3).some((value) => value !== null)) {
    const historical = fileSettings(documents, secrets);
    if (marker)
      for (const key of RENDERER_SETTING_KEYS) {
        if (key !== "sync") delete settings[key];
      }
    for (const [key, value] of Object.entries(historical)) {
      if (
        !marker &&
        key in settings &&
        !isDeepStrictEqual(settings[key], value)
      )
        throw new Error(`Historical settings conflict: ${key}`);
      settings[key] = value;
    }
  }
  mergeLegacyAI(settings, documents[3], marker !== null);
  if (recoveredAIConfig) {
    const routed = Object.values(
      record(settings.modelRouteDefaults ?? {}),
    ).filter((id): id is string => typeof id === "string" && id.length > 0);
    const recoveredIds = new Set(
      recoveredAIConfig.models.map((model) => record(model).id),
    );
    if (
      !marker ||
      !Array.isArray(settings.aiModels) ||
      settings.aiModels.length ||
      !routed.length ||
      !routed.every((id) => recoveredIds.has(id))
    )
      throw new Error(
        "Historical AI recovery no longer matches the settings upgrade",
      );
    settings.aiProviders = recoveredAIConfig.providers;
    settings.aiModels = recoveredAIConfig.models;
  }
  return {
    settings,
    entries: [
      ...recoveryEntries(root, sources),
      ...LEGACY_FILES.filter((name) => sources.has(name)).map((name) => ({
        targetPath: path.join(root, name),
        delete: true,
      })),
    ],
  };
}

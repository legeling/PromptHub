import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { DatabaseAdapter } from "@prompthub/db";
import { AgentSettingsRepository } from "./agent-management/agent-settings-repository";
import {
  AGENT_SETTING_KEYS,
  RETIRED_AGENT_SETTING_KEYS,
} from "./agent-management/agent-settings-contract";
import { convertAgentSettingsV1 } from "./migrations/agent-settings-v1";
import type { DeviceMasterKeyStore } from "./device-keyring";
import {
  migrateRendererAuxiliaryState,
  readRendererAuxiliaryState,
  writeRendererAuxiliaryState,
} from "./renderer-auxiliary-state";
import { CoreSettingsStore } from "./settings-store";
import { settingsJsonEntry } from "./settings-storage";
import { recoverSqliteEntryPublication } from "./sqlite-entry-publication";
import { assertStoragePathComponentsSafe } from "./runtime-storage-context";
import {
  MAX_SNAPSHOT_BYTES,
  parsePersistedState,
  parseSources,
  parseRecoveryPaths,
  normalizeDeviceId,
  parseJson,
  asRecord,
  type MarketplaceSourceRecord,
} from "./renderer-persistence-validation";
import { REDACT_LEGACY_KEYS } from "./renderer-persistence-policy";
export type { MarketplaceSourceRecord } from "./renderer-persistence-validation";

export const RENDERER_PERSISTENCE_VERSION = 1;
export const RENDERER_PERSISTENCE_MARKER =
  "data/operations/migrations/renderer-persistence-v1.json";

export interface RendererPersistenceEncryption {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export interface RendererPersistenceMigrationInput {
  settings?: unknown;
  legacyAIConfig?: unknown;
  skillStore?: unknown;
  mcpStore?: unknown;
  pluginStore?: unknown;
  selfHostedDeviceId?: unknown;
  recoveryPaths?: unknown;
  indexedDbMigrationDone?: unknown;
}

export interface RendererHydratedState {
  migrationComplete: boolean;
  settings: Record<string, unknown>;
  marketplaceSources: {
    skill: MarketplaceSourceRecord[];
    mcp: MarketplaceSourceRecord[];
    plugin: MarketplaceSourceRecord[];
  };
  recoveryPaths: string[];
  selfHostedDeviceId: string | null;
  indexedDbMigrationDone: boolean;
}

export interface RendererPersistenceMigrationResult {
  status: "migrated" | "already-complete";
  redactLegacyKeys: string[];
}

export interface RendererPersistenceStore {
  migrate(
    input: RendererPersistenceMigrationInput,
  ): Promise<RendererPersistenceMigrationResult>;
  readHydratedState(): Promise<RendererHydratedState>;
  readHydratedStateSync(): RendererHydratedState;
  replaceSettings(settings: Record<string, unknown>): Promise<void>;
  patchSettings(settings: Record<string, unknown>): Promise<void>;
  replaceMarketplaceSources(
    domain: "skill" | "mcp" | "plugin",
    sources: MarketplaceSourceRecord[],
  ): Promise<void>;
  replaceRecoveryPaths(paths: string[]): Promise<void>;
  getOrCreateSelfHostedDeviceId(): Promise<string>;
  isIndexedDbMigrationDone(): Promise<boolean>;
  markIndexedDbMigrationDone(): Promise<void>;
}

export interface RendererPersistenceMarkerDocument {
  kind: "prompthub-renderer-persistence-migration";
  version: 1;
  state: "complete";
  completedAt: string;
  indexedDbMigrationDone: boolean;
  indexedDbVerificationVersion?: 1;
}

function initialSettings(
  current: Record<string, unknown>,
  input: RendererPersistenceMigrationInput,
): Record<string, unknown> {
  const settings = { ...current, ...parsePersistedState(input.settings) };
  const legacy = asRecord(input.legacyAIConfig);
  for (const [key, field] of [
    ["aiProviders", "providers"],
    ["aiModels", "models"],
  ] as const) {
    const existing = current[key];
    const imported = legacy[field];
    if (Array.isArray(existing) && existing.length) settings[key] = existing;
    else if (Array.isArray(imported) && imported.length)
      settings[key] = imported;
  }
  const currentRoutes = asRecord(current.modelRouteDefaults);
  const legacyRoutes = asRecord(legacy.modelRouteDefaults);
  if (Object.keys(currentRoutes).length)
    settings.modelRouteDefaults = currentRoutes;
  else if (Object.keys(legacyRoutes).length)
    settings.modelRouteDefaults = legacyRoutes;
  return settings;
}

export function createRendererPersistenceStore(options: {
  database: DatabaseAdapter.Database;
  rootPath: string;
  encryption: RendererPersistenceEncryption;
  masterKeyStore?: DeviceMasterKeyStore;
  now?: () => Date;
  failPublicationAt?: string;
}): RendererPersistenceStore {
  const rootPath = path.resolve(options.rootPath);
  recoverSqliteEntryPublication(
    options.database,
    rootPath,
    "renderer-persistence",
  );
  migrateRendererAuxiliaryState(options.database, rootPath);
  const settings = new CoreSettingsStore({
    ...options,
    legacyEncryption: options.encryption,
  });
  const markerPath = resolveOwnedPath(rootPath, RENDERER_PERSISTENCE_MARKER);
  function readHydratedStateSync(): RendererHydratedState {
    const marker = readMarker(markerPath);
    return {
      migrationComplete: marker !== null,
      settings: settings.read(),
      ...readRendererAuxiliaryState(options.database),
      indexedDbMigrationDone: marker?.indexedDbMigrationDone === true,
    };
  }
  return {
    async migrate(input) {
      if (readMarker(markerPath))
        return {
          status: "already-complete",
          redactLegacyKeys: REDACT_LEGACY_KEYS,
        };
      assertSnapshotSize(input);
      const previous = readRendererAuxiliaryState(options.database);
      const auxiliary = {
        marketplaceSources: {
          skill:
            input.skillStore === undefined
              ? previous.marketplaceSources.skill
              : parseSources(input.skillStore),
          mcp:
            input.mcpStore === undefined
              ? previous.marketplaceSources.mcp
              : parseSources(input.mcpStore),
          plugin:
            input.pluginStore === undefined
              ? previous.marketplaceSources.plugin
              : parseSources(input.pluginStore),
        },
        recoveryPaths:
          input.recoveryPaths === undefined
            ? previous.recoveryPaths
            : parseRecoveryPaths(input.recoveryPaths),
        selfHostedDeviceId:
          input.selfHostedDeviceId === undefined
            ? previous.selfHostedDeviceId
            : normalizeDeviceId(input.selfHostedDeviceId),
      };
      const raw = parsePersistedState(input.settings);
      const agents = [
        ...AGENT_SETTING_KEYS,
        ...RETIRED_AGENT_SETTING_KEYS,
      ].some((key) => key in raw)
        ? convertAgentSettingsV1(raw)
        : null;
      const next = initialSettings(settings.read(), input);
      for (const key of RETIRED_AGENT_SETTING_KEYS) delete next[key];
      const marker: RendererPersistenceMarkerDocument = {
        kind: "prompthub-renderer-persistence-migration",
        version: 1,
        state: "complete",
        completedAt: (options.now?.() ?? new Date()).toISOString(),
        indexedDbMigrationDone: input.indexedDbMigrationDone === "1",
      };
      settings.replaceRendererSettings(next, {
        entries: [
          settingsJsonEntry(rootPath, RENDERER_PERSISTENCE_MARKER, marker),
        ],
        commit: () => {
          writeRendererAuxiliaryState(options.database, auxiliary);
          if (agents)
            new AgentSettingsRepository(options.database).patch(agents);
        },
      });
      return { status: "migrated", redactLegacyKeys: REDACT_LEGACY_KEYS };
    },
    async readHydratedState() {
      return readHydratedStateSync();
    },
    readHydratedStateSync,
    async replaceSettings(input) {
      settings.replaceRendererSettings(input);
    },
    async patchSettings(input) {
      settings.patchSettings(input);
    },
    async replaceMarketplaceSources(domain, sources) {
      const current = readRendererAuxiliaryState(options.database);
      writeRendererAuxiliaryState(options.database, {
        ...current,
        marketplaceSources: {
          ...current.marketplaceSources,
          [domain]: sources,
        },
      });
    },
    async replaceRecoveryPaths(paths) {
      writeRendererAuxiliaryState(options.database, {
        ...readRendererAuxiliaryState(options.database),
        recoveryPaths: paths,
      });
    },
    async getOrCreateSelfHostedDeviceId() {
      const current = readRendererAuxiliaryState(options.database);
      if (current.selfHostedDeviceId) return current.selfHostedDeviceId;
      const deviceId = `desktop-${crypto.randomUUID()}`;
      writeRendererAuxiliaryState(options.database, {
        ...current,
        selfHostedDeviceId: deviceId,
      });
      return deviceId;
    },
    async isIndexedDbMigrationDone() {
      const marker = readMarker(markerPath);
      return (
        marker?.indexedDbMigrationDone === true &&
        marker.indexedDbVerificationVersion === 1
      );
    },
    async markIndexedDbMigrationDone() {
      const marker = readMarker(markerPath);
      if (!marker) throw new Error("RENDERER_PERSISTENCE_MIGRATION_INCOMPLETE");
      if (
        marker.indexedDbMigrationDone &&
        marker.indexedDbVerificationVersion === 1
      )
        return;
      writeAtomicJson(markerPath, {
        ...marker,
        indexedDbMigrationDone: true,
        indexedDbVerificationVersion: 1,
      });
      const verified = readMarker(markerPath);
      if (
        !verified?.indexedDbMigrationDone ||
        verified.indexedDbVerificationVersion !== 1
      )
        throw new Error("INDEXEDDB_MIGRATION_MARKER_VERIFY_FAILED");
    },
  };
}

function readMarker(
  filePath: string,
): RendererPersistenceMarkerDocument | null {
  if (!fs.existsSync(filePath)) return null;
  if (!fs.lstatSync(filePath).isFile())
    throw new Error("Invalid renderer migration marker file");
  const value = asRecord(
    parseJson(fs.readFileSync(filePath, "utf8"), "migration marker"),
  );
  if (
    value.kind !== "prompthub-renderer-persistence-migration" ||
    value.version !== 1 ||
    value.state !== "complete" ||
    typeof value.completedAt !== "string" ||
    typeof value.indexedDbMigrationDone !== "boolean"
  ) {
    throw new Error("Invalid renderer persistence migration marker");
  }
  return value as unknown as RendererPersistenceMarkerDocument;
}

export function readRendererPersistenceMigrationMarker(
  rootPath: string,
): RendererPersistenceMarkerDocument | null {
  return readMarker(
    resolveOwnedPath(path.resolve(rootPath), RENDERER_PERSISTENCE_MARKER),
  );
}

function writeAtomicJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    fs.renameSync(temporaryPath, filePath);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}

export function resolveOwnedPath(
  rootPath: string,
  relativePath: string,
): string {
  const target = path.resolve(rootPath, relativePath);
  const relative = path.relative(path.resolve(rootPath), target);
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Renderer persistence path escapes root: ${relativePath}`);
  }
  assertStoragePathComponentsSafe(rootPath, target);
  return target;
}

function assertSnapshotSize(input: RendererPersistenceMigrationInput): void {
  let serialized: string;
  try {
    serialized = JSON.stringify(input);
  } catch {
    throw new Error("Invalid renderer persistence snapshot");
  }
  if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES) {
    throw new Error("Renderer persistence snapshot exceeds byte limit");
  }
}

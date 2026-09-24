import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  APP_SETTING_KEYS,
  FLAT_SECRET_FIELDS,
  PROVIDER_SETTING_KEYS,
  REDACT_LEGACY_KEYS,
  SYNC_SETTING_KEYS,
} from "./renderer-persistence-policy";
import {
  createAgentDeviceConfigDocument,
  parseAgentDeviceConfigDocument,
  type AgentDeviceConfigDocument,
} from "./agent-resource-schema";
import { deriveLocalResourceDeviceId } from "./storage-root-identity";

export const RENDERER_PERSISTENCE_VERSION = 1;
export const RENDERER_PERSISTENCE_MARKER =
  "data/operations/migrations/renderer-persistence-v1.json";

const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
const MAX_SOURCES_PER_DOMAIN = 512;
const MAX_RECOVERY_PATHS = 128;
const MAX_TEXT_LENGTH = 4096;

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

export interface MarketplaceSourceRecord {
  id: string;
  name: string;
  type: "marketplace-json" | "git-repo" | "local-dir";
  url: string;
  branch?: string;
  directory?: string;
  enabled: boolean;
  order: number;
  createdAt: number;
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

interface CanonicalDocument {
  kind: string;
  version: 1;
  updatedAt: string;
  [key: string]: unknown;
}

interface SecretVaultDocument {
  kind: "prompthub-device-secret-vault";
  version: 1;
  updatedAt: string;
  secrets: Record<string, string>;
}

interface CanonicalRendererState {
  app: CanonicalDocument;
  providers: CanonicalDocument;
  legacyAIConfig: CanonicalDocument;
  syncProviders: CanonicalDocument;
  marketplaceSources: CanonicalDocument;
  devices: CanonicalDocument;
  agents: AgentDeviceConfigDocument;
  recovery: CanonicalDocument;
  vault: SecretVaultDocument;
  marker: RendererPersistenceMarkerDocument;
}

export function createRendererPersistenceStore(options: {
  rootPath: string;
  encryption: RendererPersistenceEncryption;
  now?: () => Date;
  failPublicationAt?: string;
}): RendererPersistenceStore {
  const rootPath = path.resolve(options.rootPath);
  const localResourceDeviceId = deriveLocalResourceDeviceId(rootPath);
  const markerPath = resolveOwnedPath(rootPath, RENDERER_PERSISTENCE_MARKER);
  const now = () => (options.now ?? (() => new Date()))().toISOString();

  function readHydratedStateSync(): RendererHydratedState {
    const app = readOptionalDocument(rootPath, "config/app.json");
    const providers = readOptionalDocument(rootPath, "config/providers.json");
    const sync = readOptionalDocument(rootPath, "config/sync-providers.json");
    const marketplace = readOptionalDocument(
      rootPath,
      "config/marketplace-sources.json",
    );
    const devices = readOptionalDocument(
      rootPath,
      "config/devices/renderer.json",
    );
    const selfHostedDeviceId =
      typeof devices?.selfHostedDeviceId === "string"
        ? devices.selfHostedDeviceId
        : null;
    const agents = readOptionalAgentDeviceDocument(rootPath);
    const recovery = readOptionalDocument(
      rootPath,
      "config/recovery-paths.json",
    );
    const marker = readMarker(markerPath);
    const secrets = readVault(rootPath, options.encryption);
    const settings = {
      ...asRecord(app?.settings),
      ...asRecord(sync?.settings),
      ...asRecord(providers?.settings),
      ...(agents
        ? {
            builtinAgentOverrides: agents.builtinAgentOverrides,
            customAgents: agents.customAgents,
            disabledPlatformIds: agents.disabledPlatformIds,
            agentIdentityPreferences: agents.agentIdentityPreferences,
          }
        : {}),
    };
    hydrateFlatSecrets(settings, app, sync, providers, secrets);
    hydrateProviderSecrets(settings, providers, secrets);
    hydrateProxySecrets(settings, app, secrets);

    return {
      migrationComplete: marker !== null,
      settings,
      marketplaceSources: {
        skill: readSourceDomain(marketplace, "skill"),
        mcp: readSourceDomain(marketplace, "mcp"),
        plugin: readSourceDomain(marketplace, "plugin"),
      },
      recoveryPaths: readStringArray(recovery?.paths),
      selfHostedDeviceId,
      indexedDbMigrationDone: marker?.indexedDbMigrationDone === true,
    };
  }

  return {
    async migrate(input) {
      if (fs.existsSync(markerPath)) {
        readMarker(markerPath);
        return {
          status: "already-complete",
          redactLegacyKeys: REDACT_LEGACY_KEYS,
        };
      }
      assertSnapshotSize(input);
      const completedAt = now();
      const canonical = buildCanonicalState(
        input,
        completedAt,
        options.encryption,
        localResourceDeviceId,
      );
      publishCanonicalState(rootPath, canonical, options.failPublicationAt);
      readHydratedStateSync();
      return {
        status: "migrated",
        redactLegacyKeys: REDACT_LEGACY_KEYS,
      };
    },

    async readHydratedState() {
      return readHydratedStateSync();
    },
    readHydratedStateSync,

    async replaceSettings(settings) {
      const hydrated = readHydratedStateSync();
      const canonical = buildCanonicalState(
        createMigrationInput({ ...hydrated, settings }),
        now(),
        options.encryption,
        localResourceDeviceId,
      );
      publishCanonicalEntries(
        rootPath,
        [
          ["config/app.json", canonical.app],
          ["config/providers.json", canonical.providers],
          ["config/ai-models.json", canonical.legacyAIConfig],
          ["config/sync-providers.json", canonical.syncProviders],
          ["config/devices/agents.json", canonical.agents],
          ["secrets/vault.enc", canonical.vault],
        ],
        options.failPublicationAt,
      );
      readHydratedStateSync();
    },

    async replaceMarketplaceSources(domain, sources) {
      const hydrated = readHydratedStateSync();
      const canonical = buildCanonicalState(
        createMigrationInput({
          ...hydrated,
          marketplaceSources: {
            ...hydrated.marketplaceSources,
            [domain]: sources,
          },
        }),
        now(),
        options.encryption,
        localResourceDeviceId,
      );
      publishCanonicalEntries(
        rootPath,
        [["config/marketplace-sources.json", canonical.marketplaceSources]],
        options.failPublicationAt,
      );
      readHydratedStateSync();
    },

    async replaceRecoveryPaths(paths) {
      const hydrated = readHydratedStateSync();
      const canonical = buildCanonicalState(
        createMigrationInput({ ...hydrated, recoveryPaths: paths }),
        now(),
        options.encryption,
        localResourceDeviceId,
      );
      publishCanonicalEntries(
        rootPath,
        [["config/recovery-paths.json", canonical.recovery]],
        options.failPublicationAt,
      );
      readHydratedStateSync();
    },

    async getOrCreateSelfHostedDeviceId() {
      const hydrated = readHydratedStateSync();
      if (hydrated.selfHostedDeviceId) return hydrated.selfHostedDeviceId;
      const deviceId = `desktop-${crypto.randomUUID()}`;
      const canonical = buildCanonicalState(
        createMigrationInput({ ...hydrated, selfHostedDeviceId: deviceId }),
        now(),
        options.encryption,
        localResourceDeviceId,
      );
      publishCanonicalEntries(
        rootPath,
        [["config/devices/renderer.json", canonical.devices]],
        options.failPublicationAt,
      );
      return deviceId;
    },

    async isIndexedDbMigrationDone() {
      const marker = readMarker(markerPath);
      return marker?.indexedDbMigrationDone === true && marker.indexedDbVerificationVersion === 1;
    },

    async markIndexedDbMigrationDone() {
      const marker = readMarker(markerPath);
      if (!marker) {
        throw new Error("RENDERER_PERSISTENCE_MIGRATION_INCOMPLETE");
      }
      if (marker.indexedDbMigrationDone && marker.indexedDbVerificationVersion === 1) return;
      writeAtomicJson(markerPath, {
        ...marker,
        indexedDbMigrationDone: true,
        indexedDbVerificationVersion: 1,
      });
      const verified = readMarker(markerPath);
      if (!verified?.indexedDbMigrationDone || verified.indexedDbVerificationVersion !== 1) {
        throw new Error("INDEXEDDB_MIGRATION_MARKER_VERIFY_FAILED");
      }
    },
  };
}

function buildCanonicalState(
  input: RendererPersistenceMigrationInput,
  updatedAt: string,
  encryption: RendererPersistenceEncryption,
  localResourceDeviceId: string,
): CanonicalRendererState {
  const settings = parsePersistedState(input.settings);
  const selfHostedDeviceId = normalizeDeviceId(input.selfHostedDeviceId);
  const legacyAIConfig = asRecord(input.legacyAIConfig);
  const legacyProviders = Array.isArray(legacyAIConfig.providers)
    ? legacyAIConfig.providers
    : [];
  const legacyModels = Array.isArray(legacyAIConfig.models)
    ? legacyAIConfig.models
    : [];
  const legacyModelRouteDefaults = asRecord(legacyAIConfig.modelRouteDefaults);
  if (legacyProviders.length > 0 || settings.aiProviders === undefined) {
    settings.aiProviders = legacyProviders;
  }
  if (legacyModels.length > 0 || settings.aiModels === undefined) {
    settings.aiModels = legacyModels;
  }
  if (
    Object.keys(legacyModelRouteDefaults).length > 0 ||
    settings.modelRouteDefaults === undefined
  ) {
    settings.modelRouteDefaults = legacyModelRouteDefaults;
  }
  const secrets: Record<string, string> = {};
  const appSettings = pickSettings(settings, APP_SETTING_KEYS);
  const syncSettings = pickSettings(settings, SYNC_SETTING_KEYS);
  const providerSettings = pickSettings(settings, PROVIDER_SETTING_KEYS);
  const appSecretRefs: Record<string, string> = {};
  const syncSecretRefs: Record<string, string> = {};
  const providerSecretRefs: Record<string, string> = {};

  for (const field of FLAT_SECRET_FIELDS) {
    const value = settings[field];
    if (typeof value !== "string" || value.length === 0) continue;
    const ref = `renderer:${field}`;
    secrets[ref] = requireBoundedText(value, field, 64 * 1024);
    if (field === "githubToken") appSecretRefs[field] = ref;
    else if (field === "aiApiKey") providerSecretRefs[field] = ref;
    else syncSecretRefs[field] = ref;
  }

  const providers = sanitizeProviderEntries(
    settings.aiProviders,
    "provider",
    secrets,
  );
  const models = sanitizeProviderEntries(settings.aiModels, "model", secrets);
  const proxy = sanitizeProxy(settings.networkProxy, secrets);
  if (proxy) appSettings.networkProxy = proxy;

  const vaultSecrets = encryptSecrets(secrets, encryption);
  const indexedDbMigrationDone = input.indexedDbMigrationDone === "1";
  return {
    app: {
      kind: "prompthub-app-config",
      version: 1,
      updatedAt,
      settings: appSettings,
      secretRefs: appSecretRefs,
    },
    providers: {
      kind: "prompthub-provider-config",
      version: 1,
      updatedAt,
      settings: providerSettings,
      providers,
      models,
      secretRefs: providerSecretRefs,
    },
    legacyAIConfig: {
      kind: "prompthub-ai-config",
      version: 1,
      updatedAt,
      providers: redactLegacyAIEntries(providers),
      models: redactLegacyAIEntries(models),
      modelRouteDefaults: providerSettings.modelRouteDefaults ?? {},
    },
    syncProviders: {
      kind: "prompthub-sync-provider-config",
      version: 1,
      updatedAt,
      settings: syncSettings,
      secretRefs: syncSecretRefs,
    },
    marketplaceSources: {
      kind: "prompthub-marketplace-sources",
      version: 1,
      updatedAt,
      sources: {
        skill: parseSources(input.skillStore),
        mcp: parseSources(input.mcpStore),
        plugin: parseSources(input.pluginStore),
      },
    },
    devices: {
      kind: "prompthub-renderer-devices",
      version: 1,
      updatedAt,
      selfHostedDeviceId,
    },
    agents: createAgentDeviceConfigDocument({
      deviceId: localResourceDeviceId,
      updatedAt,
      builtinAgentOverrides: asRecord(
        settings.builtinAgentOverrides,
      ) as AgentDeviceConfigDocument["builtinAgentOverrides"],
      customAgents: Array.isArray(settings.customAgents)
        ? (settings.customAgents as AgentDeviceConfigDocument["customAgents"])
        : [],
      disabledPlatformIds: Array.isArray(settings.disabledPlatformIds)
        ? (settings.disabledPlatformIds as string[])
        : [],
      agentIdentityPreferences: asRecord(
        settings.agentIdentityPreferences,
      ) as AgentDeviceConfigDocument["agentIdentityPreferences"],
    }),
    recovery: {
      kind: "prompthub-recovery-path-registry",
      version: 1,
      updatedAt,
      paths: parseRecoveryPaths(input.recoveryPaths),
    },
    vault: {
      kind: "prompthub-device-secret-vault",
      version: 1,
      updatedAt,
      secrets: vaultSecrets,
    },
    marker: {
      kind: "prompthub-renderer-persistence-migration",
      version: 1,
      state: "complete",
      completedAt: updatedAt,
      indexedDbMigrationDone,
    },
  };
}

function publishCanonicalState(
  rootPath: string,
  state: CanonicalRendererState,
  failPublicationAt?: string,
): void {
  publishCanonicalEntries(
    rootPath,
    [
      ["config/app.json", state.app],
      ["config/providers.json", state.providers],
      ["config/ai-models.json", state.legacyAIConfig],
      ["config/sync-providers.json", state.syncProviders],
      ["config/marketplace-sources.json", state.marketplaceSources],
      ["config/devices/renderer.json", state.devices],
      ["config/devices/agents.json", state.agents],
      ["config/recovery-paths.json", state.recovery],
      ["secrets/vault.enc", state.vault],
      [RENDERER_PERSISTENCE_MARKER, state.marker],
    ],
    failPublicationAt,
  );
}

function publishCanonicalEntries(
  rootPath: string,
  entries: Array<[string, unknown]>,
  failPublicationAt?: string,
): void {
  const operationsPath = resolveOwnedPath(
    rootPath,
    "data/operations/migrations",
  );
  fs.mkdirSync(operationsPath, { recursive: true });
  const stagePath = path.join(
    operationsPath,
    `.renderer-persistence-v1-${crypto.randomUUID()}`,
  );
  const backupPath = path.join(stagePath, ".rollback");
  const published: Array<{ relativePath: string; hadPrevious: boolean }> = [];
  fs.mkdirSync(stagePath, { recursive: false });
  try {
    for (const [relativePath, value] of entries) {
      writeStagedJson(stagePath, relativePath, value);
    }
    for (const [relativePath] of entries) {
      if (relativePath === failPublicationAt) {
        throw new Error(
          `Injected renderer persistence publication failure: ${relativePath}`,
        );
      }
      const targetPath = resolveOwnedPath(rootPath, relativePath);
      const stagedPath = resolveOwnedPath(stagePath, relativePath);
      assertSafeTarget(rootPath, targetPath);
      const hadPrevious = fs.existsSync(targetPath);
      if (hadPrevious) {
        const rollbackFile = resolveOwnedPath(backupPath, relativePath);
        fs.mkdirSync(path.dirname(rollbackFile), { recursive: true });
        fs.copyFileSync(targetPath, rollbackFile);
      }
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.renameSync(stagedPath, targetPath);
      published.push({ relativePath, hadPrevious });
    }
  } catch (error) {
    for (const entry of published.reverse()) {
      const targetPath = resolveOwnedPath(rootPath, entry.relativePath);
      if (entry.hadPrevious) {
        const rollbackFile = resolveOwnedPath(backupPath, entry.relativePath);
        fs.copyFileSync(rollbackFile, targetPath);
      } else {
        fs.rmSync(targetPath, { force: true });
      }
    }
    throw error;
  } finally {
    fs.rmSync(stagePath, { recursive: true, force: true });
  }
}

function createMigrationInput(
  state: RendererHydratedState & {
    settings?: Record<string, unknown>;
    recoveryPaths?: string[];
    selfHostedDeviceId?: string | null;
  },
): RendererPersistenceMigrationInput {
  return {
    settings: { state: state.settings },
    skillStore: {
      state: { customStoreSources: state.marketplaceSources.skill },
    },
    mcpStore: { state: { customStoreSources: state.marketplaceSources.mcp } },
    pluginStore: {
      state: { customStoreSources: state.marketplaceSources.plugin },
    },
    selfHostedDeviceId: state.selfHostedDeviceId,
    recoveryPaths: state.recoveryPaths,
    indexedDbMigrationDone: state.indexedDbMigrationDone ? "1" : undefined,
  };
}

function parsePersistedState(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null || value === "") return {};
  const parsed =
    typeof value === "string" ? parseJson(value, "settings") : value;
  const record = asRecord(parsed);
  return asRecord(record.state ?? record);
}

function parseSources(value: unknown): MarketplaceSourceRecord[] {
  const state = parsePersistedState(value);
  const raw = state.customStoreSources;
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_SOURCES_PER_DOMAIN) {
    throw new Error("Invalid renderer marketplace source collection");
  }
  const seen = new Set<string>();
  return raw.map((entry, index) => {
    const source = asRecord(entry);
    const id = requireSafeId(source.id, "source id");
    if (seen.has(id))
      throw new Error(`Duplicate renderer marketplace source: ${id}`);
    seen.add(id);
    const type = source.type;
    if (
      type !== "marketplace-json" &&
      type !== "git-repo" &&
      type !== "local-dir"
    ) {
      throw new Error(
        `Invalid renderer marketplace source type: ${String(type)}`,
      );
    }
    const url = requireBoundedText(source.url, "source url", MAX_TEXT_LENGTH);
    validateSourceLocation(type, url);
    return {
      id,
      name: requireBoundedText(source.name, "source name", 256),
      type,
      url,
      branch: optionalBoundedText(source.branch, "source branch", 256),
      directory: optionalSafeRelativePath(source.directory),
      enabled: source.enabled !== false,
      order: normalizeInteger(source.order, index, 0, MAX_SOURCES_PER_DOMAIN),
      createdAt: normalizeInteger(
        source.createdAt,
        0,
        0,
        Number.MAX_SAFE_INTEGER,
      ),
    };
  });
}

function sanitizeProviderEntries(
  value: unknown,
  kind: "provider" | "model",
  secrets: Record<string, string>,
): Record<string, unknown>[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 512) {
    throw new Error(`Invalid AI ${kind} collection`);
  }
  return value.map((entry) => {
    const record = { ...asRecord(entry) };
    const id = requireSafeId(record.id, `${kind} id`);
    const apiKey = record.apiKey;
    delete record.apiKey;
    if (typeof apiKey === "string" && apiKey.length > 0) {
      const ref = `renderer:ai-${kind}:${id}:api-key`;
      secrets[ref] = requireBoundedText(apiKey, `${kind} api key`, 64 * 1024);
      record.apiKeyRef = ref;
    }
    return requireJsonRecord(record, `AI ${kind}`);
  });
}

function redactLegacyAIEntries(
  entries: Record<string, unknown>[],
): Record<string, unknown>[] {
  return entries.map((entry) => {
    const redacted: Record<string, unknown> = { ...entry, apiKey: "" };
    delete redacted.apiKeyRef;
    return redacted;
  });
}

function sanitizeProxy(
  value: unknown,
  secrets: Record<string, string>,
): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  const proxy = { ...asRecord(value) };
  for (const field of ["username", "password"] as const) {
    const secret = proxy[field];
    delete proxy[field];
    if (typeof secret === "string" && secret.length > 0) {
      const ref = `renderer:networkProxy:${field}`;
      secrets[ref] = requireBoundedText(secret, `proxy ${field}`, 64 * 1024);
      proxy[`${field}Ref`] = ref;
    }
  }
  return requireJsonRecord(proxy, "network proxy");
}

function encryptSecrets(
  secrets: Record<string, string>,
  encryption: RendererPersistenceEncryption,
): Record<string, string> {
  if (Object.keys(secrets).length > 0 && !encryption.isEncryptionAvailable()) {
    throw new Error("RENDERER_SECRET_VAULT_UNAVAILABLE");
  }
  return Object.fromEntries(
    Object.entries(secrets)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([ref, value]) => [
        ref,
        encryption.encryptString(value).toString("base64"),
      ]),
  );
}

function readVault(
  rootPath: string,
  encryption: RendererPersistenceEncryption,
): Record<string, string> {
  const document = readOptionalDocument(rootPath, "secrets/vault.enc");
  if (!document) return {};
  if (document.kind !== "prompthub-device-secret-vault") {
    throw new Error("Invalid renderer secret vault");
  }
  const encrypted = asRecord(document.secrets);
  if (
    Object.keys(encrypted).length > 0 &&
    !encryption.isEncryptionAvailable()
  ) {
    throw new Error("RENDERER_SECRET_VAULT_UNAVAILABLE");
  }
  return Object.fromEntries(
    Object.entries(encrypted).map(([ref, value]) => {
      if (typeof value !== "string")
        throw new Error("Invalid renderer secret vault");
      return [ref, encryption.decryptString(Buffer.from(value, "base64"))];
    }),
  );
}

function hydrateFlatSecrets(
  settings: Record<string, unknown>,
  app: Record<string, unknown> | null,
  sync: Record<string, unknown> | null,
  providers: Record<string, unknown> | null,
  secrets: Record<string, string>,
): void {
  for (const document of [app, sync, providers]) {
    const refs = asRecord(document?.secretRefs);
    for (const [field, ref] of Object.entries(refs)) {
      if (typeof ref !== "string")
        throw new Error("Invalid renderer secret reference");
      const value = secrets[ref];
      if (value === undefined)
        throw new Error(`Missing renderer secret: ${ref}`);
      settings[field] = value;
    }
  }
}

function hydrateProviderSecrets(
  settings: Record<string, unknown>,
  providers: Record<string, unknown> | null,
  secrets: Record<string, string>,
): void {
  for (const [documentKey, settingKey] of [
    ["providers", "aiProviders"],
    ["models", "aiModels"],
  ] as const) {
    const entries = providers?.[documentKey];
    if (!Array.isArray(entries)) {
      settings[settingKey] = [];
      continue;
    }
    settings[settingKey] = entries.map((entry) => {
      const record = { ...asRecord(entry) };
      const ref = record.apiKeyRef;
      delete record.apiKeyRef;
      if (typeof ref === "string") {
        if (!(ref in secrets))
          throw new Error(`Missing renderer secret: ${ref}`);
        record.apiKey = secrets[ref];
      }
      return record;
    });
  }
}

function hydrateProxySecrets(
  settings: Record<string, unknown>,
  app: Record<string, unknown> | null,
  secrets: Record<string, string>,
): void {
  const storedProxy = asRecord(asRecord(app?.settings).networkProxy);
  if (Object.keys(storedProxy).length === 0) return;
  const proxy = { ...storedProxy };
  for (const field of ["username", "password"] as const) {
    const refKey = `${field}Ref`;
    const ref = proxy[refKey];
    delete proxy[refKey];
    if (typeof ref === "string") {
      if (!(ref in secrets)) throw new Error(`Missing renderer secret: ${ref}`);
      proxy[field] = secrets[ref];
    }
  }
  settings.networkProxy = proxy;
}

function pickSettings(
  settings: Record<string, unknown>,
  allowlist: Set<string>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(settings)
      .filter(([key, value]) => allowlist.has(key) && value !== undefined)
      .map(([key, value]) => [key, requireJsonValue(value, `setting ${key}`)]),
  );
}

function parseRecoveryPaths(value: unknown): string[] {
  if (value === undefined || value === null || value === "") return [];
  const parsed =
    typeof value === "string" ? parseJson(value, "recovery paths") : value;
  if (!Array.isArray(parsed) || parsed.length > MAX_RECOVERY_PATHS) {
    throw new Error("Invalid renderer recovery path registry");
  }
  return Array.from(
    new Set(
      parsed.map((entry) => {
        const candidate = requireBoundedText(
          entry,
          "recovery path",
          MAX_TEXT_LENGTH,
        );
        if (!path.isAbsolute(candidate) || candidate.includes("\0")) {
          throw new Error(`Invalid renderer recovery path: ${candidate}`);
        }
        return path.normalize(candidate);
      }),
    ),
  );
}

function normalizeDeviceId(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  return requireSafeId(value, "device id");
}

function validateSourceLocation(
  type: MarketplaceSourceRecord["type"],
  value: string,
): void {
  if (type === "local-dir") {
    if (!path.isAbsolute(value) || value.includes("\0")) {
      throw new Error("Invalid local marketplace source path");
    }
    return;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid marketplace source URL");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error("Unsafe marketplace source URL");
  }
}

function optionalSafeRelativePath(value: unknown): string | undefined {
  const text = optionalBoundedText(value, "source directory", MAX_TEXT_LENGTH);
  if (!text) return undefined;
  const normalized = text.replace(/\\/g, "/");
  if (
    normalized.startsWith("/") ||
    normalized
      .split("/")
      .some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("Unsafe marketplace source directory");
  }
  return normalized;
}

function readSourceDomain(
  document: Record<string, unknown> | null,
  domain: "skill" | "mcp" | "plugin",
): MarketplaceSourceRecord[] {
  const value = asRecord(document?.sources)[domain];
  return Array.isArray(value) ? (value as MarketplaceSourceRecord[]) : [];
}

function readOptionalDocument(
  rootPath: string,
  relativePath: string,
): Record<string, unknown> | null {
  const filePath = resolveOwnedPath(rootPath, relativePath);
  if (!fs.existsSync(filePath)) return null;
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Invalid renderer persistence file: ${relativePath}`);
  }
  const document = asRecord(
    parseJson(fs.readFileSync(filePath, "utf8"), relativePath),
  );
  if (document.version !== RENDERER_PERSISTENCE_VERSION) {
    throw new Error(
      `Unsupported renderer persistence version: ${relativePath}`,
    );
  }
  return document;
}

function readOptionalAgentDeviceDocument(
  rootPath: string,
): AgentDeviceConfigDocument | null {
  const relativePath = "config/devices/agents.json";
  const filePath = resolveOwnedPath(rootPath, relativePath);
  if (!fs.existsSync(filePath)) return null;
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Invalid renderer persistence file: ${relativePath}`);
  }
  const content = fs.readFileSync(filePath, "utf8");
  const parsed = asRecord(parseJson(content, relativePath));
  if (typeof parsed.deviceId !== "string") {
    throw new Error(`Invalid renderer persistence file: ${relativePath}`);
  }
  return parseAgentDeviceConfigDocument(content, {
    expectedDeviceId: parsed.deviceId,
  });
}

function readMarker(
  filePath: string,
): RendererPersistenceMarkerDocument | null {
  if (!fs.existsSync(filePath)) return null;
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

function writeStagedJson(
  stagePath: string,
  relativePath: string,
  value: unknown,
): void {
  const filePath = resolveOwnedPath(stagePath, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const descriptor = fs.openSync(filePath, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
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

function assertSafeTarget(rootPath: string, targetPath: string): void {
  const relative = path.relative(rootPath, targetPath);
  let current = rootPath;
  for (const segment of relative.split(path.sep).slice(0, -1)) {
    current = path.join(current, segment);
    if (!fs.existsSync(current)) continue;
    const stat = fs.lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error(`Unsafe renderer persistence target: ${current}`);
    }
  }
  if (fs.existsSync(targetPath)) {
    const stat = fs.lstatSync(targetPath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`Unsafe renderer persistence target: ${targetPath}`);
    }
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

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`Invalid renderer ${label}`);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requireJsonRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  const record = asRecord(value);
  requireJsonValue(record, label);
  return record;
}

function requireJsonValue(value: unknown, label: string): unknown {
  try {
    const serialized = JSON.stringify(value);
    if (
      serialized === undefined ||
      Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES
    ) {
      throw new Error();
    }
    return JSON.parse(serialized);
  } catch {
    throw new Error(`Invalid renderer ${label}`);
  }
}

function requireSafeId(value: unknown, label: string): string {
  const text = requireBoundedText(value, label, 256);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(text)) {
    throw new Error(`Invalid renderer ${label}`);
  }
  return text;
}

function requireBoundedText(
  value: unknown,
  label: string,
  maxLength: number,
): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > maxLength ||
    /[\u0000-\u001f]/.test(value)
  ) {
    throw new Error(`Invalid renderer ${label}`);
  }
  return value.trim();
}

function optionalBoundedText(
  value: unknown,
  label: string,
  maxLength: number,
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requireBoundedText(value, label, maxLength);
}

function normalizeInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : fallback;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

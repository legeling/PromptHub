import type {
  MarketplaceSourceRecord,
  RendererHydratedState,
  RendererPersistenceMigrationInput,
  RendererPersistenceMigrationResult,
} from "@prompthub/core";

import { useMcpStore } from "../stores/mcp.store";
import { usePluginStore } from "../stores/plugin.store";
import { useSettingsStore } from "../stores/settings.store";
import { useSkillStore } from "../stores/skill.store";

const LEGACY_KEYS = {
  settings: "prompthub-settings",
  legacySettings: "settings-storage",
  skillStore: "skill-store",
  mcpStore: "mcp-store",
  pluginStore: "plugin-store",
  selfHostedDeviceId: "prompthub-self-hosted-device-id",
  recoveryPaths: "prompthub-manual-recovery-paths",
  indexedDbMigrationDone: "prompthub:idb-migration-done",
} as const;

let initialized = false;
let subscriptions: Array<() => void> = [];

function readStorageValue(storage: Storage, key: string): string | undefined {
  const value = storage.getItem(key);
  return value === null ? undefined : value;
}

export function collectLegacyRendererPersistence(
  storage: Storage,
): RendererPersistenceMigrationInput {
  return {
    settings:
      readStorageValue(storage, LEGACY_KEYS.settings) ??
      readStorageValue(storage, LEGACY_KEYS.legacySettings),
    skillStore: readStorageValue(storage, LEGACY_KEYS.skillStore),
    mcpStore: readStorageValue(storage, LEGACY_KEYS.mcpStore),
    pluginStore: readStorageValue(storage, LEGACY_KEYS.pluginStore),
    selfHostedDeviceId: readStorageValue(
      storage,
      LEGACY_KEYS.selfHostedDeviceId,
    ),
    recoveryPaths: readStorageValue(storage, LEGACY_KEYS.recoveryPaths),
    indexedDbMigrationDone: readStorageValue(
      storage,
      LEGACY_KEYS.indexedDbMigrationDone,
    ),
  };
}

function redactLegacyRendererPersistence(
  storage: Storage,
  result: RendererPersistenceMigrationResult,
): void {
  for (const key of result.redactLegacyKeys) storage.removeItem(key);
}

function applyCanonicalSources(state: RendererHydratedState): void {
  useSkillStore.setState({
    customStoreSources: state.marketplaceSources.skill,
  });
  useMcpStore.setState({ customStoreSources: state.marketplaceSources.mcp });
  usePluginStore.setState({
    customStoreSources: state.marketplaceSources.plugin,
  });
}

function extractSettingsState(): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(useSettingsStore.getState()).filter(
      ([, value]) => typeof value !== "function",
    ),
  );
}

function subscribeCanonicalSettings(): () => void {
  const api = window.api.settings.rendererPersistence;
  let previous = JSON.stringify(extractSettingsState());
  let pending: Record<string, unknown> | null = null;
  let flushScheduled = false;
  const flush = () => {
    flushScheduled = false;
    const next = pending;
    pending = null;
    if (!next) return;
    void api.replaceSettings(next).catch((error: unknown) => {
      console.warn("Failed to persist canonical renderer settings:", error);
    });
  };
  return useSettingsStore.subscribe(() => {
    const next = extractSettingsState();
    const serialized = JSON.stringify(next);
    if (serialized === previous) return;
    previous = serialized;
    pending = next;
    if (!flushScheduled) {
      flushScheduled = true;
      queueMicrotask(flush);
    }
  });
}

function subscribeCanonicalSources(
  domain: "skill" | "mcp" | "plugin",
  read: () => MarketplaceSourceRecord[],
  subscribe: (listener: () => void) => () => void,
): () => void {
  const api = window.api.settings.rendererPersistence;
  let previous = JSON.stringify(read());
  return subscribe(() => {
    const sources = read();
    const serialized = JSON.stringify(sources);
    if (serialized === previous) return;
    previous = serialized;
    void api.replaceSources(domain, sources).catch((error: unknown) => {
      console.warn(`Failed to persist canonical ${domain} sources:`, error);
    });
  });
}

function normalizeCanonicalSources(
  sources: Array<{
    id: string;
    name?: string;
    type?: string;
    url?: string;
    branch?: string;
    directory?: string;
    enabled?: boolean;
    order?: number;
    createdAt?: number;
  }>,
): MarketplaceSourceRecord[] {
  return sources.flatMap((source, index) => {
    if (
      source.type !== "marketplace-json" &&
      source.type !== "git-repo" &&
      source.type !== "local-dir"
    ) {
      return [];
    }
    return [
      {
        id: source.id,
        name: source.name ?? source.id,
        type: source.type,
        url: source.url ?? "",
        branch: source.branch,
        directory: source.directory,
        enabled: source.enabled !== false,
        order: source.order ?? index,
        createdAt: source.createdAt ?? 0,
      },
    ];
  });
}

function startCanonicalPersistenceSubscriptions(): void {
  subscriptions = [
    subscribeCanonicalSettings(),
    subscribeCanonicalSources(
      "skill",
      () =>
        normalizeCanonicalSources(useSkillStore.getState().customStoreSources),
      useSkillStore.subscribe,
    ),
    subscribeCanonicalSources(
      "mcp",
      () =>
        normalizeCanonicalSources(useMcpStore.getState().customStoreSources),
      useMcpStore.subscribe,
    ),
    subscribeCanonicalSources(
      "plugin",
      () =>
        normalizeCanonicalSources(usePluginStore.getState().customStoreSources),
      usePluginStore.subscribe,
    ),
  ];
}

export async function migrateRendererPersistence(): Promise<void> {
  if (
    initialized ||
    typeof window === "undefined" ||
    window.__PROMPTHUB_WEB__
  ) {
    return;
  }
  const api = window.api?.settings?.rendererPersistence;
  if (!api) throw new Error("Required renderer persistence API is missing");
  const input = collectLegacyRendererPersistence(window.localStorage);
  const result = (await api.migrate(
    input,
  )) as RendererPersistenceMigrationResult;
  const canonical = (await api.get()) as RendererHydratedState;
  applyCanonicalSources(canonical);
  redactLegacyRendererPersistence(window.localStorage, result);
  startCanonicalPersistenceSubscriptions();
  initialized = true;
}

export function resetRendererPersistenceForTests(): void {
  for (const unsubscribe of subscriptions.splice(0)) unsubscribe();
  initialized = false;
}

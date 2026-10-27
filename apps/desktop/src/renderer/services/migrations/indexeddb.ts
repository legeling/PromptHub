import type {
  LegacyIndexedDbSnapshot,
  IndexedDbMigrationResponse,
} from "@prompthub/shared/types/indexeddb-migration";
import type { PromptWorkspaceResolution } from "@prompthub/shared/types/prompt-workspace-recovery";

export class IndexedDbRecoveryRequired extends Error {
  constructor() {
    super(
      "Historical IndexedDB contains conflicting records; review the recovery choices",
    );
    this.name = "IndexedDbRecoveryRequired";
  }
}

const LEGACY_DATABASE_NAME = "PromptHubDB";
// Frozen source schema used by the retired browser backend.
const LAST_INDEXEDDB_SCHEMA_VERSION = 1;
const SOURCE_STORES = ["prompts", "folders", "versions"] as const;

export interface IndexedDbMigrationResult {
  migrated: boolean;
  promptCount: number;
  folderCount: number;
  versionCount: number;
}

function openSource(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // No version is supplied: opening a historical source must never upgrade it.
    let rejected = false;
    const request = indexedDB.open(LEGACY_DATABASE_NAME);
    request.onupgradeneeded = () => {
      request.transaction?.abort();
      reject(new Error("Historical IndexedDB disappeared during migration"));
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      rejected = true;
      reject(new Error("Historical IndexedDB is blocked"));
    };
    request.onsuccess = () => {
      if (rejected || request.result.version > LAST_INDEXEDDB_SCHEMA_VERSION) {
        request.result.close();
        reject(new Error("Unsupported historical IndexedDB schema"));
      } else resolve(request.result);
    };
  });
}

function readSource(database: IDBDatabase): Promise<LegacyIndexedDbSnapshot> {
  return new Promise((resolve, reject) => {
    const stores = SOURCE_STORES.filter((name) =>
      Array.from(database.objectStoreNames).includes(name),
    );
    if (stores.length === 0) {
      reject(new Error("Unrecognized historical IndexedDB structure"));
      return;
    }
    const transaction = database.transaction(stores, "readonly");
    const snapshot: LegacyIndexedDbSnapshot = {
      prompts: [],
      folders: [],
      versions: [],
    };
    for (const store of stores) {
      const request = transaction.objectStore(store).getAll();
      request.onsuccess = () => {
        Reflect.set(snapshot, store, request.result);
      };
    }
    transaction.oncomplete = () => resolve(snapshot);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(
        transaction.error ?? new Error("Historical IndexedDB read aborted"),
      );
  });
}

function requireMigrationApi(): void {
  const api = window.api;
  const methods = {
    migrateIdbBatch: api?.prompt?.migrateIdbBatch,
    isIndexedDbMigrationDone:
      api?.settings?.rendererPersistence?.isIndexedDbMigrationDone,
    markIndexedDbMigrationDone:
      api?.settings?.rendererPersistence?.markIndexedDbMigrationDone,
  };
  for (const [name, method] of Object.entries(methods)) {
    if (typeof method !== "function")
      throw new Error(`Required migration API is missing: ${name}`);
  }
}

export async function migrateIndexedDbSource(
  resolution?: PromptWorkspaceResolution,
): Promise<IndexedDbMigrationResponse> {
  const database = await openSource();
  try {
    const source = await readSource(database);
    const result = await window.api.prompt.migrateIdbBatch({
      ...source,
      ...(resolution ? { resolution } : {}),
    });
    if (result.status === "completed")
      await window.api.settings.rendererPersistence.markIndexedDbMigrationDone();
    else if (result.status !== "conflict")
      throw new Error("Invalid IndexedDB migration response");
    return result;
  } finally {
    database.close();
  }
}

export async function migrateLegacyIndexedDbToMainProcess(): Promise<IndexedDbMigrationResult> {
  requireMigrationApi();
  const marker = window.api.settings.rendererPersistence;
  const empty = {
    migrated: false,
    promptCount: 0,
    folderCount: 0,
    versionCount: 0,
  };
  if (await marker.isIndexedDbMigrationDone()) return empty;
  const databases = await indexedDB.databases();
  if (!databases.some((database) => database.name === LEGACY_DATABASE_NAME)) {
    await marker.markIndexedDbMigrationDone();
    return empty;
  }
  const result = await migrateIndexedDbSource();
  if (result.status === "conflict") throw new IndexedDbRecoveryRequired();
  return {
    migrated: result.imported,
    promptCount: result.promptCount,
    folderCount: result.folderCount,
    versionCount: result.versionCount,
  };
}

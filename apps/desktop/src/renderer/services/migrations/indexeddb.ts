import type { Folder, Prompt, PromptVersion } from "@prompthub/shared/types";

const LEGACY_DATABASE_NAME = "PromptHubDB";
// Frozen source schema used by the retired browser backend.
const LAST_INDEXEDDB_SCHEMA_VERSION = 1;
const SOURCE_STORES = ["prompts", "folders", "versions"] as const;

interface LegacySnapshot {
  prompts: Prompt[];
  folders: Folder[];
  versions: PromptVersion[];
}

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

function readSource(database: IDBDatabase): Promise<LegacySnapshot> {
  return new Promise((resolve, reject) => {
    const stores = SOURCE_STORES.filter((name) =>
      Array.from(database.objectStoreNames).includes(name),
    );
    if (stores.length === 0) {
      reject(new Error("Unrecognized historical IndexedDB structure"));
      return;
    }
    const transaction = database.transaction(stores, "readonly");
    const snapshot: LegacySnapshot = { prompts: [], folders: [], versions: [] };
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

function validateSource(snapshot: LegacySnapshot): void {
  for (const name of SOURCE_STORES) {
    const ids = new Set<string>();
    for (const record of snapshot[name]) {
      if (
        !record ||
        typeof record.id !== "string" ||
        !record.id ||
        ids.has(record.id)
      ) {
        throw new Error(`Invalid or duplicate historical ${name} ID`);
      }
      ids.add(record.id);
    }
  }
  const promptIds = new Set(snapshot.prompts.map((prompt) => prompt.id));
  for (const version of snapshot.versions) {
    if (!promptIds.has(version.promptId))
      throw new Error("Historical version has no prompt");
  }
}

function sameValue(source: unknown, target: unknown): boolean {
  if (source === target || (source == null && target == null)) return true;
  if (Array.isArray(source)) {
    return (
      Array.isArray(target) &&
      source.length === target.length &&
      source.every((value, index) => sameValue(value, target[index]))
    );
  }
  if (
    source &&
    target &&
    typeof source === "object" &&
    typeof target === "object"
  ) {
    return Object.entries(source).every(([key, value]) =>
      sameValue(value, Reflect.get(target, key)),
    );
  }
  return false;
}

function containsSource(
  source: LegacySnapshot,
  target: LegacySnapshot,
): boolean {
  return SOURCE_STORES.every((store) => {
    const records = new Map<string, Prompt | Folder | PromptVersion>();
    for (const record of target[store]) records.set(record.id, record);
    return source[store].every((record) =>
      sameValue(record, records.get(record.id)),
    );
  });
}

async function readTarget(source: LegacySnapshot): Promise<LegacySnapshot> {
  const [prompts, folders] = await Promise.all([
    window.api.prompt.getAll(),
    window.api.folder.getAll(),
  ]);
  const versions: PromptVersion[] = [];
  for (const prompt of source.prompts) {
    versions.push(...(await window.api.version.getAll(prompt.id)));
  }
  return { prompts, folders, versions };
}

function requireMigrationApi(): void {
  const api = window.api;
  const methods = {
    migrateIdbBatch: api?.prompt?.migrateIdbBatch,
    getPrompts: api?.prompt?.getAll,
    getFolders: api?.folder?.getAll,
    getVersions: api?.version?.getAll,
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

async function convertSource(source: LegacySnapshot): Promise<boolean> {
  const target = await readTarget(source);
  if (containsSource(source, target)) return false;
  if (target.prompts.length || target.folders.length) {
    throw new Error(
      "Historical IndexedDB migration is incomplete or has a content conflict",
    );
  }
  const result = await window.api.prompt.migrateIdbBatch(source);
  if (!containsSource(source, await readTarget(source))) {
    throw new Error("Historical IndexedDB migration verification failed");
  }
  return result.imported;
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
  const database = await openSource();
  try {
    const source = await readSource(database);
    validateSource(source);
    const migrated = await convertSource(source);
    await marker.markIndexedDbMigrationDone();
    return {
      migrated,
      promptCount: source.prompts.length,
      folderCount: source.folders.length,
      versionCount: source.versions.length,
    };
  } finally {
    database.close();
  }
}

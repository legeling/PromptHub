import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrateLegacyIndexedDbToMainProcess } from "../../../src/renderer/services/migrations/indexeddb";

const prompt = {
  id: "p",
  title: "Original",
  userPrompt: "Saved content",
  version: 1,
};
const folder = { id: "f", name: "Folder", order: 0 };
const version = {
  id: "v",
  promptId: "p",
  version: 1,
  userPrompt: "Saved content",
};
const source = { prompts: [prompt], folders: [folder], versions: [version] };

function installSource(data = source) {
  const close = vi.fn();
  const transaction = vi.fn((names: string[], mode: string) => {
    expect(mode).toBe("readonly");
    const tx = {
      error: null,
      oncomplete: null as (() => void) | null,
      onerror: null,
      onabort: null,
      objectStore(name: keyof typeof source) {
        return {
          getAll: () => {
            const request = {
              result: data[name],
              onsuccess: null as (() => void) | null,
              onerror: null,
            };
            queueMicrotask(() => request.onsuccess?.());
            return request;
          },
        };
      },
    };
    setTimeout(() => tx.oncomplete?.(), 0);
    return tx;
  });
  const database = { close, transaction, objectStoreNames: Object.keys(data) };
  const open = vi.fn(() => {
    const request = {
      result: database,
      onsuccess: null as (() => void) | null,
      onerror: null,
      onupgradeneeded: null,
      onblocked: null,
    };
    queueMicrotask(() => request.onsuccess?.());
    return request;
  });
  vi.stubGlobal("indexedDB", {
    databases: vi.fn().mockResolvedValue([{ name: "PromptHubDB" }]),
    open,
  });
  return { close, open };
}

function installTarget() {
  let target = {
    prompts: [] as unknown[],
    folders: [] as unknown[],
    versions: [] as unknown[],
  };
  const mark = vi.fn().mockResolvedValue(undefined);
  const status = vi.fn().mockResolvedValue(false);
  const migrate = vi.fn(async (input: typeof source) => {
    target = structuredClone(input);
    return { imported: true };
  });
  const api = {
    prompt: {
      migrateIdbBatch: migrate,
      getAll: vi.fn(async () => target.prompts),
    },
    folder: { getAll: vi.fn(async () => target.folders) },
    version: { getAll: vi.fn(async () => target.versions) },
    settings: {
      rendererPersistence: {
        isIndexedDbMigrationDone: status,
        markIndexedDbMigrationDone: mark,
      },
    },
  };
  Object.defineProperty(window, "api", { configurable: true, value: api });
  return {
    api,
    migrate,
    mark,
    status,
    setTarget(value: typeof target) {
      target = value;
    },
  };
}

describe("historical IndexedDB conversion", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("converts all records, verifies content, closes the source and records completion", async () => {
    const input = installSource();
    const target = installTarget();
    expect(await migrateLegacyIndexedDbToMainProcess()).toEqual({
      migrated: true,
      promptCount: 1,
      folderCount: 1,
      versionCount: 1,
    });
    expect(target.migrate).toHaveBeenCalledWith(source);
    expect(target.mark).toHaveBeenCalledOnce();
    expect(input.close).toHaveBeenCalledOnce();
  });

  it("does not open browser storage after confirmed migration", async () => {
    const input = installSource();
    const target = installTarget();
    target.status.mockResolvedValue(true);
    await migrateLegacyIndexedDbToMainProcess();
    expect(input.open).not.toHaveBeenCalled();
  });

  it("does not create a browser database on a fresh install", async () => {
    const input = installSource();
    installTarget();
    vi.mocked(indexedDB.databases).mockResolvedValue([]);
    await migrateLegacyIndexedDbToMainProcess();
    expect(input.open).not.toHaveBeenCalled();
  });

  it("accepts an already fully converted target without another import", async () => {
    installSource();
    const target = installTarget();
    target.setTarget(structuredClone(source));
    await migrateLegacyIndexedDbToMainProcess();
    expect(target.migrate).not.toHaveBeenCalled();
    expect(target.mark).toHaveBeenCalledOnce();
  });

  it.each(["missing-version", "changed-content"])(
    "rejects %s instead of declaring ready",
    async (scenario) => {
      const input = installSource();
      const target = installTarget();
      target.setTarget({
        ...source,
        ...(scenario === "missing-version"
          ? { versions: [] }
          : { prompts: [{ ...prompt, userPrompt: "Different" }] }),
      });
      await expect(migrateLegacyIndexedDbToMainProcess()).rejects.toThrow(
        /incomplete|conflict/i,
      );
      expect(target.mark).not.toHaveBeenCalled();
      expect(target.migrate).not.toHaveBeenCalled();
      expect(input.close).toHaveBeenCalledOnce();
    },
  );

  it("propagates import failure and preserves the completion state", async () => {
    const input = installSource();
    const target = installTarget();
    target.migrate.mockRejectedValue(new Error("transaction failed"));
    await expect(migrateLegacyIndexedDbToMainProcess()).rejects.toThrow(
      "transaction failed",
    );
    expect(target.mark).not.toHaveBeenCalled();
    expect(input.close).toHaveBeenCalledOnce();
  });

  it("verifies data even when import claims success", async () => {
    installSource();
    const target = installTarget();
    target.migrate.mockImplementation(async () => ({ imported: true }));
    await expect(migrateLegacyIndexedDbToMainProcess()).rejects.toThrow(
      /verification/i,
    );
    expect(target.mark).not.toHaveBeenCalled();
  });

  it("does not trust a legacy localStorage done marker", async () => {
    installSource();
    const target = installTarget();
    localStorage.setItem("prompthub:idb-migration-done", "1");
    await migrateLegacyIndexedDbToMainProcess();
    expect(target.migrate).toHaveBeenCalledOnce();
  });

  it("fails explicitly when the atomic import interface is missing", async () => {
    const input = installSource();
    const target = installTarget();
    Reflect.deleteProperty(target.api.prompt, "migrateIdbBatch");
    await expect(migrateLegacyIndexedDbToMainProcess()).rejects.toThrow(
      /migrateIdbBatch/,
    );
    expect(input.open).not.toHaveBeenCalled();
    expect(target.mark).not.toHaveBeenCalled();
  });
});

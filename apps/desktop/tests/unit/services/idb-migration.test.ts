/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Folder, Prompt, PromptVersion } from "@prompthub/shared/types";

const DONE_KEY = "prompthub:idb-migration-done";

interface LegacyDataset {
  prompts: Prompt[];
  folders: Folder[];
  versions: PromptVersion[];
}

function asyncRequest<T>(result: T): IDBRequest<T> {
  const request = {
    onsuccess: null,
    onerror: null,
    result,
    error: null,
  } as unknown as IDBRequest<T>;

  setTimeout(() => {
    request.onsuccess?.(new Event("success"));
  }, 0);

  return request;
}

function installIndexedDbMock(dataset: LegacyDataset): void {
  const db = {
    close: vi.fn(),
    onversionchange: null,
    transaction: vi.fn((_storeName: string) => ({
      objectStore: (storeName: string) => {
        if (storeName === "prompts") {
          return {
            getAll: () => asyncRequest(dataset.prompts),
          };
        }

        if (storeName === "folders") {
          return {
            getAll: () => asyncRequest(dataset.folders),
          };
        }

        if (storeName === "versions") {
          return {
            index: (indexName: string) => {
              if (indexName !== "promptId") {
                throw new Error(`Unexpected index lookup: ${indexName}`);
              }
              return {
                getAll: (promptId: string) =>
                  asyncRequest(
                    dataset.versions.filter((version) => version.promptId === promptId),
                  ),
              };
            },
          };
        }

        throw new Error(`Unexpected object store: ${storeName}`);
      },
    })),
  } as unknown as IDBDatabase;

  vi.stubGlobal("indexedDB", {
    open: vi.fn(() => {
      const request = {
        onsuccess: null,
        onerror: null,
        onblocked: null,
        onupgradeneeded: null,
        result: db,
        error: null,
      } as unknown as IDBOpenDBRequest;

      setTimeout(() => {
        request.onsuccess?.(new Event("success"));
      }, 0);

      return request;
    }),
  });
}

describe("migrateLegacyIndexedDbToMainProcess", () => {
  const legacyPrompt: Prompt = {
    id: "prompt-1",
    title: "Prompt 1",
    description: null,
    promptType: "text",
    systemPrompt: null,
    systemPromptEn: null,
    userPrompt: "hello",
    userPromptEn: null,
    variables: [],
    tags: [],
    folderId: "folder-1",
    images: [],
    videos: [],
    isFavorite: false,
    isPinned: false,
    currentVersion: 1,
    version: 1,
    usageCount: 0,
    source: null,
    notes: null,
    lastAiResponse: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const legacyFolder: Folder = {
    id: "folder-1",
    name: "Folder 1",
    icon: null,
    parentId: null,
    order: 0,
    isPrivate: false,
    visibility: "private",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const legacyVersion: PromptVersion = {
    id: "version-1",
    promptId: "prompt-1",
    version: 1,
    systemPrompt: null,
    systemPromptEn: null,
    userPrompt: "hello",
    userPromptEn: null,
    variables: [],
    note: null,
    aiResponse: null,
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    delete (window as Window & { api?: unknown }).api;
  });

  it("does not write the done marker when SQLite already has partial migrated data", async () => {
    installIndexedDbMock({
      prompts: [legacyPrompt],
      folders: [legacyFolder],
      versions: [legacyVersion],
    });

    const migrateIdbBatch = vi.fn();
    (window as Window & { api: any }).api = {
      prompt: {
        getAll: vi.fn().mockResolvedValue([legacyPrompt]),
        migrateIdbBatch,
      },
      folder: {
        getAll: vi.fn().mockResolvedValue([legacyFolder]),
      },
      version: {
        getAll: vi.fn().mockResolvedValue([]),
      },
    };

    const { migrateLegacyIndexedDbToMainProcess } = await import(
      "../../../src/renderer/services/database"
    );

    const result = await migrateLegacyIndexedDbToMainProcess();

    expect(result.migrated).toBe(false);
    expect(localStorage.getItem(DONE_KEY)).toBeNull();
    expect(migrateIdbBatch).not.toHaveBeenCalled();
  });

  it("writes the done marker when SQLite already fully contains the legacy data", async () => {
    installIndexedDbMock({
      prompts: [legacyPrompt],
      folders: [legacyFolder],
      versions: [legacyVersion],
    });

    const migrateIdbBatch = vi.fn();
    (window as Window & { api: any }).api = {
      prompt: {
        getAll: vi.fn().mockResolvedValue([legacyPrompt]),
        migrateIdbBatch,
      },
      folder: {
        getAll: vi.fn().mockResolvedValue([legacyFolder]),
      },
      version: {
        getAll: vi.fn().mockResolvedValue([legacyVersion]),
      },
    };

    const { migrateLegacyIndexedDbToMainProcess } = await import(
      "../../../src/renderer/services/database"
    );

    const result = await migrateLegacyIndexedDbToMainProcess();

    expect(result.migrated).toBe(false);
    expect(localStorage.getItem(DONE_KEY)).toBe("1");
    expect(migrateIdbBatch).not.toHaveBeenCalled();
  });

  it("refuses the old non-atomic fallback path when migrateIdbBatch is unavailable", async () => {
    installIndexedDbMock({
      prompts: [legacyPrompt],
      folders: [legacyFolder],
      versions: [legacyVersion],
    });

    const insertDirect = vi.fn();
    (window as Window & { api: any }).api = {
      prompt: {
        getAll: vi.fn().mockResolvedValue([]),
        insertDirect,
      },
      folder: {
        getAll: vi.fn().mockResolvedValue([]),
        insertDirect,
      },
      version: {
        getAll: vi.fn().mockResolvedValue([]),
        insertDirect,
      },
    };

    const { migrateLegacyIndexedDbToMainProcess } = await import(
      "../../../src/renderer/services/database"
    );

    const result = await migrateLegacyIndexedDbToMainProcess();

    expect(result.migrated).toBe(false);
    expect(localStorage.getItem(DONE_KEY)).toBeNull();
  });

  it("re-fetches main-process data when migrateIdbBatch reports imported false", async () => {
    installIndexedDbMock({
      prompts: [legacyPrompt],
      folders: [legacyFolder],
      versions: [legacyVersion],
    });

    const migrateIdbBatch = vi.fn().mockResolvedValue({ imported: false });
    const promptGetAll = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([legacyPrompt]);
    const folderGetAll = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([legacyFolder]);

    (window as Window & { api: any }).api = {
      prompt: {
        getAll: promptGetAll,
        migrateIdbBatch,
      },
      folder: {
        getAll: folderGetAll,
      },
      version: {
        getAll: vi.fn().mockResolvedValue([legacyVersion]),
      },
    };

    const { migrateLegacyIndexedDbToMainProcess } = await import(
      "../../../src/renderer/services/database"
    );

    const result = await migrateLegacyIndexedDbToMainProcess();

    expect(result.migrated).toBe(false);
    expect(localStorage.getItem(DONE_KEY)).toBe("1");
    expect(promptGetAll).toHaveBeenCalledTimes(2);
    expect(folderGetAll).toHaveBeenCalledTimes(2);
  });
});

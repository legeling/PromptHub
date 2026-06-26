import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  downloadBackup,
  downloadCompressedBackup,
  downloadSelectiveExport,
  exportDatabase,
  formatBackupImportError,
  restoreFromBackup,
  restoreFromFile,
} from "../../../src/renderer/services/database-backup";
import { installWindowMocks } from "../../helpers/window";

const clearDatabaseMock = vi.fn().mockResolvedValue(undefined);
const getDatabaseMock = vi.fn();
const getAllFoldersMock = vi.fn();
const getAllPromptsMock = vi.fn();
const restoreAiConfigSnapshotMock = vi.fn();
const restoreSettingsStateSnapshotMock = vi.fn();
const getAiConfigSnapshotMock = vi.fn();
const getSettingsStateSnapshotMock = vi.fn();

vi.mock("../../../src/renderer/services/database", () => ({
  clearDatabase: () => clearDatabaseMock(),
  getAllFolders: () => getAllFoldersMock(),
  getAllPrompts: () => getAllPromptsMock(),
  getDatabase: () => getDatabaseMock(),
}));

vi.mock("../../../src/renderer/services/settings-snapshot", () => ({
  getAiConfigSnapshot: (...args: unknown[]) => getAiConfigSnapshotMock(...args),
  getSettingsStateSnapshot: (...args: unknown[]) =>
    getSettingsStateSnapshotMock(...args),
  restoreAiConfigSnapshot: (...args: unknown[]) =>
    restoreAiConfigSnapshotMock(...args),
  restoreSettingsStateSnapshot: (...args: unknown[]) =>
    restoreSettingsStateSnapshotMock(...args),
}));

function createTransactionMock(getAllResult: unknown[] = []) {
  const transaction: {
    error: null;
    objectStore: (name: string) => {
      add: ReturnType<typeof vi.fn>;
      getAll: ReturnType<typeof vi.fn>;
    };
    oncomplete: (() => void) | null;
    onerror: (() => void) | null;
  } = {
    error: null,
    objectStore: () => ({
      add: vi.fn(),
      getAll: vi.fn(() => {
        const request: {
          result?: unknown[];
          onsuccess: (() => void) | null;
          onerror: (() => void) | null;
        } = {
          result: getAllResult,
          onsuccess: null,
          onerror: null,
        };
        queueMicrotask(() => {
          request.onsuccess?.();
        });
        return request;
      }),
    }),
    oncomplete: null,
    onerror: null,
  };

  queueMicrotask(() => {
    transaction.oncomplete?.();
  });

  return transaction;
}

describe("database-backup restore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    getAllFoldersMock.mockResolvedValue([]);
    getAllPromptsMock.mockResolvedValue([]);
    getAiConfigSnapshotMock.mockReturnValue(undefined);
    getSettingsStateSnapshotMock.mockReturnValue(undefined);
    getDatabaseMock.mockResolvedValue({
      transaction: () => createTransactionMock(),
    });

    installWindowMocks();
  });

  it("delays backup URL revocation so downloads are not truncated", async () => {
    vi.useFakeTimers();
    const originalCreateElement = document.createElement.bind(document);
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });

    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:test-download");
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});

    const anchor = originalCreateElement("a");
    const clickSpy = vi.spyOn(anchor, "click").mockImplementation(() => {});

    const appendChild = vi.spyOn(document.body, "appendChild");
    const removeChild = vi.spyOn(document.body, "removeChild");
    vi.spyOn(document, "createElement").mockImplementation(
      (tagName: string) => {
        if (tagName === "a") {
          return anchor;
        }
        return originalCreateElement(tagName);
      },
    );

    await downloadBackup();

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(anchor.download).toMatch(/prompthub-backup-.*\.json/);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);

    expect(removeChild).toHaveBeenCalledWith(anchor);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test-download");

    appendChild.mockRestore();
    removeChild.mockRestore();
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
    clickSpy.mockRestore();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: originalCreateObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: originalRevokeObjectURL,
    });
    vi.useRealTimers();
  });

  it("cleans up backup download URLs when the browser click fails", async () => {
    const originalCreateElement = document.createElement.bind(document);
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });

    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:failed-download");
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});

    const anchor = originalCreateElement("a");
    const clickError = new Error("download blocked");
    const clickSpy = vi.spyOn(anchor, "click").mockImplementation(() => {
      throw clickError;
    });
    const removeChild = vi.spyOn(document.body, "removeChild");
    vi.spyOn(document, "createElement").mockImplementation(
      (tagName: string) => {
        if (tagName === "a") {
          return anchor;
        }
        return originalCreateElement(tagName);
      },
    );

    await expect(downloadBackup()).rejects.toThrow("download blocked");

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(removeChild).toHaveBeenCalledWith(anchor);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:failed-download");

    removeChild.mockRestore();
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
    clickSpy.mockRestore();
    vi.restoreAllMocks();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: originalCreateObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: originalRevokeObjectURL,
    });
  });

  it("still exports legacy compressed backups as .phub.gz for backward compatibility", async () => {
    vi.useFakeTimers();
    const originalBlobStream = Blob.prototype.stream;
    Object.defineProperty(Blob.prototype, "stream", {
      configurable: true,
      value: vi.fn(() => ({
        pipeThrough: vi.fn(
          () =>
            new ReadableStream({
              start(controller) {
                controller.close();
              },
            }),
        ),
      })),
    });

    class CompressionStreamMock {
      readable = new ReadableStream();

      writable = new WritableStream();
    }

    vi.stubGlobal(
      "CompressionStream",
      CompressionStreamMock as typeof CompressionStream,
    );
    const originalCreateElement = document.createElement.bind(document);
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });

    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:test-gz-download");
    const anchor = originalCreateElement("a");
    const clickSpy = vi.spyOn(anchor, "click").mockImplementation(() => {});
    vi.spyOn(document, "createElement").mockImplementation(
      (tagName: string) => {
        if (tagName === "a") {
          return anchor;
        }
        return originalCreateElement(tagName);
      },
    );

    await downloadCompressedBackup();

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(anchor.download).toMatch(/prompthub-backup-.*\.phub\.gz/);
    expect(clickSpy).toHaveBeenCalledTimes(1);

    await vi.runAllTimersAsync();

    createObjectURL.mockRestore();
    clickSpy.mockRestore();
    vi.unstubAllGlobals();
    Object.defineProperty(Blob.prototype, "stream", {
      configurable: true,
      value: originalBlobStream,
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: originalCreateObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: originalRevokeObjectURL,
    });
    vi.useRealTimers();
  });

  it("exports skills, skill versions, and skill files in the unified backup payload", async () => {
    window.api.skill.getAll.mockResolvedValue([
      {
        id: "skill-1",
        name: "writer",
      },
    ]);
    window.api.skill.versionGetAll.mockResolvedValue([
      {
        id: "version-1",
        skillId: "skill-1",
        version: 1,
      },
    ]);
    window.api.skill.readLocalFiles.mockResolvedValue([
      {
        path: "SKILL.md",
        content: "# Writer",
        isDirectory: false,
      },
      {
        path: "examples",
        content: "",
        isDirectory: true,
      },
    ]);
    getAiConfigSnapshotMock.mockReturnValue({ aiProvider: "openai" });
    getSettingsStateSnapshotMock.mockReturnValue({
      state: { language: "zh" },
      settingsUpdatedAt: "2026-04-07T00:00:00.000Z",
    });

    const backup = await exportDatabase();

    expect(backup.skills).toEqual([{ id: "skill-1", name: "writer" }]);
    expect(backup.skillVersions).toEqual([
      { id: "version-1", skillId: "skill-1", version: 1 },
    ]);
    expect(backup.skillFiles).toEqual({
      "skill-1": [{ relativePath: "SKILL.md", content: "# Writer" }],
    });
    expect(backup.aiConfig).toEqual({ aiProvider: "openai" });
    expect(backup.settings).toEqual({ state: { language: "zh" } });
  });

  it("exports and restores My MCP, My Plugins, and custom agent store sources", async () => {
    const mcpLibrary = {
      kind: "prompthub-mcp-library" as const,
      version: 1 as const,
      updatedAt: "2026-06-21T00:00:00.000Z",
      servers: [{ id: "mcp-1", name: "Local MCP" }],
      bindings: [],
    };
    const pluginLibrary = {
      kind: "prompthub-plugin-library" as const,
      version: 1 as const,
      updatedAt: "2026-06-21T00:00:00.000Z",
      plugins: [{ id: "plugin-1", name: "writer-kit" }],
    };
    const pluginPackages = [
      {
        pluginId: "plugin-1",
        files: [
          {
            relativePath: "skill.json",
            contentBase64: "e30=",
            size: 2,
          },
        ],
      },
    ];
    const customSource = {
      id: "source-1",
      name: "Team Store",
      type: "git-repo" as const,
      url: "https://github.com/example/team-store",
      branch: "main",
      directory: "stores",
      enabled: true,
      order: 1,
      createdAt: 1_780_000_000_000,
    };

    localStorage.setItem(
      "skill-store",
      JSON.stringify({
        state: {
          customStoreSources: [customSource],
          selectedStoreSourceId: "source-1",
        },
        version: 0,
      }),
    );
    localStorage.setItem(
      "mcp-store",
      JSON.stringify({
        state: {
          customStoreSources: [customSource],
          selectedMarketSourceId: "source-1",
        },
        version: 0,
      }),
    );
    localStorage.setItem(
      "plugin-store",
      JSON.stringify({
        state: {
          customStoreSources: [customSource],
          selectedMarketSourceId: "source-1",
        },
        version: 0,
      }),
    );
    installWindowMocks({
      api: {
        mcp: {
          getLibrary: vi.fn().mockResolvedValue(mcpLibrary),
          replaceLibrary: vi.fn().mockResolvedValue(mcpLibrary),
          exportDataFiles: vi.fn().mockResolvedValue([
            {
              relativePath: "library.json",
              contentBase64: "e30=",
              size: 2,
            },
          ]),
          restoreDataFiles: vi.fn().mockResolvedValue(undefined),
        },
        plugin: {
          exportLibrarySnapshot: vi.fn().mockResolvedValue({
            library: pluginLibrary,
            packages: pluginPackages,
          }),
          restoreLibrarySnapshot: vi.fn().mockResolvedValue(pluginLibrary),
          exportDataFiles: vi.fn().mockResolvedValue([
            {
              relativePath: "market-cache.json",
              contentBase64: "e30=",
              size: 2,
            },
            {
              relativePath: "writer-kit/package/skill.json",
              contentBase64: "e30=",
              size: 2,
            },
          ]),
          restoreDataFiles: vi.fn().mockResolvedValue(undefined),
        },
      },
    });

    const backup = await exportDatabase();

    expect(backup.mcpLibrary).toEqual(mcpLibrary);
    expect(backup.pluginLibrary).toEqual(pluginLibrary);
    expect(backup.pluginPackages).toEqual(pluginPackages);
    expect(backup.agentAssetFiles).toEqual({
      mcp: [{ relativePath: "library.json", contentBase64: "e30=", size: 2 }],
      plugins: [
        { relativePath: "market-cache.json", contentBase64: "e30=", size: 2 },
        {
          relativePath: "writer-kit/package/skill.json",
          contentBase64: "e30=",
          size: 2,
        },
      ],
    });
    expect(backup.storeSources).toEqual({
      skills: {
        customStoreSources: [customSource],
        selectedSourceId: "source-1",
      },
      mcp: {
        customStoreSources: [customSource],
        selectedSourceId: "source-1",
      },
      plugins: {
        customStoreSources: [customSource],
        selectedSourceId: "source-1",
      },
    });

    localStorage.clear();
    await restoreFromBackup(backup);

    expect(window.api.mcp.restoreDataFiles).toHaveBeenCalledWith(
      backup.agentAssetFiles?.mcp,
    );
    expect(window.api.plugin.restoreDataFiles).toHaveBeenCalledWith(
      backup.agentAssetFiles?.plugins,
    );
    expect(window.api.mcp.replaceLibrary).toHaveBeenCalledWith(mcpLibrary);
    expect(window.api.plugin.restoreLibrarySnapshot).toHaveBeenCalledWith({
      library: pluginLibrary,
      packages: pluginPackages,
    });
    expect(
      JSON.parse(localStorage.getItem("skill-store") ?? "{}"),
    ).toMatchObject({
      state: {
        customStoreSources: [customSource],
        selectedStoreSourceId: "source-1",
      },
    });
    expect(JSON.parse(localStorage.getItem("mcp-store") ?? "{}")).toMatchObject(
      {
        state: {
          customStoreSources: [customSource],
          selectedMarketSourceId: "source-1",
        },
      },
    );
    expect(
      JSON.parse(localStorage.getItem("plugin-store") ?? "{}"),
    ).toMatchObject({
      state: {
        customStoreSources: [customSource],
        selectedMarketSourceId: "source-1",
      },
    });
  });

  it("exports rules and restores them through the rules preload API", async () => {
    installWindowMocks({
      api: {
        rules: {
          list: vi.fn().mockResolvedValue([
            {
              id: "gemini-global",
              platformId: "gemini",
              platformName: "Gemini CLI",
              platformIcon: "gemini",
              platformDescription: "Gemini rules",
              name: "GEMINI.md",
              description: "Gemini global rule file",
              path: "/Users/test/.gemini/GEMINI.md",
              exists: true,
              group: "assistant",
            },
          ]),
          read: vi.fn().mockResolvedValue({
            id: "gemini-global",
            platformId: "gemini",
            platformName: "Gemini CLI",
            platformIcon: "gemini",
            platformDescription: "Gemini rules",
            name: "GEMINI.md",
            description: "Gemini global rule file",
            path: "/Users/test/.gemini/GEMINI.md",
            managedPath: "/tmp/data/rules/global/gemini/GEMINI.md",
            targetPath: "/Users/test/.gemini/GEMINI.md",
            projectRootPath: null,
            syncStatus: "synced",
            exists: true,
            group: "assistant",
            content: "# Gemini rules",
            versions: [
              {
                id: "rule-version-1",
                savedAt: "2026-05-09T00:00:00.000Z",
                source: "create",
                content: "# Gemini rules",
              },
            ],
          }),
          importRecords: vi.fn().mockResolvedValue({ success: true }),
        },
      },
    });

    const backup = await exportDatabase();

    expect(backup.rules).toEqual([
      expect.objectContaining({
        id: "gemini-global",
        content: "# Gemini rules",
      }),
    ]);

    await restoreFromBackup(backup);

    expect(window.api.rules.importRecords).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: "gemini-global",
          content: "# Gemini rules",
        }),
      ]),
      { replace: true },
    );
  });

  it("prefers main-process prompt versions when available", async () => {
    getAllPromptsMock.mockResolvedValue([
      {
        id: "prompt-1",
        title: "Prompt 1",
        description: "",
        systemPrompt: "",
        userPrompt: "",
        variables: [],
        tags: [],
        folderId: null,
        createdAt: "2026-04-07T00:00:00.000Z",
        updatedAt: "2026-04-07T00:00:00.000Z",
        version: 2,
        currentVersion: 2,
        usageCount: 0,
        isFavorite: false,
        isPinned: false,
        promptType: "text",
        images: [],
        videos: [],
      },
    ]);
    installWindowMocks({
      api: {
        version: {
          getAll: vi.fn().mockResolvedValue([
            {
              id: "version-main-1",
              promptId: "prompt-1",
              version: 1,
              systemPrompt: "System",
              userPrompt: "User",
              variables: [],
              createdAt: "2026-04-07T00:00:00.000Z",
            },
          ]),
        },
      },
    });

    const backup = await exportDatabase();

    expect(window.api.version.getAll).toHaveBeenCalledWith("prompt-1");
    expect(backup.versions).toEqual([
      expect.objectContaining({
        id: "version-main-1",
        promptId: "prompt-1",
        version: 1,
      }),
    ]);
  });

  it("exports all referenced media by default even when legacy size and count limits are exceeded", async () => {
    const imageNames = Array.from(
      { length: 502 },
      (_, index) => `image-${index}.png`,
    );
    const videoNames = Array.from(
      { length: 101 },
      (_, index) => `video-${index}.mp4`,
    );

    getAllPromptsMock.mockResolvedValue([
      {
        id: "prompt-media",
        title: "Large media payload",
        description: "",
        systemPrompt: "",
        userPrompt: "",
        variables: [],
        tags: [],
        folderId: null,
        createdAt: "2026-04-07T00:00:00.000Z",
        updatedAt: "2026-04-07T00:00:00.000Z",
        version: 1,
        currentVersion: 1,
        usageCount: 0,
        isFavorite: false,
        isPinned: false,
        promptType: "text",
        images: imageNames,
        videos: videoNames,
      },
    ]);

    installWindowMocks({
      electron: {
        getImageSize: vi.fn().mockResolvedValue(50 * 1024 * 1024),
        readImageBase64: vi.fn((fileName: string) =>
          Promise.resolve(`image:${fileName}`),
        ),
        getVideoSize: vi.fn().mockResolvedValue(200 * 1024 * 1024),
        readVideoBase64: vi.fn((fileName: string) =>
          Promise.resolve(`video:${fileName}`),
        ),
      },
    });

    const backup = await exportDatabase();

    expect(Object.keys(backup.images ?? {})).toHaveLength(502);
    expect(backup.images?.["image-501.png"]).toBe("image:image-501.png");
    expect(Object.keys(backup.videos ?? {})).toHaveLength(101);
    expect(backup.videos?.["video-100.mp4"]).toBe("video:video-100.mp4");
  });

  it("fails export when referenced media cannot be read completely", async () => {
    getAllPromptsMock.mockResolvedValue([
      {
        id: "prompt-broken-media",
        title: "Broken media",
        description: "",
        systemPrompt: "",
        userPrompt: "",
        variables: [],
        tags: [],
        folderId: null,
        createdAt: "2026-04-07T00:00:00.000Z",
        updatedAt: "2026-04-07T00:00:00.000Z",
        version: 1,
        currentVersion: 1,
        usageCount: 0,
        isFavorite: false,
        isPinned: false,
        promptType: "text",
        images: ["broken-image.png"],
        videos: [],
      },
    ]);

    installWindowMocks({
      electron: {
        getImageSize: vi.fn().mockResolvedValue(1024),
        readImageBase64: vi.fn().mockRejectedValue(new Error("missing image")),
      },
    });

    await expect(exportDatabase()).rejects.toThrow(
      "Backup export failed to read 1 image files: broken-image.png",
    );
  });

  it("fails export when skill metadata cannot be collected completely", async () => {
    window.api.skill.getAll.mockResolvedValue([
      {
        id: "skill-1",
        name: "writer",
      },
    ]);
    window.api.skill.versionGetAll.mockRejectedValue(new Error("db busy"));
    window.api.skill.readLocalFiles.mockResolvedValue([]);

    await expect(exportDatabase()).rejects.toThrow(
      "Backup export failed to read 1 skill records: skill versions writer",
    );
  });

  it("round-trips prompts, folders, versions, media, skills, and settings through the backup pipeline", async () => {
    const prompt = {
      id: "prompt-1",
      title: "Round Trip Prompt",
      description: "Prompt with media",
      systemPrompt: "System",
      userPrompt: "User",
      variables: [],
      tags: ["tag-1"],
      folderId: "folder-1",
      createdAt: "2026-04-07T00:00:00.000Z",
      updatedAt: "2026-04-07T00:00:00.000Z",
      version: 2,
      currentVersion: 2,
      usageCount: 3,
      isFavorite: true,
      isPinned: false,
      promptType: "text",
      images: ["image-1.png"],
      videos: ["video-1.mp4"],
    };
    const folder = {
      id: "folder-1",
      name: "Folder 1",
      parentId: null,
      order: 1,
      createdAt: "2026-04-07T00:00:00.000Z",
      updatedAt: "2026-04-07T00:00:00.000Z",
    };
    const version = {
      id: "version-1",
      promptId: "prompt-1",
      version: 1,
      systemPrompt: "Old system",
      userPrompt: "Old user",
      createdAt: "2026-04-06T00:00:00.000Z",
    };
    const skill = {
      id: "skill-1",
      name: "writer",
      description: "Writer skill",
      content: "# Writer",
      instructions: "# Writer",
      protocol_type: "skill",
      version: "1.0.0",
      author: "PromptHub",
      tags: ["writing"],
      is_favorite: false,
      created_at: Date.parse("2026-04-07T00:00:00.000Z"),
      updated_at: Date.parse("2026-04-07T00:00:00.000Z"),
      currentVersion: 1,
    };
    const skillVersion = {
      id: "skill-version-1",
      skillId: "skill-1",
      version: 1,
      content: "# Writer v1",
      createdAt: "2026-04-07T00:00:00.000Z",
      source: "manual",
    };

    getAllPromptsMock.mockResolvedValue([prompt]);
    getAllFoldersMock.mockResolvedValue([folder]);
    getDatabaseMock.mockResolvedValue({
      transaction: () => createTransactionMock([version]),
    });
    getAiConfigSnapshotMock.mockReturnValue({
      aiProvider: "openai",
      aiApiKey: "root-key",
    });
    getSettingsStateSnapshotMock.mockReturnValue({
      state: { language: "zh", theme: "dark" },
      settingsUpdatedAt: "2026-04-07T00:00:00.000Z",
    });

    installWindowMocks({
      api: {
        prompt: {
          getAll: vi.fn().mockResolvedValue([prompt]),
          delete: vi.fn().mockResolvedValue(true),
          insertDirect: vi.fn().mockResolvedValue(undefined),
          syncWorkspace: vi.fn().mockResolvedValue(undefined),
        },
        folder: {
          getAll: vi.fn().mockResolvedValue([folder]),
          delete: vi.fn().mockResolvedValue(true),
          insertDirect: vi.fn().mockResolvedValue(undefined),
        },
        version: {
          insertDirect: vi.fn().mockResolvedValue(undefined),
        },
        skill: {
          getAll: vi.fn().mockResolvedValue([skill]),
          versionGetAll: vi.fn().mockResolvedValue([skillVersion]),
          readLocalFiles: vi.fn().mockResolvedValue([
            { path: "SKILL.md", content: "# Writer", isDirectory: false },
            {
              path: "notes/example.md",
              content: "Example",
              isDirectory: false,
            },
          ]),
          deleteAll: vi.fn().mockResolvedValue(undefined),
          create: vi.fn().mockResolvedValue({
            id: "restored-skill-1",
            name: "writer",
          }),
          insertVersionDirect: vi.fn().mockResolvedValue(undefined),
          update: vi.fn().mockResolvedValue(undefined),
          writeLocalFile: vi.fn().mockResolvedValue(undefined),
        },
      },
      electron: {
        getImageSize: vi.fn().mockResolvedValue(128),
        readImageBase64: vi.fn().mockResolvedValue("base64-image"),
        saveImageBase64: vi.fn().mockResolvedValue(undefined),
        getVideoSize: vi.fn().mockResolvedValue(512),
        readVideoBase64: vi.fn().mockResolvedValue("base64-video"),
        saveVideoBase64: vi.fn().mockResolvedValue(undefined),
      },
    });

    const backup = await exportDatabase();

    expect(backup.prompts).toEqual([prompt]);
    expect(backup.folders).toEqual([folder]);
    expect(backup.versions).toEqual([version]);
    expect(backup.images).toEqual({ "image-1.png": "base64-image" });
    expect(backup.videos).toEqual({ "video-1.mp4": "base64-video" });
    expect(backup.skills).toEqual([skill]);
    expect(backup.skillVersions).toEqual([skillVersion]);
    expect(backup.skillFiles).toEqual({
      "skill-1": [
        { relativePath: "SKILL.md", content: "# Writer" },
        { relativePath: "notes/example.md", content: "Example" },
      ],
    });
    expect(backup.aiConfig).toEqual({
      aiProvider: "openai",
      aiApiKey: "root-key",
    });
    expect(backup.settings).toEqual({
      state: { language: "zh", theme: "dark" },
    });

    await restoreFromBackup(backup);

    expect(window.api.folder.delete).toHaveBeenCalledWith("folder-1");
    expect(window.api.prompt.delete).toHaveBeenCalledWith("prompt-1");
    expect(window.api.folder.insertDirect).toHaveBeenCalledWith(folder);
    expect(window.api.prompt.insertDirect).toHaveBeenCalledWith(prompt);
    expect(window.api.version.insertDirect).toHaveBeenCalledWith(version);
    expect(window.api.prompt.syncWorkspace).toHaveBeenCalledTimes(1);
    expect(window.electron.saveImageBase64).toHaveBeenCalledWith(
      "image-1.png",
      "base64-image",
    );
    expect(window.electron.saveVideoBase64).toHaveBeenCalledWith(
      "video-1.mp4",
      "base64-video",
    );
    expect(restoreAiConfigSnapshotMock).toHaveBeenCalledWith({
      aiProvider: "openai",
      aiApiKey: "root-key",
    });
    expect(restoreSettingsStateSnapshotMock).toHaveBeenCalledWith({
      state: { language: "zh", theme: "dark" },
    });
    expect(window.api.skill.deleteAll).toHaveBeenCalledTimes(1);
    expect(window.api.skill.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "writer",
        description: "Writer skill",
        content: "# Writer",
        instructions: "# Writer",
      }),
      { skipInitialVersion: true },
    );
    expect(window.api.skill.insertVersionDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "skill-version-1",
        skillId: "restored-skill-1",
        version: 1,
      }),
    );
    expect(window.api.skill.update).toHaveBeenCalledWith("restored-skill-1", {
      currentVersion: 2,
    });
    expect(window.api.skill.writeLocalFile).toHaveBeenCalledWith(
      "restored-skill-1",
      "SKILL.md",
      "# Writer",
      { skipVersionSnapshot: true },
    );
    expect(window.api.skill.writeLocalFile).toHaveBeenCalledWith(
      "restored-skill-1",
      "notes/example.md",
      "Example",
      { skipVersionSnapshot: true },
    );
  });

  it("throws when backup restore cannot fully write assets", async () => {
    installWindowMocks({
      electron: {
        saveImageBase64: vi.fn().mockRejectedValue(new Error("disk full")),
      },
    });

    await expect(
      restoreFromBackup({
        version: 1,
        exportedAt: "2026-04-07T00:00:00.000Z",
        prompts: [],
        folders: [],
        versions: [],
        images: {
          "image-1.png": "base64-image",
        },
      }),
    ).rejects.toThrow(
      "Backup restore completed with 1 file errors: image image-1.png",
    );
  });

  it("restores folders in parent-first order even when backup payload is unsorted", async () => {
    const parentFolder = {
      id: "folder-parent",
      name: "Parent",
      createdAt: "2026-04-07T00:00:00.000Z",
      updatedAt: "2026-04-07T00:00:00.000Z",
      order: 0,
    };
    const childFolder = {
      id: "folder-child",
      name: "Child",
      parentId: "folder-parent",
      createdAt: "2026-04-07T00:00:01.000Z",
      updatedAt: "2026-04-07T00:00:01.000Z",
      order: 0,
    };

    installWindowMocks({
      api: {
        prompt: {
          getAll: vi.fn().mockResolvedValue([]),
          delete: vi.fn().mockResolvedValue(true),
          insertDirect: vi.fn().mockResolvedValue(undefined),
          syncWorkspace: vi.fn().mockResolvedValue(undefined),
        },
        folder: {
          getAll: vi.fn().mockResolvedValue([]),
          delete: vi.fn().mockResolvedValue(true),
          insertDirect: vi.fn().mockResolvedValue(undefined),
        },
        version: {
          insertDirect: vi.fn().mockResolvedValue(undefined),
        },
        skill: {
          deleteAll: vi.fn().mockResolvedValue(undefined),
        },
      },
    });

    await restoreFromBackup({
      version: 1,
      exportedAt: "2026-04-07T00:00:00.000Z",
      prompts: [],
      folders: [childFolder, parentFolder],
      versions: [],
    });

    expect(window.api.folder.insertDirect).toHaveBeenNthCalledWith(
      1,
      parentFolder,
    );
    expect(window.api.folder.insertDirect).toHaveBeenNthCalledWith(
      2,
      childFolder,
    );
  });

  it("restores a selective export file through the normal restore entry", async () => {
    const file = {
      name: "prompthub-export.json",
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          exportedAt: "2026-04-07T00:00:00.000Z",
          kind: "prompthub-export",
          payload: {
            exportedAt: "2026-04-07T00:00:00.000Z",
            folders: [],
            prompts: [
              {
                createdAt: "2026-04-07T00:00:00.000Z",
                currentVersion: 1,
                description: "Imported prompt",
                id: "prompt-1",
                isFavorite: false,
                isPinned: false,
                promptType: "text",
                systemPrompt: "System",
                tags: [],
                title: "Imported",
                updatedAt: "2026-04-07T00:00:00.000Z",
                usageCount: 0,
                userPrompt: "User",
                variables: [],
                version: 1,
              },
            ],
          },
          scope: {
            aiConfig: false,
            folders: true,
            images: false,
            prompts: true,
            settings: false,
            skills: false,
            versions: false,
          },
        }),
      ),
    } as unknown as File;

    await expect(restoreFromFile(file)).resolves.toEqual(
      expect.objectContaining({
        folders: 0,
        prompts: 0,
        skillFiles: 0,
        skillVersions: 0,
        skills: 0,
        versions: 0,
      }),
    );
    expect(clearDatabaseMock).toHaveBeenCalledTimes(1);
  });

  it("embeds a full re-importable snapshot into selective ZIP exports and includes video scope", async () => {
    getAllPromptsMock.mockResolvedValue([
      {
        id: "prompt-zip-1",
        title: "ZIP Prompt",
        description: "Prompt with media",
        systemPrompt: "System",
        userPrompt: "User",
        variables: [],
        tags: [],
        folderId: "folder-zip-1",
        createdAt: "2026-04-21T00:00:00.000Z",
        updatedAt: "2026-04-21T00:00:00.000Z",
        version: 1,
        currentVersion: 1,
        usageCount: 0,
        isFavorite: false,
        isPinned: false,
        promptType: "text",
        images: ["image-zip.png"],
        videos: ["video-zip.mp4"],
      },
    ]);
    getAllFoldersMock.mockResolvedValue([
      {
        id: "folder-zip-1",
        name: "ZIP Folder",
        parentId: null,
        order: 0,
        createdAt: "2026-04-21T00:00:00.000Z",
        updatedAt: "2026-04-21T00:00:00.000Z",
      },
    ]);
    installWindowMocks({
      electron: {
        getImageSize: vi.fn().mockResolvedValue(12),
        readImageBase64: vi.fn().mockResolvedValue("image-base64"),
        getVideoSize: vi.fn().mockResolvedValue(24),
        readVideoBase64: vi.fn().mockResolvedValue("video-base64"),
      },
      api: {
        version: {
          getAll: vi.fn().mockResolvedValue([
            {
              id: "version-zip-1",
              promptId: "prompt-zip-1",
              version: 1,
              userPrompt: "User",
              variables: [],
              createdAt: "2026-04-21T00:00:00.000Z",
            },
          ]),
        },
        skill: {
          getAll: vi.fn().mockResolvedValue([
            {
              id: "skill-zip-1",
              name: "writer",
              protocol_type: "skill",
              is_favorite: false,
              created_at: 1,
              updated_at: 1,
            },
          ]),
          versionGetAll: vi.fn().mockResolvedValue([]),
          readLocalFiles: vi.fn().mockResolvedValue([
            {
              path: "SKILL.md",
              content: "# Writer",
              isDirectory: false,
            },
          ]),
        },
        rules: {
          list: vi.fn().mockResolvedValue([]),
          read: vi.fn(),
        },
      },
    });
    getAiConfigSnapshotMock.mockReturnValue({ aiProvider: "openai" });
    getSettingsStateSnapshotMock.mockReturnValue({
      state: { language: "zh" },
      settingsUpdatedAt: "2026-04-21T00:00:00.000Z",
    });

    await downloadSelectiveExport({
      prompts: true,
      folders: true,
      versions: true,
      images: true,
      videos: true,
      aiConfig: true,
      settings: true,
      rules: false,
      skills: true,
    });

    expect(window.electron.exportZip).toHaveBeenCalledTimes(1);
    const exportZipArg = window.electron.exportZip.mock.calls[0]?.[0] as {
      scope: {
        videos?: boolean;
        exportJson?: string;
      };
    };
    expect(exportZipArg.scope.videos).toBe(true);
    const embedded = JSON.parse(String(exportZipArg.scope.exportJson)) as {
      kind: string;
      payload: {
        prompts: Array<{ title: string; images?: string[]; videos?: string[] }>;
        folders: Array<{ name: string }>;
        versions: Array<{ promptId: string }>;
        images?: Record<string, string>;
        videos?: Record<string, string>;
        skills?: Array<{ name: string }>;
        skillFiles?: Record<
          string,
          Array<{ relativePath: string; content: string }>
        >;
        settingsUpdatedAt?: string;
      };
    };

    expect(embedded.kind).toBe("prompthub-export");
    expect(embedded.payload.prompts).toEqual([
      expect.objectContaining({
        title: "ZIP Prompt",
        images: ["image-zip.png"],
        videos: ["video-zip.mp4"],
      }),
    ]);
    expect(embedded.payload.folders).toEqual([
      expect.objectContaining({ name: "ZIP Folder" }),
    ]);
    expect(embedded.payload.versions).toEqual([
      expect.objectContaining({ promptId: "prompt-zip-1" }),
    ]);
    expect(embedded.payload.images).toEqual({
      "image-zip.png": "image-base64",
    });
    expect(embedded.payload.videos).toEqual({
      "video-zip.mp4": "video-base64",
    });
    expect(embedded.payload.skills).toEqual([
      expect.objectContaining({ name: "writer" }),
    ]);
    expect(embedded.payload.skillFiles).toEqual({
      "skill-zip-1": [{ relativePath: "SKILL.md", content: "# Writer" }],
    });
    expect(embedded.payload.settingsUpdatedAt).toBe("2026-04-21T00:00:00.000Z");
  });

  it("rejects arbitrary JSON files without clearing existing data", async () => {
    const file = {
      name: "random.json",
      text: vi
        .fn()
        .mockResolvedValue(
          JSON.stringify({ anything: true, nested: { value: 1 } }),
        ),
    } as unknown as File;

    await expect(restoreFromFile(file)).rejects.toThrow(
      "Invalid PromptHub backup: unsupported file format. Please import a PromptHub backup/export file.",
    );

    expect(clearDatabaseMock).not.toHaveBeenCalled();
    expect(window.api.skill.deleteAll).not.toHaveBeenCalled();
  });

  it.each([
    "JSON Parse error: Unterminated string",
    "Unexpected end of JSON input",
  ])("formats truncated JSON import errors for users: %s", (message) => {
    expect(formatBackupImportError(new Error(message))).toBe(
      "备份文件不是完整 JSON，可能在导出、复制或上传过程中被截断。请重新从 PromptHub 导出完整的 JSON、PHUB 或 ZIP 文件后再导入。",
    );
  });

  it("rejects an empty backup payload before clearing existing data", async () => {
    const file = {
      name: "empty-backup.phub",
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          kind: "prompthub-backup",
          exportedAt: "2026-04-18T00:00:00.000Z",
          payload: {
            exportedAt: "2026-04-18T00:00:00.000Z",
            prompts: [],
            folders: [],
            versions: [],
          },
        }),
      ),
    } as unknown as File;

    await expect(restoreFromFile(file)).rejects.toThrow(
      "Backup restore was blocked because the imported backup is empty.",
    );

    expect(clearDatabaseMock).not.toHaveBeenCalled();
    expect(window.api.skill.deleteAll).not.toHaveBeenCalled();
  });

  it("filters malformed prompt records in lenient mode and still imports valid data", async () => {
    const file = {
      name: "partially-broken-backup.json",
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          exportedAt: "2026-04-07T00:00:00.000Z",
          prompts: [
            { id: "prompt-bad" }, // missing required fields, should be dropped
            {
              createdAt: "2026-04-07T00:00:00.000Z",
              currentVersion: 1,
              id: "prompt-good",
              isFavorite: false,
              isPinned: false,
              tags: [],
              title: "Good",
              updatedAt: "2026-04-07T00:00:00.000Z",
              userPrompt: "Body",
              usageCount: 0,
              variables: [],
              version: 1,
            },
          ],
          folders: [],
          versions: [],
        }),
      ),
    } as unknown as File;

    const skipped = await restoreFromFile(file);
    expect(skipped.prompts).toBe(1);
    expect(skipped.folders).toBe(0);
    expect(clearDatabaseMock).toHaveBeenCalledTimes(1);
  });

  it("restores skills, skill versions, and skill files through the shared backup pipeline", async () => {
    window.api.skill.create.mockResolvedValue({
      id: "restored-skill-1",
      name: "writer",
    });

    await expect(
      restoreFromBackup({
        version: 1,
        exportedAt: "2026-04-07T00:00:00.000Z",
        prompts: [],
        folders: [],
        versions: [],
        skills: [
          {
            id: "skill-1",
            name: "writer",
            description: "Writer skill",
            content: "# Writer",
            instructions: "# Writer",
            protocol_type: "skill",
            version: "1.0.0",
            author: "PromptHub",
            tags: ["writing"],
            is_favorite: false,
            created_at: Date.parse("2026-04-07T00:00:00.000Z"),
            updated_at: Date.parse("2026-04-07T00:00:00.000Z"),
            currentVersion: 1,
          } as any,
        ],
        skillVersions: [
          {
            id: "version-1",
            skillId: "skill-1",
            version: 1,
            content: "# Writer",
            createdAt: "2026-04-07T00:00:00.000Z",
            source: "manual",
          } as any,
        ],
        skillFiles: {
          "skill-1": [
            {
              relativePath: "SKILL.md",
              content: "# Writer",
            },
          ],
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        folders: 0,
        prompts: 0,
        skillFiles: 0,
        skillVersions: 0,
        skills: 0,
        versions: 0,
      }),
    );

    expect(window.api.skill.deleteAll).toHaveBeenCalledTimes(1);
    expect(window.api.skill.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "writer",
        description: "Writer skill",
        content: "# Writer",
        instructions: "# Writer",
        currentVersion: 1,
      }),
      { skipInitialVersion: true },
    );
    expect(window.api.skill.insertVersionDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        skillId: "restored-skill-1",
        version: 1,
      }),
    );
    expect(window.api.skill.update).toHaveBeenCalledWith("restored-skill-1", {
      currentVersion: 2,
    });
    expect(window.api.skill.writeLocalFile).toHaveBeenCalledWith(
      "restored-skill-1",
      "SKILL.md",
      "# Writer",
      { skipVersionSnapshot: true },
    );
  });
});

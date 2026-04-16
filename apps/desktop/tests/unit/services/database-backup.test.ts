import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  exportDatabase,
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
        const request: { result?: unknown[]; onsuccess: (() => void) | null; onerror: (() => void) | null } = {
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
    getAllFoldersMock.mockResolvedValue([]);
    getAllPromptsMock.mockResolvedValue([]);
    getAiConfigSnapshotMock.mockReturnValue(undefined);
    getSettingsStateSnapshotMock.mockReturnValue(undefined);
    getDatabaseMock.mockResolvedValue({
      transaction: () => createTransactionMock(),
    });

    installWindowMocks();
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
    const imageNames = Array.from({ length: 502 }, (_, index) => `image-${index}.png`);
    const videoNames = Array.from({ length: 101 }, (_, index) => `video-${index}.mp4`);

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
      sortOrder: 1,
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
      created_at: "2026-04-07T00:00:00.000Z",
      updated_at: "2026-04-07T00:00:00.000Z",
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
            { path: "notes/example.md", content: "Example", isDirectory: false },
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
    );
    expect(window.api.skill.writeLocalFile).toHaveBeenCalledWith(
      "restored-skill-1",
      "notes/example.md",
      "Example",
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

    await expect(restoreFromFile(file)).resolves.toBeUndefined();
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
            created_at: "2026-04-07T00:00:00.000Z",
            updated_at: "2026-04-07T00:00:00.000Z",
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
    ).resolves.toBeUndefined();

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
    );
  });
});

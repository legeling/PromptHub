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

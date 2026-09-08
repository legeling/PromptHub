import { beforeEach, describe, expect, it, vi } from "vitest";

import { restoreFromBackup } from "../../../src/renderer/services/database-backup";
import { installWindowMocks } from "../../helpers/window";

const clearDatabaseMock = vi.fn().mockResolvedValue(undefined);
const getDatabaseMock = vi.fn();

vi.mock("../../../src/renderer/services/database", () => ({
  clearDatabase: () => clearDatabaseMock(),
  getAllFolders: vi.fn().mockResolvedValue([]),
  getAllPrompts: vi.fn().mockResolvedValue([]),
  getDatabase: () => getDatabaseMock(),
  listPromptRelations: vi.fn().mockResolvedValue([]),
  listOutputFormatItems: vi.fn().mockResolvedValue([]),
}));

function createTransactionMock() {
  const transaction = {
    error: null,
    objectStore: () => ({ add: vi.fn(), clear: vi.fn(), getAll: vi.fn() }),
    oncomplete: null as (() => void) | null,
    onerror: null as (() => void) | null,
  };
  queueMicrotask(() => transaction.oncomplete?.());
  return transaction;
}

describe("database-backup skill restore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    getDatabaseMock.mockResolvedValue({
      transaction: () => createTransactionMock(),
    });
    installWindowMocks();
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
            local_repo_path: "/previous-machine/skills/writer/repo",
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
          "skill-1": [{ relativePath: "SKILL.md", content: "# Writer" }],
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
    const [createPayload] = window.api.skill.create.mock.calls[0];
    expect(createPayload).not.toHaveProperty("local_repo_path");
    expect(window.api.skill.insertVersionDirect).toHaveBeenCalledWith(
      expect.objectContaining({ skillId: "restored-skill-1", version: 1 }),
    );
    expect(window.api.skill.update).toHaveBeenCalledWith("restored-skill-1", {
      currentVersion: 2,
    });
    expect(window.api.skill.replaceFilesSnapshot).toHaveBeenCalledWith(
      "restored-skill-1",
      [{ relativePath: "SKILL.md", content: "# Writer" }],
    );
  });
});

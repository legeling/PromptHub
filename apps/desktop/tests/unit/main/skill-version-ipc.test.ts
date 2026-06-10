import { beforeEach, describe, expect, it, vi } from "vitest";

const handleMock = vi.fn();
const deleteAllLocalReposMock = vi.fn().mockResolvedValue(undefined);
const readCurrentFilesSnapshotMock = vi.fn().mockResolvedValue([
  { relativePath: "SKILL.md", content: "# Current Skill" },
]);
const replaceRepoFilesMock = vi.fn().mockResolvedValue("/managed/skill-1/repo");
const computeRepoDirectoryFingerprintMock = vi
  .fn()
  .mockResolvedValue("fingerprint-after-rollback");

vi.mock("electron", () => ({
  ipcMain: {
    handle: handleMock,
  },
}));

vi.mock("../../../src/main/services/skill-installer", () => ({
  SkillInstaller: {
    deleteAllLocalRepos: deleteAllLocalReposMock,
  },
}));

vi.mock("../../../src/main/ipc/skill/shared", () => ({
  readCurrentFilesSnapshot: readCurrentFilesSnapshotMock,
  replaceRepoFiles: replaceRepoFilesMock,
}));

vi.mock("../../../src/main/services/skill-repo-sync", () => ({
  computeRepoDirectoryFingerprint: computeRepoDirectoryFingerprintMock,
}));

type RegisteredHandlers = Record<string, (...args: unknown[]) => unknown>;

function createSkillDbMock() {
  return {
    getVersions: vi.fn().mockReturnValue([]),
    getVersion: vi.fn().mockReturnValue(null),
    getById: vi.fn().mockReturnValue(null),
    createVersion: vi.fn(),
    update: vi.fn(),
    deleteVersion: vi.fn(),
    deleteAll: vi.fn(),
    insertVersionDirect: vi.fn(),
  };
}

async function setupSkillVersionIpc() {
  vi.resetModules();
  handleMock.mockReset();
  deleteAllLocalReposMock.mockClear();
  readCurrentFilesSnapshotMock.mockClear();
  replaceRepoFilesMock.mockClear();
  computeRepoDirectoryFingerprintMock.mockClear();
  replaceRepoFilesMock.mockResolvedValue("/managed/skill-1/repo");
  computeRepoDirectoryFingerprintMock.mockResolvedValue(
    "fingerprint-after-rollback",
  );

  const [{ registerSkillVersionHandlers }, { IPC_CHANNELS }] = await Promise.all([
    import("../../../src/main/ipc/skill/version-handlers"),
    import("@prompthub/shared/constants/ipc-channels"),
  ]);

  const db = createSkillDbMock();
  registerSkillVersionHandlers({ db } as never);

  const handlers = Object.fromEntries(
    handleMock.mock.calls.map(([channel, handler]) => [channel, handler]),
  ) as RegisteredHandlers;

  return { db, handlers, IPC_CHANNELS };
}

describe("skill version IPC", () => {
  beforeEach(() => {
    handleMock.mockReset();
    deleteAllLocalReposMock.mockClear();
    readCurrentFilesSnapshotMock.mockClear();
    replaceRepoFilesMock.mockClear();
    computeRepoDirectoryFingerprintMock.mockClear();
  });

  it("preserves source identity and refreshes directory fingerprint when rolling back", async () => {
    const { db, handlers, IPC_CHANNELS } = await setupSkillVersionIpc();
    const currentSkill = {
      id: "skill-1",
      name: "Writer",
      content: "# Current Skill",
      instructions: "# Current Skill",
      source_id: "source-stable",
      directory_fingerprint: "fingerprint-before-rollback",
    };
    const targetVersion = {
      id: "version-1",
      skillId: "skill-1",
      version: 2,
      content: "# Restored Skill",
      filesSnapshot: [
        { relativePath: "SKILL.md", content: "# Restored Skill" },
        { relativePath: "assets/icon.svg", content: "<svg />" },
      ],
      createdAt: "2026-04-16T10:20:30.000Z",
    };
    db.getVersion.mockReturnValue(targetVersion);
    db.getById.mockReturnValue(currentSkill);
    db.update.mockReturnValue({
      ...currentSkill,
      content: "# Restored Skill",
      instructions: "# Restored Skill",
      directory_fingerprint: "fingerprint-after-rollback",
    });

    const result = await handlers[IPC_CHANNELS.SKILL_VERSION_ROLLBACK](
      null,
      "skill-1",
      2,
    );

    expect(readCurrentFilesSnapshotMock).toHaveBeenCalledWith(db, "skill-1");
    expect(db.createVersion).toHaveBeenCalledWith(
      "skill-1",
      "Rollback before restoring v2",
      [{ relativePath: "SKILL.md", content: "# Current Skill" }],
      currentSkill,
    );
    expect(replaceRepoFilesMock).toHaveBeenCalledWith(
      db,
      "skill-1",
      targetVersion.filesSnapshot,
    );
    expect(computeRepoDirectoryFingerprintMock).toHaveBeenCalledWith(
      "/managed/skill-1/repo",
    );
    expect(db.update).toHaveBeenCalledWith("skill-1", {
      content: "# Restored Skill",
      instructions: "# Restored Skill",
      directory_fingerprint: "fingerprint-after-rollback",
    });
    expect(db.update.mock.calls[0][1]).not.toHaveProperty("source_id");
    expect(result).toEqual(
      expect.objectContaining({
        source_id: "source-stable",
        directory_fingerprint: "fingerprint-after-rollback",
      }),
    );
  });

  it("accepts ISO createdAt values for direct version restore", async () => {
    const { db, handlers, IPC_CHANNELS } = await setupSkillVersionIpc();

    const version = {
      id: "version-1",
      skillId: "skill-1",
      version: 2,
      content: "# Skill",
      filesSnapshot: [{ relativePath: "SKILL.md", content: "# Skill" }],
      createdAt: "2026-04-16T10:20:30.000Z",
    };

    await expect(
      handlers[IPC_CHANNELS.SKILL_INSERT_VERSION_DIRECT](null, version),
    ).resolves.toBeUndefined();

    expect(db.insertVersionDirect).toHaveBeenCalledWith(version);
  });

  it("rejects invalid createdAt values for direct version restore", async () => {
    const { handlers, IPC_CHANNELS } = await setupSkillVersionIpc();

    await expect(
      handlers[IPC_CHANNELS.SKILL_INSERT_VERSION_DIRECT](null, {
        id: "version-1",
        skillId: "skill-1",
        version: 2,
        createdAt: "not-a-date",
      }),
    ).rejects.toThrow(
      "skill:insertVersionDirect requires createdAt to be a valid ISO date string or finite timestamp",
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const handleMock = vi.fn();
const saveRemoteGitSkillToLocalRepoBySkillIdMock = vi
  .fn()
  .mockResolvedValue("/managed/writer/repo");
const saveRemoteZipSkillToLocalRepoBySkillIdMock = vi
  .fn()
  .mockResolvedValue("/managed/zip-skill/repo");
const computeRepoDirectoryFingerprintMock = vi
  .fn()
  .mockResolvedValue("fingerprint-after-copy");
const renameLocalRepoPathByPathMock = vi.fn().mockResolvedValue(true);
const writeLocalRepoFileByPathMock = vi.fn().mockResolvedValue(true);
const deleteLocalRepoFileByPathMock = vi.fn().mockResolvedValue(true);
const createLocalRepoDirByPathMock = vi.fn().mockResolvedValue(true);

vi.mock("electron", () => ({
  ipcMain: {
    handle: handleMock,
  },
}));

vi.mock("../../../src/main/services/skill-installer", () => ({
  SkillInstaller: {
    saveRemoteGitSkillToLocalRepoBySkillId:
      saveRemoteGitSkillToLocalRepoBySkillIdMock,
    saveRemoteZipSkillToLocalRepoBySkillId:
      saveRemoteZipSkillToLocalRepoBySkillIdMock,
    listLocalRepoFilesByPath: vi.fn().mockResolvedValue([]),
    readLocalRepoFileByPath: vi.fn().mockResolvedValue(null),
    readLocalRepoFilesByPath: vi.fn().mockResolvedValue([]),
    renameLocalRepoPathByPath: renameLocalRepoPathByPathMock,
    writeLocalRepoFileByPath: writeLocalRepoFileByPathMock,
    deleteLocalRepoFileByPath: deleteLocalRepoFileByPathMock,
    createLocalRepoDirByPath: createLocalRepoDirByPathMock,
    isManagedRepoPath: vi.fn().mockResolvedValue(true),
    materializeManagedRepoSymlink: vi.fn().mockResolvedValue(undefined),
    getPreferredLocalRepoPathForSkill: vi.fn(
      (skill: { id: string }) => `/managed/${skill.id}/repo`,
    ),
  },
}));

vi.mock("../../../src/main/services/skill-repo-sync", () => ({
  buildSkillSyncUpdateFromRepo: vi.fn(),
  computeRepoDirectoryFingerprint: computeRepoDirectoryFingerprintMock,
}));

vi.mock("../../../src/main/ipc/skill/shared", () => ({
  ensureLocalRepoPath: vi.fn().mockResolvedValue("/managed/writer/repo"),
  readCurrentFilesSnapshot: vi.fn().mockResolvedValue([]),
}));

type RegisteredHandlers = Record<
  string,
  (...args: unknown[]) => Promise<unknown>
>;

function createSkillDbMock() {
  return {
    getById: vi.fn(),
    update: vi.fn(),
    createVersion: vi.fn(),
  };
}

async function setupSkillLocalRepoIpc() {
  vi.resetModules();
  handleMock.mockReset();
  saveRemoteGitSkillToLocalRepoBySkillIdMock.mockClear();
  saveRemoteZipSkillToLocalRepoBySkillIdMock.mockClear();
  computeRepoDirectoryFingerprintMock.mockClear();
  renameLocalRepoPathByPathMock.mockClear();
  writeLocalRepoFileByPathMock.mockClear();
  deleteLocalRepoFileByPathMock.mockClear();
  createLocalRepoDirByPathMock.mockClear();

  const [{ registerSkillLocalRepoHandlers }, { IPC_CHANNELS }] =
    await Promise.all([
      import("../../../src/main/ipc/skill/local-repo-handlers"),
      import("@prompthub/shared/constants/ipc-channels"),
    ]);

  const db = createSkillDbMock();
  registerSkillLocalRepoHandlers({ db } as never);

  const handlers = Object.fromEntries(
    handleMock.mock.calls.map(([channel, handler]) => [channel, handler]),
  ) as RegisteredHandlers;

  return { db, handlers, IPC_CHANNELS };
}

describe("skill local repo IPC", () => {
  beforeEach(() => {
    handleMock.mockReset();
    saveRemoteGitSkillToLocalRepoBySkillIdMock.mockClear();
    saveRemoteZipSkillToLocalRepoBySkillIdMock.mockClear();
    computeRepoDirectoryFingerprintMock.mockClear();
    renameLocalRepoPathByPathMock.mockClear();
    writeLocalRepoFileByPathMock.mockClear();
    deleteLocalRepoFileByPathMock.mockClear();
    createLocalRepoDirByPathMock.mockClear();
  });

  it("saves a remote Git package to the managed repo and persists the fingerprint", async () => {
    const { db, handlers, IPC_CHANNELS } = await setupSkillLocalRepoIpc();
    const skill = {
      id: "skill-writer",
      name: "writer",
      source_url: "https://gitea.example.com/team/skills",
      source_directory: "skills/writer",
    };
    db.getById.mockReturnValue(skill);

    await expect(
      handlers[IPC_CHANNELS.SKILL_SAVE_REMOTE_GIT_TO_REPO](
        null,
        "skill-writer",
        {
          repoUrl: "https://gitea.example.com/team/skills",
          branch: "main",
          directory: "skills/writer",
        },
      ),
    ).resolves.toBe("/managed/writer/repo");

    expect(saveRemoteGitSkillToLocalRepoBySkillIdMock).toHaveBeenCalledWith(
      skill,
      {
        repoUrl: "https://gitea.example.com/team/skills",
        branch: "main",
        directory: "skills/writer",
      },
    );
    expect(computeRepoDirectoryFingerprintMock).toHaveBeenCalledWith(
      "/managed/writer/repo",
    );
    expect(db.update).toHaveBeenCalledWith("skill-writer", {
      local_repo_path: "/managed/writer/repo",
      directory_fingerprint: "fingerprint-after-copy",
    });
  });

  it("saves a remote zip package to the managed repo and persists the fingerprint", async () => {
    const { db, handlers, IPC_CHANNELS } = await setupSkillLocalRepoIpc();
    const skill = {
      id: "skill-gifgrep",
      name: "gifgrep",
      source_url: "https://clawhub.ai/clawhub/gifgrep",
    };
    db.getById.mockReturnValue(skill);

    await expect(
      handlers[IPC_CHANNELS.SKILL_SAVE_REMOTE_ZIP_TO_REPO](
        null,
        "skill-gifgrep",
        {
          zipUrl: "https://clawhub.ai/api/v1/download?slug=gifgrep",
        },
      ),
    ).resolves.toBe("/managed/zip-skill/repo");

    expect(saveRemoteZipSkillToLocalRepoBySkillIdMock).toHaveBeenCalledWith(
      skill,
      {
        zipUrl: "https://clawhub.ai/api/v1/download?slug=gifgrep",
      },
    );
    expect(computeRepoDirectoryFingerprintMock).toHaveBeenCalledWith(
      "/managed/zip-skill/repo",
    );
    expect(db.update).toHaveBeenCalledWith("skill-gifgrep", {
      local_repo_path: "/managed/zip-skill/repo",
      directory_fingerprint: "fingerprint-after-copy",
    });
  });

  it.each([
    {
      name: "empty skill id",
      skillId: "",
      options: { repoUrl: "https://gitea.example.com/team/skills" },
      expectedError: /requires a non-empty skillId/,
    },
    {
      name: "missing repo URL",
      skillId: "skill-writer",
      options: {},
      expectedError: /requires a non-empty repoUrl/,
    },
    {
      name: "blank repo URL",
      skillId: "skill-writer",
      options: { repoUrl: " " },
      expectedError: /requires a non-empty repoUrl/,
    },
  ])("rejects invalid saveRemoteGitToRepo input: $name", async (input) => {
    const { handlers, IPC_CHANNELS } = await setupSkillLocalRepoIpc();

    await expect(
      handlers[IPC_CHANNELS.SKILL_SAVE_REMOTE_GIT_TO_REPO](
        null,
        input.skillId,
        input.options,
      ),
    ).rejects.toThrow(input.expectedError);

    expect(saveRemoteGitSkillToLocalRepoBySkillIdMock).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "empty skill id",
      skillId: "",
      options: { zipUrl: "https://clawhub.ai/api/v1/download?slug=gifgrep" },
      expectedError: /requires a non-empty skillId/,
    },
    {
      name: "missing zip URL",
      skillId: "skill-gifgrep",
      options: {},
      expectedError: /requires a non-empty zipUrl/,
    },
    {
      name: "blank zip URL",
      skillId: "skill-gifgrep",
      options: { zipUrl: " " },
      expectedError: /requires a non-empty zipUrl/,
    },
  ])("rejects invalid saveRemoteZipToRepo input: $name", async (input) => {
    const { handlers, IPC_CHANNELS } = await setupSkillLocalRepoIpc();

    await expect(
      handlers[IPC_CHANNELS.SKILL_SAVE_REMOTE_ZIP_TO_REPO](
        null,
        input.skillId,
        input.options,
      ),
    ).rejects.toThrow(input.expectedError);

    expect(saveRemoteZipSkillToLocalRepoBySkillIdMock).not.toHaveBeenCalled();
  });

  it("rejects saveRemoteGitToRepo when the skill does not exist", async () => {
    const { db, handlers, IPC_CHANNELS } = await setupSkillLocalRepoIpc();
    db.getById.mockReturnValue(null);

    await expect(
      handlers[IPC_CHANNELS.SKILL_SAVE_REMOTE_GIT_TO_REPO](null, "missing", {
        repoUrl: "https://gitea.example.com/team/skills",
      }),
    ).rejects.toThrow(/Skill not found: missing/);

    expect(saveRemoteGitSkillToLocalRepoBySkillIdMock).not.toHaveBeenCalled();
  });

  it.each([
    {
      channel: "SKILL_WRITE_LOCAL_FILE",
      invokeArgs: ["skill-writer", "scripts/main.ts", "updated content"],
      fsMock: writeLocalRepoFileByPathMock,
      expectedFsArgs: ["/managed/skill-writer/repo", "scripts/main.ts", "updated content"],
    },
    {
      channel: "SKILL_RENAME_LOCAL_PATH",
      invokeArgs: ["skill-writer", "scripts/old.ts", "scripts/new.ts"],
      fsMock: renameLocalRepoPathByPathMock,
      expectedFsArgs: ["/managed/skill-writer/repo", "scripts/old.ts", "scripts/new.ts"],
    },
    {
      channel: "SKILL_DELETE_LOCAL_FILE",
      invokeArgs: ["skill-writer", "scripts/main.ts"],
      fsMock: deleteLocalRepoFileByPathMock,
      expectedFsArgs: ["/managed/skill-writer/repo", "scripts/main.ts"],
    },
    {
      channel: "SKILL_CREATE_LOCAL_DIR",
      invokeArgs: ["skill-writer", "scripts"],
      fsMock: createLocalRepoDirByPathMock,
      expectedFsArgs: ["/managed/skill-writer/repo", "scripts"],
    },
  ])(
    "does not create an automatic version snapshot for local repo file operation $channel",
    async ({ channel, invokeArgs, fsMock, expectedFsArgs }) => {
      const { db, handlers, IPC_CHANNELS } = await setupSkillLocalRepoIpc();
      db.getById.mockReturnValue({
        id: "skill-writer",
        name: "writer",
        local_repo_path: "/managed/skill-writer/repo",
      });

      await expect(
        handlers[IPC_CHANNELS[channel as keyof typeof IPC_CHANNELS]](
          null,
          ...invokeArgs,
        ),
      ).resolves.toBe(true);

      expect(fsMock).toHaveBeenCalledWith(...expectedFsArgs);
      expect(db.createVersion).not.toHaveBeenCalled();
    },
  );

  it("updates skill metadata for SKILL.md saves without creating an automatic version", async () => {
    const { db, handlers, IPC_CHANNELS } = await setupSkillLocalRepoIpc();
    db.getById.mockReturnValue({
      id: "skill-writer",
      name: "writer",
      local_repo_path: "/managed/skill-writer/repo",
    });
    computeRepoDirectoryFingerprintMock.mockResolvedValueOnce(
      "fingerprint-after-save",
    );

    await handlers[IPC_CHANNELS.SKILL_WRITE_LOCAL_FILE](
      null,
      "skill-writer",
      "SKILL.md",
      "# Updated",
    );

    expect(writeLocalRepoFileByPathMock).toHaveBeenCalledWith(
      "/managed/skill-writer/repo",
      "SKILL.md",
      "# Updated",
    );
    expect(db.update).toHaveBeenCalledWith("skill-writer", {
      content: "# Updated",
      instructions: "# Updated",
      directory_fingerprint: "fingerprint-after-save",
    });
    expect(db.createVersion).not.toHaveBeenCalled();
  });
});

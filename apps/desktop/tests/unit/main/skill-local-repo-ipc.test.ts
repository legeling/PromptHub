import { beforeEach, describe, expect, it, vi } from "vitest";
import { SKILL_PACKAGE_FINGERPRINT_ALGORITHM } from "@prompthub/shared/utils/skill-source-update";

vi.mock("@prompthub/core/runtime-paths", () => ({
  getRuntimeStorageContext: () => ({ localAuthority: "database-catalog" }),
}));

const handleMock = vi.fn();
const saveRemoteGitSkillToLocalRepoBySkillIdMock = vi
  .fn()
  .mockResolvedValue("/managed/writer/repo");
const saveRemoteZipSkillToLocalRepoBySkillIdMock = vi
  .fn()
  .mockResolvedValue("/managed/zip-skill/repo");
const getRemoteGitSkillPackageFingerprintMock = vi
  .fn()
  .mockResolvedValue("remote-package-fingerprint");
const getRemoteGitSkillPackageSnapshotMock = vi.fn().mockResolvedValue({
  content: "# Remote writer\n",
  directoryFingerprint: "remote-package-fingerprint",
});
const getRemoteZipSkillPackageSnapshotMock = vi.fn().mockResolvedValue({
  content: "# Remote ZIP writer\n",
  directoryFingerprint: "remote-zip-package-fingerprint",
});
const getLocalSkillPackageSnapshotMock = vi.fn().mockResolvedValue({
  content: "# Local writer\n",
  directoryFingerprint: "local-package-fingerprint",
});
const computeRepoDirectoryFingerprintMock = vi
  .fn()
  .mockResolvedValue("fingerprint-after-copy");
const validateMaterializedSkillPackageMock = vi.fn().mockResolvedValue({
  fileCount: 1,
  totalBytes: 10,
});
const isManagedRepoPathMock = vi.fn().mockResolvedValue(true);
const ensureLocalRepoPathMock = vi
  .fn()
  .mockResolvedValue("/managed/writer/repo");
const renameLocalRepoPathByPathMock = vi.fn().mockResolvedValue(true);
const writeLocalRepoFileByPathMock = vi.fn().mockResolvedValue(true);
const deleteLocalRepoFileByPathMock = vi.fn().mockResolvedValue(true);
const createLocalRepoDirByPathMock = vi.fn().mockResolvedValue(true);
const { SkillSafetyReviewRequiredErrorMock } = vi.hoisted(() => ({
  SkillSafetyReviewRequiredErrorMock: class extends Error {
    constructor(
      readonly report: unknown,
      readonly packageFingerprint: string,
      readonly sourceKey: string,
    ) {
      super("SAFETY_REVIEW_REQUIRED");
    }
  },
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: handleMock,
  },
}));

vi.mock("../../../src/main/services/skill-installer", () => ({
  SkillSafetyReviewRequiredError: SkillSafetyReviewRequiredErrorMock,
  SkillInstaller: {
    saveRemoteGitSkillToLocalRepoBySkillId:
      saveRemoteGitSkillToLocalRepoBySkillIdMock,
    saveRemoteZipSkillToLocalRepoBySkillId:
      saveRemoteZipSkillToLocalRepoBySkillIdMock,
    getRemoteGitSkillPackageFingerprint:
      getRemoteGitSkillPackageFingerprintMock,
    getRemoteGitSkillPackageSnapshot: getRemoteGitSkillPackageSnapshotMock,
    getRemoteZipSkillPackageSnapshot: getRemoteZipSkillPackageSnapshotMock,
    getLocalSkillPackageSnapshot: getLocalSkillPackageSnapshotMock,
    listLocalRepoFilesByPath: vi.fn().mockResolvedValue([]),
    readLocalRepoFileByPath: vi.fn().mockResolvedValue(null),
    readLocalRepoFilesByPath: vi.fn().mockResolvedValue([]),
    renameLocalRepoPathByPath: renameLocalRepoPathByPathMock,
    writeLocalRepoFileByPath: writeLocalRepoFileByPathMock,
    deleteLocalRepoFileByPath: deleteLocalRepoFileByPathMock,
    createLocalRepoDirByPath: createLocalRepoDirByPathMock,
    isManagedRepoPath: isManagedRepoPathMock,
    materializeManagedRepoSymlink: vi.fn().mockResolvedValue(undefined),
    getPreferredLocalRepoPathForSkill: vi.fn(
      (skill: { id: string }) => `/managed/${skill.id}/repo`,
    ),
  },
}));

vi.mock("../../../src/main/services/skill-update-safety", () => ({
  SkillSafetyReviewRequiredError: SkillSafetyReviewRequiredErrorMock,
}));

vi.mock("../../../src/main/services/skill-repo-sync", () => ({
  buildSkillSyncUpdateFromRepo: vi.fn(),
  computeRepoDirectoryFingerprint: computeRepoDirectoryFingerprintMock,
}));

vi.mock("../../../src/main/services/skill-package-validation", () => ({
  validateMaterializedSkillPackage: validateMaterializedSkillPackageMock,
}));

vi.mock("../../../src/main/ipc/skill/shared", () => ({
  ensureLocalRepoPath: ensureLocalRepoPathMock,
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
  getRemoteGitSkillPackageFingerprintMock.mockClear();
  getRemoteGitSkillPackageSnapshotMock.mockClear();
  getRemoteZipSkillPackageSnapshotMock.mockClear();
  getLocalSkillPackageSnapshotMock.mockClear();
  computeRepoDirectoryFingerprintMock.mockClear();
  validateMaterializedSkillPackageMock.mockClear();
  isManagedRepoPathMock.mockReset();
  isManagedRepoPathMock.mockResolvedValue(true);
  ensureLocalRepoPathMock.mockReset();
  ensureLocalRepoPathMock.mockResolvedValue("/managed/writer/repo");
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
    getRemoteGitSkillPackageFingerprintMock.mockClear();
    getRemoteGitSkillPackageSnapshotMock.mockClear();
    getRemoteZipSkillPackageSnapshotMock.mockClear();
    getLocalSkillPackageSnapshotMock.mockClear();
    computeRepoDirectoryFingerprintMock.mockClear();
    validateMaterializedSkillPackageMock.mockClear();
    isManagedRepoPathMock.mockReset();
    isManagedRepoPathMock.mockResolvedValue(true);
    ensureLocalRepoPathMock.mockReset();
    ensureLocalRepoPathMock.mockResolvedValue("/managed/writer/repo");
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
    ).resolves.toEqual({
      status: "saved",
      repoPath: "/managed/writer/repo",
    });

    expect(saveRemoteGitSkillToLocalRepoBySkillIdMock).toHaveBeenCalledWith(
      skill,
      {
        repoUrl: "https://gitea.example.com/team/skills",
        branch: "main",
        directory: "skills/writer",
        safetyScan: undefined,
        approvedPackageFingerprint: undefined,
      },
    );
    expect(computeRepoDirectoryFingerprintMock).toHaveBeenCalledWith(
      "/managed/writer/repo",
    );
    expect(db.update).toHaveBeenCalledWith("skill-writer", {
      local_repo_path: "/managed/writer/repo",
      directory_fingerprint: "fingerprint-after-copy",
      fingerprint_algorithm: SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
    });
  });

  it("computes a remote Git package fingerprint without saving the package", async () => {
    const { handlers, IPC_CHANNELS } = await setupSkillLocalRepoIpc();

    await expect(
      handlers[IPC_CHANNELS.SKILL_GET_REMOTE_GIT_PACKAGE_FINGERPRINT](null, {
        repoUrl: "https://github.com/legeling/spec-init",
        branch: "main",
        directory: "skills/spec-init",
        skillName: "spec-init",
      }),
    ).resolves.toBe("remote-package-fingerprint");

    expect(getRemoteGitSkillPackageFingerprintMock).toHaveBeenCalledWith({
      repoUrl: "https://github.com/legeling/spec-init",
      branch: "main",
      directory: "skills/spec-init",
      skillName: "spec-init",
    });
    expect(saveRemoteGitSkillToLocalRepoBySkillIdMock).not.toHaveBeenCalled();
  });

  it("returns a remote Git content and fingerprint snapshot without saving", async () => {
    const { handlers, IPC_CHANNELS } = await setupSkillLocalRepoIpc();
    const options = {
      repoUrl: "http://192.168.10.20/team/skills",
      branch: "main",
      skillName: "writer",
    };

    await expect(
      handlers[IPC_CHANNELS.SKILL_GET_REMOTE_GIT_PACKAGE_SNAPSHOT](
        null,
        options,
      ),
    ).resolves.toEqual({
      content: "# Remote writer\n",
      directoryFingerprint: "remote-package-fingerprint",
    });
    expect(getRemoteGitSkillPackageSnapshotMock).toHaveBeenCalledWith(options);
    expect(saveRemoteGitSkillToLocalRepoBySkillIdMock).not.toHaveBeenCalled();
  });

  it.each([
    "skill:getRemoteGitPackageFingerprint",
    "skill:getRemoteGitPackageSnapshot",
  ])(
    "rejects a non-string remote Git package selector for %s",
    async (channel) => {
      const { handlers } = await setupSkillLocalRepoIpc();
      await expect(
        handlers[channel](null, {
          repoUrl: "https://github.com/team/skills",
          skillName: 42,
        }),
      ).rejects.toThrow(/skillName to be a string/);
    },
  );

  it.each([undefined, {}, { repoUrl: " " }])(
    "rejects invalid remote Git snapshot options: %j",
    async (options) => {
      const { handlers, IPC_CHANNELS } = await setupSkillLocalRepoIpc();
      await expect(
        handlers[IPC_CHANNELS.SKILL_GET_REMOTE_GIT_PACKAGE_SNAPSHOT](
          null,
          options,
        ),
      ).rejects.toThrow(/requires a non-empty repoUrl/);
      expect(getRemoteGitSkillPackageSnapshotMock).not.toHaveBeenCalled();
    },
  );

  it("returns a remote ZIP content and fingerprint snapshot", async () => {
    const { handlers, IPC_CHANNELS } = await setupSkillLocalRepoIpc();
    const options = { zipUrl: "https://example.com/writer.zip" };

    await expect(
      handlers[IPC_CHANNELS.SKILL_GET_REMOTE_ZIP_PACKAGE_SNAPSHOT](
        null,
        options,
      ),
    ).resolves.toEqual({
      content: "# Remote ZIP writer\n",
      directoryFingerprint: "remote-zip-package-fingerprint",
    });
    expect(getRemoteZipSkillPackageSnapshotMock).toHaveBeenCalledWith(options);
  });

  it.each([undefined, {}, { zipUrl: " " }])(
    "rejects invalid remote ZIP snapshot options: %j",
    async (options) => {
      const { handlers, IPC_CHANNELS } = await setupSkillLocalRepoIpc();
      await expect(
        handlers[IPC_CHANNELS.SKILL_GET_REMOTE_ZIP_PACKAGE_SNAPSHOT](
          null,
          options,
        ),
      ).rejects.toThrow(/requires a non-empty zipUrl/);
      expect(getRemoteZipSkillPackageSnapshotMock).not.toHaveBeenCalled();
    },
  );

  it("computes a local source package fingerprint through a validated IPC", async () => {
    const { handlers, IPC_CHANNELS } = await setupSkillLocalRepoIpc();
    computeRepoDirectoryFingerprintMock.mockResolvedValueOnce(
      "local-package-fingerprint",
    );

    await expect(
      handlers[IPC_CHANNELS.SKILL_GET_LOCAL_PACKAGE_FINGERPRINT](
        null,
        "/tmp/local-writer",
      ),
    ).resolves.toBe("local-package-fingerprint");
    expect(validateMaterializedSkillPackageMock).toHaveBeenCalledWith(
      "/tmp/local-writer",
    );
    expect(computeRepoDirectoryFingerprintMock).toHaveBeenCalledWith(
      "/tmp/local-writer",
    );
    await expect(
      handlers[IPC_CHANNELS.SKILL_GET_LOCAL_PACKAGE_FINGERPRINT](null, ""),
    ).rejects.toThrow(/non-empty localPath/);
  });

  it("returns a validated local content and fingerprint snapshot", async () => {
    const { handlers, IPC_CHANNELS } = await setupSkillLocalRepoIpc();

    await expect(
      handlers[IPC_CHANNELS.SKILL_GET_LOCAL_PACKAGE_SNAPSHOT](
        null,
        "/external/writer",
      ),
    ).resolves.toEqual({
      content: "# Local writer\n",
      directoryFingerprint: "local-package-fingerprint",
    });
    expect(getLocalSkillPackageSnapshotMock).toHaveBeenCalledWith(
      "/external/writer",
    );
  });

  it.each([undefined, null, "", " "])(
    "rejects an invalid local snapshot path: %j",
    async (localPath) => {
      const { handlers, IPC_CHANNELS } = await setupSkillLocalRepoIpc();
      await expect(
        handlers[IPC_CHANNELS.SKILL_GET_LOCAL_PACKAGE_SNAPSHOT](
          null,
          localPath,
        ),
      ).rejects.toThrow(/requires a non-empty localPath/);
      expect(getLocalSkillPackageSnapshotMock).not.toHaveBeenCalled();
    },
  );

  it("rejects an invalid local source before computing a partial fingerprint", async () => {
    const { handlers, IPC_CHANNELS } = await setupSkillLocalRepoIpc();
    validateMaterializedSkillPackageMock.mockRejectedValueOnce(
      new Error("Skill package contains too many files"),
    );

    await expect(
      handlers[IPC_CHANNELS.SKILL_GET_LOCAL_PACKAGE_FINGERPRINT](
        null,
        "/tmp/oversized-writer",
      ),
    ).rejects.toThrow(/too many files/);
    expect(computeRepoDirectoryFingerprintMock).not.toHaveBeenCalled();
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
    ).resolves.toEqual({
      status: "saved",
      repoPath: "/managed/zip-skill/repo",
    });

    expect(saveRemoteZipSkillToLocalRepoBySkillIdMock).toHaveBeenCalledWith(
      skill,
      {
        zipUrl: "https://clawhub.ai/api/v1/download?slug=gifgrep",
        safetyScan: undefined,
        approvedPackageFingerprint: undefined,
      },
    );
    expect(computeRepoDirectoryFingerprintMock).toHaveBeenCalledWith(
      "/managed/zip-skill/repo",
    );
    expect(db.update).toHaveBeenCalledWith("skill-gifgrep", {
      local_repo_path: "/managed/zip-skill/repo",
      directory_fingerprint: "fingerprint-after-copy",
      fingerprint_algorithm: SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
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

  it("returns a structured review without changing DB metadata", async () => {
    const { db, handlers, IPC_CHANNELS } = await setupSkillLocalRepoIpc();
    const skill = {
      id: "skill-private",
      name: "private-skill",
      source_id: "gitea:team/private-skill",
    };
    const report = {
      level: "high-risk",
      summary: "Detected one high-risk finding",
      findings: [],
      recommendedAction: "review",
      scannedAt: 1,
      checkedFileCount: 4,
      scanMethod: "preflight",
    };
    db.getById.mockReturnValue(skill);
    saveRemoteGitSkillToLocalRepoBySkillIdMock.mockRejectedValueOnce(
      new SkillSafetyReviewRequiredErrorMock(
        report,
        "a".repeat(64),
        "gitea:team/private-skill",
      ),
    );

    await expect(
      handlers[IPC_CHANNELS.SKILL_SAVE_REMOTE_GIT_TO_REPO](
        null,
        "skill-private",
        { repoUrl: "https://gitea.example.com/team/private-skill.git" },
      ),
    ).resolves.toEqual({
      status: "safety-review-required",
      review: {
        report,
        packageFingerprint: "a".repeat(64),
        sourceKey: "gitea:team/private-skill",
      },
    });
    expect(computeRepoDirectoryFingerprintMock).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("validates and forwards an exact package approval fingerprint", async () => {
    const { db, handlers, IPC_CHANNELS } = await setupSkillLocalRepoIpc();
    const skill = { id: "skill-private", name: "private-skill" };
    db.getById.mockReturnValue(skill);

    await expect(
      handlers[IPC_CHANNELS.SKILL_SAVE_REMOTE_GIT_TO_REPO](
        null,
        "skill-private",
        {
          repoUrl: "https://gitea.example.com/team/private-skill.git",
          approvedPackageFingerprint: "A".repeat(64),
        },
      ),
    ).rejects.toThrow(/must be a SHA-256 hex string/);
    expect(saveRemoteGitSkillToLocalRepoBySkillIdMock).not.toHaveBeenCalled();

    await handlers[IPC_CHANNELS.SKILL_SAVE_REMOTE_GIT_TO_REPO](
      null,
      "skill-private",
      {
        repoUrl: "https://gitea.example.com/team/private-skill.git",
        approvedPackageFingerprint: "b".repeat(64),
      },
    );
    expect(saveRemoteGitSkillToLocalRepoBySkillIdMock).toHaveBeenCalledWith(
      skill,
      expect.objectContaining({
        approvedPackageFingerprint: "b".repeat(64),
      }),
    );
  });

  it.each([
    {
      channel: "SKILL_WRITE_LOCAL_FILE",
      invokeArgs: ["skill-writer", "scripts/main.ts", "updated content"],
      fsMock: writeLocalRepoFileByPathMock,
      expectedFsArgs: [
        "/managed/skill-writer/repo",
        "scripts/main.ts",
        "updated content",
      ],
    },
    {
      channel: "SKILL_RENAME_LOCAL_PATH",
      invokeArgs: ["skill-writer", "scripts/old.ts", "scripts/new.ts"],
      fsMock: renameLocalRepoPathByPathMock,
      expectedFsArgs: [
        "/managed/skill-writer/repo",
        "scripts/old.ts",
        "scripts/new.ts",
      ],
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

  it("writes linked external repo files without converting them to a managed path", async () => {
    const { db, handlers, IPC_CHANNELS } = await setupSkillLocalRepoIpc();
    db.getById.mockReturnValue({
      id: "skill-linked",
      name: "linked",
      local_repo_path: "/external/linked",
    });
    isManagedRepoPathMock.mockImplementation(async (repoPath: string) =>
      repoPath.startsWith("/managed/"),
    );
    ensureLocalRepoPathMock.mockResolvedValueOnce("/external/linked");

    await expect(
      handlers[IPC_CHANNELS.SKILL_WRITE_LOCAL_FILE](
        null,
        "skill-linked",
        "SKILL.md",
        "# Linked",
      ),
    ).resolves.toBe(true);

    expect(writeLocalRepoFileByPathMock).toHaveBeenCalledWith(
      "/external/linked",
      "SKILL.md",
      "# Linked",
    );
    expect(db.update).toHaveBeenCalledWith("skill-linked", {
      content: "# Linked",
      instructions: "# Linked",
      directory_fingerprint: "fingerprint-after-copy",
      fingerprint_algorithm: SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
    });
    expect(db.update).not.toHaveBeenCalledWith(
      "skill-linked",
      expect.objectContaining({
        local_repo_path: "/managed/skill-linked/repo",
      }),
    );
  });

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
      fingerprint_algorithm: SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
    });
    expect(db.createVersion).not.toHaveBeenCalled();
  });
});

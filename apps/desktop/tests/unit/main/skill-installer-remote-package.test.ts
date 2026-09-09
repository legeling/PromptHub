/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SkillSafetyReport } from "@prompthub/shared/types";

const mocks = vi.hoisted(() => {
  class GitExecutableUnavailableError extends Error {}
  return {
    GitExecutableUnavailableError,
    mkdtemp: vi.fn(),
    readdir: vi.fn(),
    readFile: vi.fn(),
    rm: vi.fn(),
    initSkillsDir: vi.fn(),
    fileExists: vi.fn(),
    isPathWithin: vi.fn(),
    resolveSingleSkillDirFromRepo: vi.fn(),
    resolveSkillDirFromRepo: vi.fn(),
    readLocalRepoFileBuffersByPath: vi.fn(),
    copyRepoByPathToDirectory: vi.fn(),
    saveToLocalRepoBySkillId: vi.fn(),
    fetchRemoteBytes: vi.fn(),
    gitClone: vi.fn(),
    validateMaterializedSkillPackage: vi.fn(),
    extractSkillZipArchive: vi.fn(),
    assertStagedRemoteSkillPackageSafe: vi.fn(),
  };
});

vi.mock("fs/promises", () => ({
  mkdtemp: mocks.mkdtemp,
  readdir: mocks.readdir,
  readFile: mocks.readFile,
  rm: mocks.rm,
}));

vi.mock("../../../src/main/services/skill-installer-internal", () => ({
  initSkillsDir: mocks.initSkillsDir,
  getSkillsDirAccessor: () => "/skills",
  fileExists: mocks.fileExists,
  isPathWithin: mocks.isPathWithin,
}));

vi.mock("../../../src/main/services/skill-installer-discovery", () => ({
  resolveSingleSkillDirFromRepo: mocks.resolveSingleSkillDirFromRepo,
  resolveSkillDirFromRepo: mocks.resolveSkillDirFromRepo,
}));

vi.mock("../../../src/main/services/skill-installer-repo", () => ({
  readLocalRepoFileBuffersByPath: mocks.readLocalRepoFileBuffersByPath,
  copyRepoByPathToDirectory: mocks.copyRepoByPathToDirectory,
}));

vi.mock("../../../src/main/services/skill-installer-replacement", () => ({
  saveToLocalRepoBySkillId: mocks.saveToLocalRepoBySkillId,
}));

vi.mock("../../../src/main/services/skill-installer-remote", () => ({
  fetchRemoteBytes: mocks.fetchRemoteBytes,
}));

vi.mock("../../../src/main/services/skill-installer-utils", () => ({
  GitExecutableUnavailableError: mocks.GitExecutableUnavailableError,
  gitClone: mocks.gitClone,
}));

vi.mock("../../../src/main/services/skill-package-validation", () => ({
  validateMaterializedSkillPackage: mocks.validateMaterializedSkillPackage,
}));

vi.mock("../../../src/main/services/skill-archive-extractor", () => ({
  extractSkillZipArchive: mocks.extractSkillZipArchive,
}));

vi.mock("../../../src/main/services/skill-update-safety", () => ({
  assertStagedRemoteSkillPackageSafe: mocks.assertStagedRemoteSkillPackageSafe,
}));

import {
  getRemoteGitSkillPackageFingerprint,
  getRemoteGitSkillPackageSnapshot,
  getRemoteZipSkillPackageSnapshot,
  saveRemoteGitSkillPackage,
  saveRemoteZipSkillPackage,
  type RemotePackageSkill,
} from "../../../src/main/services/skill-installer-remote-package";
import { GitExecutableUnavailableError } from "../../../src/main/services/skill-installer-utils";
import { SkillPackageTransportError } from "../../../src/main/services/skill-package-transport-error";

const safeReport: SkillSafetyReport = {
  level: "safe",
  summary: "Safe",
  findings: [],
  recommendedAction: "allow",
  scannedAt: 1,
  checkedFileCount: 1,
  scanMethod: "preflight",
};

function createRemoteSkill(
  overrides: Partial<RemotePackageSkill> = {},
): RemotePackageSkill {
  return {
    id: "skill-writer",
    name: "writer",
    source_id: undefined,
    source_url: "https://gitea.example.com/team/skills",
    source_directory: undefined,
    ...overrides,
  };
}

describe("remote Skill package adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mkdtemp.mockImplementation(async (prefix: string) => `${prefix}op`);
    mocks.readdir.mockResolvedValue([
      { name: "skills-main", isDirectory: () => true },
    ]);
    mocks.readFile.mockResolvedValue("# Writer\n\nFrom private Gitea\n");
    mocks.rm.mockResolvedValue(undefined);
    mocks.initSkillsDir.mockResolvedValue(undefined);
    mocks.fileExists.mockResolvedValue(true);
    mocks.isPathWithin.mockReturnValue(true);
    mocks.resolveSingleSkillDirFromRepo.mockResolvedValue("/clone/skill");
    mocks.resolveSkillDirFromRepo.mockResolvedValue("/clone/skill");
    mocks.readLocalRepoFileBuffersByPath.mockResolvedValue([
      { path: "SKILL.md", data: Buffer.from("# Writer\n") },
    ]);
    mocks.copyRepoByPathToDirectory.mockResolvedValue("/target/repo");
    mocks.saveToLocalRepoBySkillId.mockResolvedValue("/managed/repo");
    mocks.fetchRemoteBytes.mockResolvedValue(new Uint8Array([1]));
    mocks.gitClone.mockResolvedValue(undefined);
    mocks.validateMaterializedSkillPackage.mockResolvedValue({
      fileCount: 1,
      totalBytes: 9,
    });
    mocks.extractSkillZipArchive.mockResolvedValue(undefined);
    mocks.assertStagedRemoteSkillPackageSafe.mockResolvedValue(safeReport);
  });

  it("rejects malformed Git repository URLs before creating staging", async () => {
    await expect(
      saveRemoteGitSkillPackage(createRemoteSkill(), {
        repoUrl: "not-a-repository",
      }),
    ).rejects.toThrow(/Invalid git repository URL/);
    await expect(
      getRemoteGitSkillPackageFingerprint({ repoUrl: "not-a-repository" }),
    ).rejects.toThrow(/Invalid git repository URL/);
    expect(mocks.mkdtemp).not.toHaveBeenCalled();
  });

  it("builds fallback Git identity and persists to the managed repo", async () => {
    const result = await saveRemoteGitSkillPackage(createRemoteSkill(), {
      repoUrl: "https://gitea.example.com/team/skills",
    });

    expect(result).toBe("/managed/repo");
    expect(mocks.resolveSkillDirFromRepo).toHaveBeenCalled();
    expect(mocks.assertStagedRemoteSkillPackageSafe).not.toHaveBeenCalled();
    expect(mocks.rm).toHaveBeenCalled();
  });

  it("redacts credentials from fallback Git review identity", async () => {
    await saveRemoteGitSkillPackage(createRemoteSkill(), {
      repoUrl: "https://alice:secret@gitea.example.com/team/skills",
    });

    expect(mocks.assertStagedRemoteSkillPackageSafe).not.toHaveBeenCalled();
  });

  it("uses the exact source id for Git package review", async () => {
    await saveRemoteGitSkillPackage(
      createRemoteSkill({ source_id: " exact-git-source " }),
      { repoUrl: "https://gitea.example.com/team/skills" },
    );

    expect(mocks.assertStagedRemoteSkillPackageSafe).not.toHaveBeenCalled();
  });

  it("keeps package validation active when content safety scanning is disabled", async () => {
    mocks.assertStagedRemoteSkillPackageSafe.mockResolvedValueOnce(undefined);

    await saveRemoteGitSkillPackage(createRemoteSkill(), {
      repoUrl: "https://gitea.example.com/team/skills",
      safetyScan: { mode: "disabled" },
    });

    expect(mocks.validateMaterializedSkillPackage).toHaveBeenCalledTimes(1);
    expect(mocks.assertStagedRemoteSkillPackageSafe).not.toHaveBeenCalled();
  });

  it("uses an explicit or source fallback directory and target staging root", async () => {
    const onSafetyReport = vi.fn();
    const result = await saveRemoteGitSkillPackage(
      createRemoteSkill({ source_directory: "/skills/writer/" }),
      {
        repoUrl: "https://gitea.example.com/team/skills",
        branch: "main",
        directory: " ",
        targetRootDir: "/target",
        onSafetyReport,
      },
    );

    expect(result).toBe("/target/repo");
    expect(mocks.fileExists).toHaveBeenCalledWith(
      expect.stringMatching(/skills\/writer\/SKILL\.md$/),
    );
    expect(mocks.copyRepoByPathToDirectory).toHaveBeenCalledWith(
      expect.stringMatching(/skills\/writer$/),
      "repo",
      "/target",
      { ifExists: "error" },
    );
    expect(onSafetyReport).not.toHaveBeenCalled();
  });

  it("falls back to one bounded GitHub archive when Git is unavailable", async () => {
    mocks.gitClone.mockRejectedValueOnce(new GitExecutableUnavailableError());

    const result = await saveRemoteGitSkillPackage(createRemoteSkill(), {
      repoUrl: "https://github.com/acme/skills",
      branch: "release/v1",
      directory: "skills/writer",
      targetRootDir: "/target",
    });

    expect(result).toBe("/target/repo");
    expect(mocks.fetchRemoteBytes).toHaveBeenCalledTimes(1);
    expect(mocks.fetchRemoteBytes).toHaveBeenCalledWith(
      "https://github.com/acme/skills/archive/release%2Fv1.zip",
    );
    expect(mocks.extractSkillZipArchive).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.stringContaining("http-archive"),
    );
    expect(mocks.fileExists).toHaveBeenCalledWith(
      expect.stringMatching(/skills-main\/skills\/writer\/SKILL\.md$/),
    );
  });

  it("uses the same archive fallback for source snapshots", async () => {
    mocks.gitClone.mockRejectedValueOnce(new Error("Git TLS transport failed"));

    const result = await getRemoteGitSkillPackageSnapshot({
      repoUrl: "https://gitea.example.com/team/skills",
      branch: "main",
      directory: "skills/writer",
    });

    expect(result).toMatchObject({
      content: "# Writer\n",
      resolvedDirectory: "skills/writer",
    });
    expect(mocks.fetchRemoteBytes).toHaveBeenCalledWith(
      "https://gitea.example.com/team/skills/archive/main.zip",
    );
  });

  it("reports both failed transports without leaking source credentials", async () => {
    mocks.gitClone.mockRejectedValueOnce(new GitExecutableUnavailableError());
    mocks.fetchRemoteBytes.mockRejectedValueOnce(
      new Error("HTTP 503 for https://alice:secret@example.test/archive"),
    );

    const error = await saveRemoteGitSkillPackage(createRemoteSkill(), {
      repoUrl: "https://alice:secret@gitea.example.com/team/skills",
      branch: "main",
    }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(SkillPackageTransportError);
    expect(error).toMatchObject({ reason: "git-http-fallback-failed" });
    expect(mocks.fetchRemoteBytes).toHaveBeenCalledWith(
      "https://gitea.example.com/team/skills/archive/main.zip",
    );
    expect((error as Error).message).not.toContain("alice");
    expect((error as Error).message).not.toContain("secret");
  });

  it("does not convert SSH sources to anonymous HTTP when Git is missing", async () => {
    mocks.gitClone.mockRejectedValueOnce(new GitExecutableUnavailableError());

    const error = await saveRemoteGitSkillPackage(createRemoteSkill(), {
      repoUrl: "git@github.com:acme/private-skills.git",
      branch: "main",
    }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(SkillPackageTransportError);
    expect(error).toMatchObject({ reason: "git-unavailable" });
    expect(mocks.fetchRemoteBytes).not.toHaveBeenCalled();
  });

  it("does not hide a non-availability SSH Git failure", async () => {
    const gitError = new Error("SSH authentication failed");
    mocks.gitClone.mockRejectedValueOnce(gitError);

    await expect(
      saveRemoteGitSkillPackage(createRemoteSkill(), {
        repoUrl: "git@github.com:acme/private-skills.git",
      }),
    ).rejects.toBe(gitError);
    expect(mocks.fetchRemoteBytes).not.toHaveBeenCalled();
  });

  it("derives the bounded GitLab HEAD archive route", async () => {
    mocks.gitClone.mockRejectedValueOnce(new Error("Git network failed"));

    await saveRemoteGitSkillPackage(createRemoteSkill(), {
      repoUrl: "https://gitlab.com/acme/skills",
    });

    expect(mocks.fetchRemoteBytes).toHaveBeenCalledWith(
      "https://gitlab.com/acme/skills/-/archive/HEAD/skills-HEAD.zip",
    );
  });

  it.each([
    { name: "no root", entries: [] },
    {
      name: "a root file",
      entries: [{ name: "README.md", isDirectory: () => false }],
    },
  ])("rejects an archive with $name", async ({ entries }) => {
    mocks.gitClone.mockRejectedValueOnce(new GitExecutableUnavailableError());
    mocks.readdir.mockResolvedValueOnce(entries);

    await expect(
      saveRemoteGitSkillPackage(createRemoteSkill(), {
        repoUrl: "https://github.com/acme/skills",
      }),
    ).rejects.toThrow(/one repository root/);
  });

  it("keeps archive safety failures classified as invalid packages", async () => {
    mocks.gitClone.mockRejectedValueOnce(new GitExecutableUnavailableError());
    mocks.extractSkillZipArchive.mockRejectedValueOnce(
      new Error(
        "Path traversal detected: zip entry is outside package directory",
      ),
    );

    await expect(
      saveRemoteGitSkillPackage(createRemoteSkill(), {
        repoUrl: "https://github.com/acme/skills",
        branch: "main",
      }),
    ).rejects.toThrow(/Path traversal detected/);
  });

  it("rejects a requested Git directory without SKILL.md", async () => {
    mocks.fileExists.mockResolvedValue(false);

    await expect(
      saveRemoteGitSkillPackage(createRemoteSkill(), {
        repoUrl: "https://gitea.example.com/team/skills",
        directory: "missing",
      }),
    ).rejects.toThrow(/SKILL\.md not found/);
    expect(mocks.rm).toHaveBeenCalled();
  });

  it("rejects a requested Git directory that escapes the cloned repository", async () => {
    mocks.isPathWithin.mockReturnValue(false);

    await expect(
      saveRemoteGitSkillPackage(createRemoteSkill(), {
        repoUrl: "https://gitea.example.com/team/skills",
        directory: "../outside",
      }),
    ).rejects.toThrow(/Path traversal detected/);
    expect(mocks.fileExists).not.toHaveBeenCalled();
    expect(mocks.rm).toHaveBeenCalled();
  });

  it.each(["explicit", "auto"] as const)(
    "fingerprints a cloned Git package using the $case directory",
    async (directoryMode) => {
      mocks.rm.mockRejectedValueOnce(new Error("cleanup deferred"));
      const result = await getRemoteGitSkillPackageFingerprint({
        repoUrl: "https://gitea.example.com/team/skills",
        ...(directoryMode === "explicit" ? { directory: "writer" } : {}),
      });

      expect(result).toMatch(/^[a-f0-9]{64}$/);
      expect(
        directoryMode === "explicit"
          ? mocks.fileExists
          : mocks.resolveSingleSkillDirFromRepo,
      ).toHaveBeenCalled();
    },
  );

  it("returns SKILL.md and the package fingerprint from one validated Git snapshot", async () => {
    const result = await getRemoteGitSkillPackageSnapshot({
      repoUrl: "http://192.168.10.20/team/skills",
      branch: "main",
      directory: "tools/writer",
    });

    expect(result).toEqual(
      expect.objectContaining({
        content: "# Writer\n",
        directoryFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        resolvedDirectory: "tools/writer",
      }),
    );
    expect(mocks.readFile).not.toHaveBeenCalled();
    expect(mocks.gitClone).toHaveBeenCalledTimes(1);
    expect(mocks.validateMaterializedSkillPackage).toHaveBeenCalledTimes(1);
    expect(mocks.rm).toHaveBeenCalled();
  });

  it("keeps Git staging alive until the asynchronous snapshot read completes", async () => {
    let resolveFiles:
      | ((files: Array<{ path: string; data: Buffer }>) => void)
      | undefined;
    mocks.readLocalRepoFileBuffersByPath.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFiles = resolve;
        }),
    );

    const snapshotPromise = getRemoteGitSkillPackageSnapshot({
      repoUrl: "https://gitea.example.com/team/skills",
      directory: "tools/writer",
    });
    await vi.waitFor(() =>
      expect(mocks.readLocalRepoFileBuffersByPath).toHaveBeenCalled(),
    );
    expect(mocks.rm).not.toHaveBeenCalled();

    resolveFiles?.([{ path: "SKILL.md", data: Buffer.from("# Writer\n") }]);
    await expect(snapshotPromise).resolves.toMatchObject({
      content: "# Writer\n",
    });
    expect(mocks.rm).toHaveBeenCalled();
  });

  it("returns content and fingerprint from one extracted ZIP snapshot", async () => {
    const fetchArchive = vi.fn().mockResolvedValue(new Uint8Array([7, 8, 9]));

    const result = await getRemoteZipSkillPackageSnapshot(
      { zipUrl: "https://example.com/writer.zip" },
      fetchArchive,
    );

    expect(result).toEqual(
      expect.objectContaining({
        content: "# Writer\n",
        directoryFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(fetchArchive).toHaveBeenCalledTimes(1);
    expect(mocks.extractSkillZipArchive).toHaveBeenCalledTimes(1);
    expect(mocks.resolveSingleSkillDirFromRepo).toHaveBeenCalledTimes(1);
    expect(mocks.validateMaterializedSkillPackage).toHaveBeenCalledTimes(1);
    expect(mocks.rm).toHaveBeenCalled();
  });

  it("sanitizes a URL-derived Zip identity and uses the default fetcher", async () => {
    mocks.rm.mockRejectedValueOnce(new Error("cleanup deferred"));
    const result = await saveRemoteZipSkillPackage(createRemoteSkill(), {
      zipUrl:
        "https://user:secret@example.com/writer.zip?token=secret#fragment",
    });

    expect(result).toBe("/managed/repo");
    expect(mocks.fetchRemoteBytes).toHaveBeenCalledWith(
      "https://user:secret@example.com/writer.zip?token=secret#fragment",
    );
    expect(mocks.assertStagedRemoteSkillPackageSafe).not.toHaveBeenCalled();
  });

  it("falls back to Skill identity for a non-URL Zip source", async () => {
    const onSafetyReport = vi.fn();
    await saveRemoteZipSkillPackage(
      createRemoteSkill(),
      { zipUrl: "custom-package", onSafetyReport },
      vi.fn().mockResolvedValue(new Uint8Array([2])),
    );

    expect(mocks.assertStagedRemoteSkillPackageSafe).not.toHaveBeenCalled();
    expect(onSafetyReport).not.toHaveBeenCalled();
  });

  it("uses an exact source id for Zip review and rejects empty package URLs", async () => {
    await saveRemoteZipSkillPackage(
      createRemoteSkill({ source_id: " exact-source " }),
      { zipUrl: "https://example.com/writer.zip" },
      vi.fn().mockResolvedValue(new Uint8Array([3])),
    );
    expect(mocks.assertStagedRemoteSkillPackageSafe).not.toHaveBeenCalled();

    await expect(
      saveRemoteZipSkillPackage(createRemoteSkill(), { zipUrl: "  " }),
    ).rejects.toThrow(/URL is required/);
  });
});

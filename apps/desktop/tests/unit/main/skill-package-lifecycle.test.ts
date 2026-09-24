/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CreateSkillParams,
  RegistrySkill,
  Skill,
  SkillPackageOperationRequest,
  SkillSafetyReport,
  SkillVersion,
  UpdateSkillParams,
} from "@prompthub/shared/types";
import {
  SkillPackageLifecycleService,
  type SkillPackageLifecycleDependencies,
} from "../../../src/main/services/skill-package-lifecycle";
import {
  SkillSafetyBlockedError,
  SkillSafetyReviewRequiredError,
} from "../../../src/main/services/skill-update-safety";
import { SkillPackageTransportError } from "../../../src/main/services/skill-package-transport-error";

const registrySkill: RegistrySkill = {
  slug: "writer",
  name: "Writer",
  description: "Write better",
  category: "general",
  author: "PromptHub",
  source_id: "source-writer",
  source_url: "https://gitea.example.com/team/skills",
  source_branch: "main",
  source_directory: "skills/writer",
  tags: ["writing"],
  version: "2.0.0",
  content: "# Writer",
};

const report: SkillSafetyReport = {
  level: "high-risk",
  summary: "Review scripts",
  findings: [],
  recommendedAction: "review",
  scannedAt: 1,
  checkedFileCount: 2,
  scanMethod: "preflight",
};

const request: SkillPackageOperationRequest = {
  operation: "install",
  registrySkill,
  source: {
    kind: "remote-git",
    repoUrl: registrySkill.source_url,
    branch: registrySkill.source_branch,
    directory: registrySkill.source_directory,
  },
  content: registrySkill.content,
};

function asUpdateRequest(
  overrides: Partial<SkillPackageOperationRequest> = {},
): SkillPackageOperationRequest {
  return {
    ...request,
    operation: "update",
    skillId: "skill-writer",
    ...overrides,
  } as SkillPackageOperationRequest;
}

function skill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: "skill-writer",
    name: "writer",
    content: "# Writer",
    instructions: "# Writer",
    protocol_type: "skill",
    source_id: registrySkill.source_id,
    source_url: registrySkill.source_url,
    is_favorite: false,
    currentVersion: 0,
    created_at: 1,
    updated_at: 1,
    ...overrides,
  };
}

function createHarness() {
  let storedSkill: Skill | null = null;
  const db = {
    getById: vi.fn(() => storedSkill),
    getBySourceId: vi.fn(() => null),
    getByName: vi.fn(() => null),
    create: vi.fn((data: CreateSkillParams) => {
      storedSkill = skill(data);
      return storedSkill;
    }),
    update: vi.fn((_id: string, data: UpdateSkillParams) => {
      storedSkill = storedSkill ? { ...storedSkill, ...data } : null;
      return storedSkill;
    }),
    delete: vi.fn(() => {
      storedSkill = null;
      return true;
    }),
    finalizePackageInstall: vi.fn((_id: string, data: UpdateSkillParams) => {
      storedSkill = storedSkill
        ? { ...storedSkill, ...data, currentVersion: 1 }
        : null;
      return storedSkill
        ? { skill: storedSkill, version: versionSnapshot() }
        : null;
    }),
    finalizePackageUpdate: vi.fn((_id: string, data: UpdateSkillParams) => {
      storedSkill = storedSkill
        ? { ...storedSkill, ...data, currentVersion: 1 }
        : null;
      return storedSkill
        ? { skill: storedSkill, version: versionSnapshot() }
        : null;
    }),
  };
  const replacement = {
    repoPath: "/managed/writer/repo",
    recovery: {
      repoPath: "/managed/writer/repo",
      backupPath: undefined as string | undefined,
      hadOriginal: false,
    },
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
  };
  const dependencies: SkillPackageLifecycleDependencies = {
    db,
    createStagingRoot: vi.fn().mockResolvedValue("/staging/op-1"),
    stagePackage: vi.fn().mockResolvedValue({
      repoPath: "/staging/op-1/repo",
      content: "# Writer",
      contentHash: "content-hash",
      directoryFingerprint: "directory-fingerprint",
      safetyReport: { ...report, level: "safe", recommendedAction: "allow" },
    }),
    beginReplacement: vi.fn(async (_skill, _repoPath, onPrepared) => {
      await onPrepared(replacement.recovery);
      return replacement;
    }),
    readFilesSnapshot: vi
      .fn()
      .mockResolvedValue([{ relativePath: "SKILL.md", content: "# Writer" }]),
    deleteManagedContainer: vi.fn().mockResolvedValue(undefined),
    recordReplacement: vi.fn().mockResolvedValue(undefined),
    cleanupStagingRoot: vi.fn().mockResolvedValue(undefined),
    now: () => 100,
    deriveSourceId: () => "source-writer",
  };
  return {
    db,
    dependencies,
    replacement,
    service: new SkillPackageLifecycleService(dependencies),
    setStoredSkill: (value: Skill | null) => {
      storedSkill = value;
    },
  };
}

function versionSnapshot(): SkillVersion {
  return {
    id: "version-1",
    skillId: "skill-writer",
    version: 1,
    createdAt: new Date(0).toISOString(),
  };
}

describe("Skill package lifecycle", () => {
  let harness: ReturnType<typeof createHarness>;

  beforeEach(() => {
    harness = createHarness();
  });

  it("rejects a changed source fingerprint before creating or replacing any Skill", async () => {
    const result = await harness.service.run({
      ...request,
      expectedSourceFingerprint: "f".repeat(64),
    });
    expect(result).toMatchObject({
      status: "conflict",
      failure: { code: "CONFLICT", phase: "staging" },
    });
    expect(harness.db.create).not.toHaveBeenCalled();
    expect(harness.dependencies.beginReplacement).not.toHaveBeenCalled();
    expect(harness.dependencies.cleanupStagingRoot).toHaveBeenCalled();
  });

  it("does not let an advisory staged report block persistence", async () => {
    vi.mocked(harness.dependencies.stagePackage).mockResolvedValue({
      repoPath: "/staged/repo",
      content: "# Writer",
      contentHash: "hash",
      directoryFingerprint: "a".repeat(64),
      safetyReport: { ...report, level: "blocked" },
    });
    const result = await harness.service.run(request);
    expect(result.status).toBe("completed");
    expect(harness.db.create).toHaveBeenCalled();
  });

  it("returns bounded validation failures with the requested operation and source label", async () => {
    const malformed = {
      operation: "update",
      registrySkill: { source_label: "Private Gitea" },
    };

    await expect(harness.service.run(malformed)).resolves.toMatchObject({
      status: "failed",
      operation: "update",
      failure: {
        code: "INVALID_PACKAGE",
        phase: "validation",
        sourceLabel: "Private Gitea",
      },
    });
    await expect(harness.service.run(null)).resolves.toMatchObject({
      status: "failed",
      operation: "install",
      failure: { code: "INVALID_PACKAGE", phase: "validation" },
    });
  });

  it.each([
    {
      name: "unavailable remote source",
      operationRequest: request,
      error: new Error("network down"),
      status: "source-unavailable",
      code: "SOURCE_UNAVAILABLE",
    },
    {
      name: "invalid local package",
      operationRequest: {
        ...request,
        source: {
          kind: "content" as const,
          sourceUrl: "https://example.com/writer/SKILL.md",
          content: "# Writer",
        },
      },
      error: new Error("Path traversal detected"),
      status: "failed",
      code: "INVALID_PACKAGE",
    },
    {
      name: "oversized remote package",
      operationRequest: request,
      error: new Error("Skill package contains too many files"),
      status: "failed",
      code: "INVALID_PACKAGE",
    },
    {
      name: "local staging failure",
      operationRequest: {
        ...request,
        source: {
          kind: "content" as const,
          sourceUrl: "https://example.com/writer/SKILL.md",
          content: "# Writer",
        },
      },
      error: new Error("disk busy"),
      status: "failed",
      code: "STAGING_FAILED",
    },
  ])("classifies $name without durable mutation", async (testCase) => {
    vi.mocked(harness.dependencies.stagePackage).mockRejectedValue(
      testCase.error,
    );

    const result = await harness.service.run(testCase.operationRequest);

    expect(result).toMatchObject({
      status: testCase.status,
      failure: { code: testCase.code, phase: "staging" },
    });
    expect(harness.db.create).not.toHaveBeenCalled();
  });

  it.each(["git-unavailable", "git-http-fallback-failed"] as const)(
    "preserves the bounded transport reason %s",
    async (reason) => {
      vi.mocked(harness.dependencies.stagePackage).mockRejectedValue(
        new SkillPackageTransportError(reason, "transport failed"),
      );

      await expect(harness.service.run(request)).resolves.toMatchObject({
        status: "source-unavailable",
        failure: {
          code: "SOURCE_UNAVAILABLE",
          phase: "staging",
          reason,
        },
      });
      expect(harness.db.create).not.toHaveBeenCalled();
    },
  );

  it("falls back to the stable code when a staging error has no message", async () => {
    vi.mocked(harness.dependencies.stagePackage).mockRejectedValue(new Error());
    const localRequest: SkillPackageOperationRequest = {
      ...request,
      source: {
        kind: "content",
        sourceUrl: registrySkill.source_url,
        content: registrySkill.content,
      },
    };

    await expect(harness.service.run(localRequest)).resolves.toMatchObject({
      status: "failed",
      failure: { code: "STAGING_FAILED", summary: "STAGING_FAILED" },
    });
  });

  it("classifies source identity resolution failures before staging exists", async () => {
    harness.dependencies.deriveSourceId = () => {
      throw new Error("network unavailable");
    };

    await expect(harness.service.run(request)).resolves.toMatchObject({
      status: "source-unavailable",
      failure: { code: "SOURCE_UNAVAILABLE", phase: "staging" },
    });
    expect(harness.dependencies.createStagingRoot).not.toHaveBeenCalled();
    expect(harness.dependencies.cleanupStagingRoot).not.toHaveBeenCalled();
  });

  it("rejects an already-installed source before staging or safety review", async () => {
    harness.db.getBySourceId.mockReturnValue(skill());

    const result = await harness.service.run(request);

    expect(result).toMatchObject({
      status: "conflict",
      failure: { code: "DUPLICATE_SOURCE", phase: "applying" },
    });
    expect(harness.dependencies.createStagingRoot).not.toHaveBeenCalled();
    expect(harness.dependencies.stagePackage).not.toHaveBeenCalled();
  });

  it("allows a same-name variant when its exact source identity differs", async () => {
    harness.db.getByName.mockReturnValue(
      skill({ id: "other-writer", source_id: "other-source" }),
    );

    const result = await harness.service.run(request);

    expect(result).toMatchObject({ status: "completed" });
    expect(harness.dependencies.stagePackage).toHaveBeenCalledTimes(1);
    expect(harness.db.create).toHaveBeenCalledTimes(1);
  });

  it("detects a source installed while staging before creating another row", async () => {
    harness.db.getBySourceId
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(skill());

    const result = await harness.service.run(request);

    expect(result).toMatchObject({
      status: "conflict",
      failure: { code: "DUPLICATE_SOURCE" },
    });
    expect(harness.dependencies.stagePackage).toHaveBeenCalledTimes(1);
    expect(harness.db.create).not.toHaveBeenCalled();
  });

  it("installs only after staging and commits the row, repo, baseline, and initial version", async () => {
    const result = await harness.service.run(request);

    expect(result).toMatchObject({
      status: "completed",
      operation: "install",
      skill: { source_id: "source-writer", currentVersion: 1 },
    });
    expect(harness.db.create).toHaveBeenCalledTimes(1);
    expect(harness.dependencies.beginReplacement).toHaveBeenCalledTimes(1);
    expect(harness.db.finalizePackageInstall).toHaveBeenCalledWith(
      "skill-writer",
      expect.objectContaining({
        local_repo_path: "/managed/writer/repo",
        installed_directory_fingerprint: "directory-fingerprint",
      }),
      "Initial store install",
      [{ relativePath: "SKILL.md", content: "# Writer" }],
    );
    expect(harness.replacement.commit).toHaveBeenCalledTimes(1);
  });

  it("fully compensates a failed install finalization", async () => {
    harness.db.finalizePackageInstall.mockReturnValue(null);

    const result = await harness.service.run(request);

    expect(result).toMatchObject({
      status: "failed",
      failure: { code: "DATABASE_FINALIZE_FAILED" },
    });
    expect(harness.replacement.rollback).toHaveBeenCalledTimes(1);
    expect(harness.db.delete).toHaveBeenCalledWith("skill-writer");
    expect(harness.dependencies.deleteManagedContainer).toHaveBeenCalled();
  });

  it.each([
    ["duplicate constraint", "conflict", "DUPLICATE_SOURCE"],
    ["database locked", "failed", "DATABASE_FINALIZE_FAILED"],
  ] as const)(
    "classifies a pending-row creation failure: %s",
    async (message, status, code) => {
      harness.db.create.mockImplementation(() => {
        throw new Error(message);
      });

      const result = await harness.service.run(request);

      expect(result).toMatchObject({ status, failure: { code } });
      expect(harness.dependencies.beginReplacement).not.toHaveBeenCalled();
    },
  );

  it("classifies a duplicate discovered during install finalization", async () => {
    harness.db.finalizePackageInstall.mockImplementation(() => {
      throw new Error("duplicate source id");
    });

    const result = await harness.service.run(request);

    expect(result).toMatchObject({
      status: "conflict",
      failure: { code: "DUPLICATE_SOURCE", phase: "applying" },
    });
    expect(harness.replacement.rollback).toHaveBeenCalledTimes(1);
  });

  it("rolls back the pending row when repository promotion cannot start", async () => {
    vi.mocked(harness.dependencies.beginReplacement).mockRejectedValue(
      new Error("rename failed"),
    );

    const result = await harness.service.run(request);

    expect(result).toMatchObject({
      status: "failed",
      failure: { code: "PACKAGE_APPLY_FAILED", phase: "applying" },
    });
    expect(harness.db.delete).toHaveBeenCalledWith("skill-writer");
  });

  it("classifies pre-row install preparation failures as package apply failures", async () => {
    harness.dependencies.now = () => {
      throw new Error("clock unavailable");
    };

    await expect(harness.service.run(request)).resolves.toMatchObject({
      status: "failed",
      failure: { code: "PACKAGE_APPLY_FAILED", phase: "applying" },
    });
    expect(harness.db.create).not.toHaveBeenCalled();
  });

  it("reports rollback-incomplete when failed promotion cleanup also fails", async () => {
    vi.mocked(harness.dependencies.beginReplacement).mockRejectedValue(
      new Error("rename failed"),
    );
    vi.mocked(harness.dependencies.cleanupStagingRoot).mockRejectedValue(
      new Error("staging root busy"),
    );

    const result = await harness.service.run(request);

    expect(result).toMatchObject({
      status: "failed",
      failure: { code: "ROLLBACK_INCOMPLETE", phase: "rollback" },
    });
  });

  it("removes a newly-created managed container only after repo rollback completes", async () => {
    harness.db.finalizePackageInstall.mockReturnValue(null);
    let releaseRollback: (() => void) | undefined;
    harness.replacement.rollback.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseRollback = resolve;
        }),
    );

    const operation = harness.service.run(request);
    await vi.waitFor(() => expect(releaseRollback).toBeTypeOf("function"));
    expect(harness.dependencies.deleteManagedContainer).not.toHaveBeenCalled();
    releaseRollback!();

    await expect(operation).resolves.toMatchObject({ status: "failed" });
    expect(harness.dependencies.deleteManagedContainer).toHaveBeenCalledTimes(
      1,
    );
  });

  it("refuses to overwrite an existing managed repo during install", async () => {
    harness.replacement.recovery.hadOriginal = true;
    harness.replacement.recovery.backupPath = "/managed/writer/repo.old-op";

    const result = await harness.service.run(request);

    expect(result).toMatchObject({
      status: "conflict",
      failure: { code: "DUPLICATE_SOURCE", phase: "applying" },
    });
    expect(harness.dependencies.recordReplacement).not.toHaveBeenCalled();
    expect(harness.replacement.rollback).not.toHaveBeenCalled();
    expect(harness.dependencies.deleteManagedContainer).not.toHaveBeenCalled();
    expect(harness.db.delete).toHaveBeenCalledWith("skill-writer");
  });

  it("surfaces rollback-incomplete instead of claiming a recoverable failure", async () => {
    harness.db.finalizePackageInstall.mockReturnValue(null);
    harness.replacement.rollback.mockRejectedValue(new Error("disk busy"));

    const result = await harness.service.run(request);

    expect(result).toMatchObject({
      status: "failed",
      failure: { code: "ROLLBACK_INCOMPLETE", phase: "rollback" },
    });
  });

  it("reports rollback-incomplete when the pending database row cannot be removed", async () => {
    harness.db.finalizePackageInstall.mockReturnValue(null);
    harness.db.delete.mockReturnValue(false);

    const result = await harness.service.run(request);

    expect(result).toMatchObject({
      status: "failed",
      failure: { code: "ROLLBACK_INCOMPLETE", phase: "rollback" },
    });
  });

  it("does not remove a restored pre-existing container after install rollback", async () => {
    harness.replacement.recovery.hadOriginal = true;
    harness.replacement.recovery.backupPath = "/managed/writer/repo.old-op";
    vi.mocked(harness.dependencies.beginReplacement).mockResolvedValue(
      harness.replacement,
    );
    harness.db.finalizePackageInstall.mockReturnValue(null);

    const result = await harness.service.run(request);

    expect(result).toMatchObject({
      status: "failed",
      failure: { code: "DATABASE_FINALIZE_FAILED" },
    });
    expect(harness.replacement.rollback).toHaveBeenCalledTimes(1);
    expect(harness.dependencies.deleteManagedContainer).not.toHaveBeenCalled();
  });

  it("rolls back the package when the atomic update mutation cannot finalize", async () => {
    const installed = skill({ currentVersion: 3 });
    harness.setStoredSkill(installed);
    harness.db.getById.mockImplementation(() => installed);
    harness.db.finalizePackageUpdate.mockImplementation(() => {
      throw new Error("database locked");
    });
    const updateRequest: SkillPackageOperationRequest = {
      ...request,
      operation: "update",
      skillId: installed.id,
    };

    const result = await harness.service.run(updateRequest);

    expect(result).toMatchObject({
      status: "failed",
      failure: { code: "DATABASE_FINALIZE_FAILED" },
    });
    expect(harness.replacement.rollback).toHaveBeenCalledTimes(1);
    expect(harness.db.getById(installed.id)?.currentVersion).toBe(3);
  });

  it("returns a conflict when the update target disappeared before apply", async () => {
    harness.db.getById.mockReturnValue(null);

    const result = await harness.service.run(asUpdateRequest());

    expect(result).toMatchObject({
      status: "conflict",
      failure: { code: "CONFLICT", phase: "applying" },
    });
    expect(harness.dependencies.beginReplacement).not.toHaveBeenCalled();
  });

  it("classifies a pre-replacement update snapshot failure as an apply failure", async () => {
    const installed = skill({ local_repo_path: "/managed/writer/repo" });
    harness.setStoredSkill(installed);
    vi.mocked(harness.dependencies.readFilesSnapshot).mockRejectedValue(
      new Error("snapshot unreadable"),
    );

    await expect(harness.service.run(asUpdateRequest())).resolves.toMatchObject(
      {
        status: "failed",
        failure: { code: "PACKAGE_APPLY_FAILED", phase: "applying" },
      },
    );
    expect(harness.dependencies.beginReplacement).not.toHaveBeenCalled();
    expect(harness.replacement.rollback).not.toHaveBeenCalled();
  });

  it("snapshots an existing repo and preserves explicit update policy", async () => {
    const installed = skill({
      currentVersion: 3,
      version: "1.5.0",
      local_repo_path: "/managed/writer/repo",
      is_builtin: false,
    });
    harness.setStoredSkill(installed);

    const result = await harness.service.run(
      asUpdateRequest({ note: "Approved source update", markAsBuiltin: false }),
    );

    expect(result).toMatchObject({ status: "completed", operation: "update" });
    expect(harness.dependencies.readFilesSnapshot).toHaveBeenCalledWith(
      installed.local_repo_path,
    );
    expect(harness.db.finalizePackageUpdate).toHaveBeenCalledWith(
      installed.id,
      expect.objectContaining({ is_builtin: false }),
      "Approved source update",
      [{ relativePath: "SKILL.md", content: "# Writer" }],
      installed,
    );
  });

  it("uses the default update note and builtin policy for a managed update", async () => {
    const installed = skill({ currentVersion: 3 });
    harness.setStoredSkill(installed);

    await expect(harness.service.run(asUpdateRequest())).resolves.toMatchObject(
      {
        status: "completed",
      },
    );

    expect(harness.db.finalizePackageUpdate).toHaveBeenCalledWith(
      installed.id,
      expect.objectContaining({ is_builtin: true }),
      "Store update: unknown -> 2.0.0",
      undefined,
      installed,
    );
  });

  it("reports rollback-incomplete when a null update finalization cannot restore files", async () => {
    const installed = skill({ currentVersion: 3 });
    harness.setStoredSkill(installed);
    harness.db.finalizePackageUpdate.mockReturnValue(null);
    harness.replacement.rollback.mockRejectedValue(new Error("disk busy"));

    const result = await harness.service.run(asUpdateRequest());

    expect(result).toMatchObject({
      status: "failed",
      failure: { code: "ROLLBACK_INCOMPLETE", phase: "rollback" },
    });
  });

  it("does not turn best-effort commit and final cleanup failures into a failed install", async () => {
    harness.replacement.commit.mockRejectedValue(new Error("backup busy"));
    vi.mocked(harness.dependencies.cleanupStagingRoot).mockRejectedValue(
      new Error("cleanup deferred"),
    );

    await expect(harness.service.run(request)).resolves.toMatchObject({
      status: "completed",
      operation: "install",
    });
  });

  it("reports an optimistic update collision as a conflict", async () => {
    const installed = skill({ currentVersion: 3 });
    harness.setStoredSkill(installed);
    harness.db.finalizePackageUpdate.mockImplementation(() => {
      throw new Error("Skill changed during package update finalization");
    });

    const result = await harness.service.run({
      ...request,
      operation: "update",
      skillId: installed.id,
    });

    expect(result).toMatchObject({
      status: "conflict",
      failure: { code: "CONFLICT", phase: "finalizing" },
    });
    expect(harness.replacement.rollback).toHaveBeenCalledTimes(1);
  });

  it("writes recovery intent before the managed repository is mutated", async () => {
    const events: string[] = [];
    const finalizeInstall =
      harness.db.finalizePackageInstall.getMockImplementation()!;
    vi.mocked(harness.dependencies.recordReplacement).mockImplementation(
      async () => {
        events.push("journal");
      },
    );
    vi.mocked(harness.dependencies.beginReplacement).mockImplementation(
      async (_skill, _repoPath, onPrepared) => {
        events.push("prepared");
        await onPrepared(harness.replacement.recovery);
        events.push("filesystem");
        return harness.replacement;
      },
    );
    harness.db.finalizePackageInstall.mockImplementation((...args) => {
      events.push("database");
      return finalizeInstall(...args);
    });

    await expect(harness.service.run(request)).resolves.toMatchObject({
      status: "completed",
    });
    expect(events).toEqual(["prepared", "journal", "filesystem", "database"]);
  });

  it("coalesces duplicate clicks into one filesystem and database mutation", async () => {
    let releaseStage: (() => void) | undefined;
    vi.mocked(harness.dependencies.stagePackage).mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseStage = () =>
            resolve({
              repoPath: "/staging/op-1/repo",
              content: "# Writer",
              contentHash: "content-hash",
              directoryFingerprint: "directory-fingerprint",
            });
        }),
    );

    const first = harness.service.run(request);
    const second = harness.service.run(request);
    await vi.waitFor(() => expect(releaseStage).toBeTypeOf("function"));
    releaseStage!();

    await expect(Promise.all([first, second])).resolves.toEqual([
      await first,
      await first,
    ]);
    expect(harness.dependencies.stagePackage).toHaveBeenCalledTimes(1);
    expect(harness.db.create).toHaveBeenCalledTimes(1);
  });

  it("serializes updates for the same Skill even when source metadata differs", async () => {
    const installed = skill({ currentVersion: 3 });
    harness.setStoredSkill(installed);
    let releaseStage: (() => void) | undefined;
    vi.mocked(harness.dependencies.stagePackage).mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseStage = () =>
            resolve({
              repoPath: "/staging/op-1/repo",
              content: "# Writer",
              contentHash: "content-hash",
              directoryFingerprint: "directory-fingerprint",
            });
        }),
    );
    const firstRequest = {
      ...request,
      operation: "update",
      skillId: installed.id,
    } as const;
    const secondRequest = {
      ...firstRequest,
      registrySkill: { ...registrySkill, source_id: "alternate-source" },
    };

    const first = harness.service.run(firstRequest);
    const second = harness.service.run(secondRequest);
    await vi.waitFor(() => expect(releaseStage).toBeTypeOf("function"));
    releaseStage!();

    await expect(Promise.all([first, second])).resolves.toEqual([
      await first,
      await first,
    ]);
    expect(harness.dependencies.stagePackage).toHaveBeenCalledTimes(1);
    expect(harness.db.finalizePackageUpdate).toHaveBeenCalledTimes(1);
  });
});

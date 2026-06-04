/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const fsMocks = vi.hoisted(() => ({
  mkdir: vi.fn(),
  cp: vi.fn(),
  writeFile: vi.fn(),
  stat: vi.fn(),
  lstat: vi.fn(),
  rm: vi.fn(),
  symlink: vi.fn(),
  rename: vi.fn(),
  readdir: vi.fn(),
  realpath: vi.fn(async (value: string) => value),
}));

const internalMocks = vi.hoisted(() => ({
  getSkillsDirAccessor: vi.fn(() => "/prompthub/skills"),
  initSkillsDir: vi.fn().mockResolvedValue(undefined),
  fileExists: vi.fn().mockResolvedValue(false),
  getErrorCode: vi.fn((error: unknown) =>
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: string }).code
      : undefined,
  ),
  isPathWithin: vi.fn(() => true),
  normalizeExistingPath: vi.fn(async (value: string) => value),
  resolveRepoBasePath: vi.fn(async (basePath: string) => ({
    resolvedBasePath: basePath,
    realBasePath: basePath,
  })),
  resolveRepoTargetPath: vi.fn(async (basePath: string, relativePath: string) => ({
    fullPath: `${basePath}/${relativePath}`,
    realBasePath: basePath,
  })),
  validateRelativePath: vi.fn(),
  validateSkillName: vi.fn(),
}));

vi.mock("fs/promises", () => fsMocks);

vi.mock("../../../src/main/services/skill-installer-internal", () => ({
  getSkillsDirAccessor: internalMocks.getSkillsDirAccessor,
  initSkillsDir: internalMocks.initSkillsDir,
  fileExists: internalMocks.fileExists,
  getErrorCode: internalMocks.getErrorCode,
  isPathWithin: internalMocks.isPathWithin,
  normalizeExistingPath: internalMocks.normalizeExistingPath,
  resolveRepoBasePath: internalMocks.resolveRepoBasePath,
  resolveRepoTargetPath: internalMocks.resolveRepoTargetPath,
  validateRelativePath: internalMocks.validateRelativePath,
  validateSkillName: internalMocks.validateSkillName,
}));

import {
  getManagedContainerPathForSkill,
  getPreferredLocalRepoContainerPathForSkill,
  getPreferredLocalRepoPathForSkill,
  getLocalRepoContainerPathForSkillId,
  getLocalRepoPathForSkillId,
  saveContentToLocalRepoBySkillId,
  saveToLocalRepoBySkillId,
} from "../../../src/main/services/skill-installer-repo";

describe("skill-installer-repo variant container", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    internalMocks.fileExists.mockResolvedValue(false);
    fsMocks.stat.mockResolvedValue({ isDirectory: () => true });
    fsMocks.lstat.mockResolvedValue({ isSymbolicLink: () => false });
    fsMocks.mkdir.mockResolvedValue(undefined);
    fsMocks.cp.mockResolvedValue(undefined);
    fsMocks.writeFile.mockResolvedValue(undefined);
    fsMocks.rm.mockResolvedValue(undefined);
    fsMocks.symlink.mockResolvedValue(undefined);
    fsMocks.rename.mockResolvedValue(undefined);
  });

  it("stores managed repos inside a stable variant container", () => {
    expect(getLocalRepoContainerPathForSkillId("skill-1")).toBe(
      "/prompthub/skills/skill-1",
    );
    expect(getLocalRepoPathForSkillId("skill-1")).toBe(
      "/prompthub/skills/skill-1/repo",
    );
  });

  it("prefers human-readable managed container names with a short stable suffix", () => {
    expect(
      getPreferredLocalRepoContainerPathForSkill({
        id: "8ee7f899-b267-4aea-9037-86f0ba1da1bc",
        name: "clouddrive2-cli",
        source_id: "source-clouddrive2-main",
      }),
    ).toBe("/prompthub/skills/clouddrive2-cli--3c7d25c0");
    expect(
      getPreferredLocalRepoPathForSkill({
        id: "8ee7f899-b267-4aea-9037-86f0ba1da1bc",
        name: "clouddrive2-cli",
        source_id: "source-clouddrive2-main",
      }),
    ).toBe("/prompthub/skills/clouddrive2-cli--3c7d25c0/repo");
  });

  it("reuses a legacy managed container when local_repo_path already points to it", async () => {
    internalMocks.fileExists.mockImplementationOnce(
      async (targetPath: string) => targetPath === "/prompthub/skills/skill-1",
    );

    await expect(
      getManagedContainerPathForSkill({
        id: "skill-1",
        name: "writer",
        source_id: "source-writer-main",
        local_repo_path: "/prompthub/skills/skill-1/repo",
      }),
    ).resolves.toBe("/prompthub/skills/skill-1");
  });

  it("writes SKILL.md into the repo subdirectory and sidecar metadata into .prompthub", async () => {
    await saveContentToLocalRepoBySkillId(
      {
        id: "skill-1",
        name: "writer",
        source_id: "source-writer-main",
      },
      "# Writer\n",
    );

    expect(fsMocks.mkdir).toHaveBeenCalledWith(
      "/prompthub/skills/writer--7dc211f6",
      { recursive: true },
    );
    expect(fsMocks.mkdir).toHaveBeenCalledWith(
      "/prompthub/skills/writer--7dc211f6/.prompthub",
      { recursive: true },
    );
    expect(fsMocks.writeFile).toHaveBeenCalledWith(
      "/prompthub/skills/writer--7dc211f6/repo/SKILL.md",
      "# Writer\n",
      "utf-8",
    );
    expect(fsMocks.writeFile).toHaveBeenCalledWith(
      "/prompthub/skills/writer--7dc211f6/.prompthub/source.json",
      expect.stringContaining('"logicalName": "writer"'),
      "utf-8",
    );
    expect(fsMocks.writeFile).toHaveBeenCalledWith(
      "/prompthub/skills/writer--7dc211f6/.prompthub/variant.json",
      expect.stringContaining('"repoMode": "copy"'),
      "utf-8",
    );
  });

  it("materializes requested symlink mode inside the managed data repo", async () => {
    await saveToLocalRepoBySkillId(
      {
        id: "skill-1",
        name: "writer",
        source_id: "source-writer-main",
      },
      "/external/writer",
      "symlink",
    );

    expect(fsMocks.symlink).not.toHaveBeenCalled();
    expect(fsMocks.cp).toHaveBeenCalledWith(
      "/external/writer",
      "/prompthub/skills/writer--7dc211f6/repo",
      expect.objectContaining({
        recursive: true,
        filter: expect.any(Function),
      }),
    );
    expect(fsMocks.writeFile).toHaveBeenCalledWith(
      "/prompthub/skills/writer--7dc211f6/.prompthub/variant.json",
      expect.stringContaining('"repoMode": "copy"'),
      "utf-8",
    );
  });
});

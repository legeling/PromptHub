/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const fsMocks = vi.hoisted(() => ({
  mkdir: vi.fn(),
  cp: vi.fn(),
  writeFile: vi.fn(),
  lstat: vi.fn(),
  rm: vi.fn(),
  symlink: vi.fn(),
}));

const internalMocks = vi.hoisted(() => ({
  getSkillsDirAccessor: vi.fn(() => "/prompthub/skills"),
  initSkillsDir: vi.fn().mockResolvedValue(undefined),
  validateSkillName: vi.fn(),
  fileExists: vi.fn(),
  getErrorCode: vi.fn((error: unknown) =>
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : undefined,
  ),
}));

const repoMocks = vi.hoisted(() => ({
  saveContentToLocalRepo: vi
    .fn()
    .mockResolvedValue("/prompthub/skills/demo-skill"),
}));

const utilsMocks = vi.hoisted(() => ({
  getPlatformSkillsDir: vi.fn(() => "/platform/skills"),
  getCustomAgentPlatforms: vi.fn(() => []),
  validateMCPConfig: vi.fn(),
}));

vi.mock("fs/promises", () => fsMocks);

vi.mock("../../../src/main/services/skill-installer-internal", () => ({
  getSkillsDirAccessor: internalMocks.getSkillsDirAccessor,
  initSkillsDir: internalMocks.initSkillsDir,
  validateSkillName: internalMocks.validateSkillName,
  fileExists: internalMocks.fileExists,
  getErrorCode: internalMocks.getErrorCode,
}));

vi.mock("../../../src/main/services/skill-installer-repo", () => ({
  saveContentToLocalRepo: repoMocks.saveContentToLocalRepo,
}));

vi.mock("../../../src/main/services/skill-installer-utils", () => ({
  getPlatformSkillsDir: utilsMocks.getPlatformSkillsDir,
  getCustomAgentPlatforms: utilsMocks.getCustomAgentPlatforms,
  validateMCPConfig: utilsMocks.validateMCPConfig,
}));

import {
  buildPlatformSkillInstallName,
  getSupportedPlatforms,
  getSkillMdInstallStatusForSkill,
  installSkillMd,
  installSkillMdForSkill,
  installSkillMdSymlink,
  uninstallSkillMdForSkill,
} from "../../../src/main/services/skill-installer-platform";

describe("skill-installer-platform symlink install", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    utilsMocks.getCustomAgentPlatforms.mockReturnValue([]);
    fsMocks.lstat.mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" }));
    fsMocks.mkdir.mockResolvedValue(undefined);
    fsMocks.cp.mockResolvedValue(undefined);
    fsMocks.writeFile.mockResolvedValue(undefined);
    fsMocks.rm.mockResolvedValue(undefined);
    fsMocks.symlink.mockResolvedValue(undefined);
  });

  it("copies the managed skill directory into the platform directory", async () => {
    await installSkillMd("demo-skill", "# skill", "claude");

    expect(repoMocks.saveContentToLocalRepo).toHaveBeenCalledWith(
      "demo-skill",
      "# skill",
    );
    expect(fsMocks.cp).toHaveBeenCalledWith(
      expect.anything(),
      "/platform/skills/demo-skill",
      expect.objectContaining({ recursive: true, filter: expect.any(Function) }),
    );
  });

  it("includes enabled custom agents in supported platforms", () => {
    utilsMocks.getCustomAgentPlatforms.mockReturnValue([
      {
        id: "custom-agent-1",
        name: "Team Agents",
        icon: "Bot",
        rootDir: { darwin: "~/.agents", win32: "~/.agents", linux: "~/.agents" },
        skillsRelativePath: "skills",
        isCustom: true,
      },
    ]);

    expect(getSupportedPlatforms().some((platform) => platform.id === "custom-agent-1")).toBe(true);
  });

  it("allows symlink installs for custom agents", async () => {
    utilsMocks.getCustomAgentPlatforms.mockReturnValue([
      {
        id: "custom-agent-1",
        name: "Team Agents",
        icon: "Bot",
        rootDir: { darwin: "~/.agents", win32: "~/.agents", linux: "~/.agents" },
        skillsRelativePath: "skills",
        isCustom: true,
      },
    ]);

    const result = await installSkillMdSymlink(
      "demo-skill",
      "# skill",
      "custom-agent-1",
    );

    expect(result).toEqual({
      requestedMode: "symlink",
      effectiveMode: "symlink",
    });
  });

  it("falls back to copy install when symlink creation returns EPERM", async () => {
    fsMocks.symlink.mockRejectedValueOnce(
      Object.assign(new Error("operation not permitted"), { code: "EPERM" }),
    );

    const result = await installSkillMdSymlink("demo-skill", "# skill", "claude");

    expect(fsMocks.symlink).toHaveBeenCalledWith(
      "/prompthub/skills/demo-skill",
      "/platform/skills/demo-skill",
      "dir",
    );
    expect(fsMocks.cp).toHaveBeenCalledWith(
      "/prompthub/skills/demo-skill",
      "/platform/skills/demo-skill",
      expect.objectContaining({ recursive: true, filter: expect.any(Function) }),
    );
    expect(result).toEqual({
      requestedMode: "symlink",
      effectiveMode: "copy",
      fallbackReason: "EPERM: operation not permitted",
    });
  });

  it("symlinks the whole skill directory into the platform directory", async () => {
    const result = await installSkillMdSymlink("demo-skill", "# skill", "claude");

    expect(fsMocks.mkdir).toHaveBeenCalledWith("/prompthub/skills/demo-skill", {
      recursive: true,
    });
    expect(fsMocks.mkdir).toHaveBeenCalledWith("/platform/skills", {
      recursive: true,
    });
    expect(fsMocks.symlink).toHaveBeenCalledWith(
      "/prompthub/skills/demo-skill",
      "/platform/skills/demo-skill",
      "dir",
    );
    expect(result).toEqual({
      requestedMode: "symlink",
      effectiveMode: "symlink",
    });
  });

  it("falls back to copy install for UNKNOWN errors (Windows without Developer Mode)", async () => {
    // Node can surface Windows symlink permission failures as code "UNKNOWN"
    // (not just "EPERM"). Before #93 this escaped the fallback and threw all
    // the way up to the renderer, where the error was silently console.errored
    // and the user saw no install and no explanation.
    fsMocks.symlink.mockRejectedValueOnce(
      Object.assign(new Error("unknown symlink failure"), { code: "UNKNOWN" }),
    );

    const result = await installSkillMdSymlink("demo-skill", "# skill", "claude");

    expect(fsMocks.cp).toHaveBeenCalledWith(
      "/prompthub/skills/demo-skill",
      "/platform/skills/demo-skill",
      expect.objectContaining({ recursive: true, filter: expect.any(Function) }),
    );
    expect(result).toEqual({
      requestedMode: "symlink",
      effectiveMode: "copy",
      fallbackReason: "UNKNOWN: unknown symlink failure",
    });
  });

  it("rethrows with an actionable error message when no fallback applies", async () => {
    const rootCause = Object.assign(new Error("disk is full"), {
      code: "ENOSPC",
    });
    fsMocks.symlink.mockRejectedValueOnce(rootCause);

    await expect(
      installSkillMdSymlink("demo-skill", "# skill", "claude"),
    ).rejects.toThrowError(/Symlink install failed for "demo-skill"/);
  });

  it("builds distinct platform install names for same-name variants", () => {
    expect(
      buildPlatformSkillInstallName({
        id: "skill-a",
        name: "writer",
        source_id: "source-a",
      }),
    ).not.toBe(
      buildPlatformSkillInstallName({
        id: "skill-b",
        name: "writer",
        source_id: "source-b",
      }),
    );
  });

  it("installs same-name variants into distinct platform directories", async () => {
    const platformSkillName = buildPlatformSkillInstallName({
      id: "skill-a",
      name: "writer",
      source_id: "source-a",
    });
    internalMocks.fileExists.mockResolvedValue(true);

    await installSkillMdForSkill(
      { id: "skill-a", name: "writer", source_id: "source-a" },
      "# writer a",
      "claude",
      "/prompthub/skills/skill-a",
      ["writer"],
    );

    expect(fsMocks.cp).toHaveBeenCalledWith(
      "/prompthub/skills/skill-a",
      `/platform/skills/${platformSkillName}`,
      expect.objectContaining({ recursive: true, filter: expect.any(Function) }),
    );
    expect(fsMocks.rm.mock.calls).toContainEqual([
      "/platform/skills/writer",
      { recursive: true, force: true },
    ]);
  });

  it("checks install status using unique and legacy platform directories", async () => {
    const platformSkillName = buildPlatformSkillInstallName({
      id: "skill-a",
      name: "writer",
      source_id: "source-a",
    });

    internalMocks.fileExists.mockImplementation(async (target: string) =>
      target === `/platform/skills/${platformSkillName}/SKILL.md` ||
      target === "/platform/skills/writer/SKILL.md",
    );

    const status = await getSkillMdInstallStatusForSkill(
      { id: "skill-a", name: "writer", source_id: "source-a" },
      ["writer"],
    );

    expect(Object.values(status).every(Boolean)).toBe(true);
  });

  it("uninstalls unique and legacy platform directories together", async () => {
    const platformSkillName = buildPlatformSkillInstallName({
      id: "skill-a",
      name: "writer",
      source_id: "source-a",
    });

    internalMocks.fileExists.mockResolvedValue(true);

    await uninstallSkillMdForSkill(
      { id: "skill-a", name: "writer", source_id: "source-a" },
      "claude",
      ["writer"],
    );

    expect(fsMocks.rm).toHaveBeenCalledWith(
      `/platform/skills/${platformSkillName}`,
      { recursive: true, force: true },
    );
    expect(fsMocks.rm).toHaveBeenCalledWith(
      "/platform/skills/writer",
      { recursive: true, force: true },
    );
  });
});

/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const fsMocks = vi.hoisted(() => ({
  mkdir: vi.fn(),
  cp: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  lstat: vi.fn(),
  rm: vi.fn(),
  symlink: vi.fn(),
  realpath: vi.fn(),
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

const cherryStudioMocks = vi.hoisted(() => ({
  getCherryStudioSkillStatus: vi.fn().mockResolvedValue(true),
  installCherryStudioSkill: vi.fn().mockResolvedValue(undefined),
  isCherryStudioPlatform: vi.fn(
    (platformId: string) => platformId === "cherry-studio",
  ),
  uninstallCherryStudioSkill: vi.fn().mockResolvedValue(undefined),
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

vi.mock("../../../src/main/services/cherry-studio-skill-platform", () => ({
  getCherryStudioSkillStatus: cherryStudioMocks.getCherryStudioSkillStatus,
  installCherryStudioSkill: cherryStudioMocks.installCherryStudioSkill,
  isCherryStudioPlatform: cherryStudioMocks.isCherryStudioPlatform,
  uninstallCherryStudioSkill: cherryStudioMocks.uninstallCherryStudioSkill,
}));

import {
  getSupportedPlatforms,
  getSkillMdInstallStatusForSkill,
  getSkillMdInstallStatusDetailsForSkill,
  installSkillMd,
  installSkillMdForSkill,
  installSkillMdSymlink,
  installSkillMdSymlinkForSkill,
  uninstallSkillMdForSkill,
} from "../../../src/main/services/skill-installer-platform";

describe("skill-installer-platform symlink install", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    utilsMocks.getCustomAgentPlatforms.mockReturnValue([]);
    utilsMocks.getPlatformSkillsDir.mockReturnValue("/platform/skills");
    fsMocks.lstat.mockRejectedValue(
      Object.assign(new Error("missing"), { code: "ENOENT" }),
    );
    fsMocks.mkdir.mockResolvedValue(undefined);
    fsMocks.cp.mockResolvedValue(undefined);
    fsMocks.readFile.mockResolvedValue("{}");
    fsMocks.writeFile.mockResolvedValue(undefined);
    fsMocks.rm.mockResolvedValue(undefined);
    fsMocks.symlink.mockResolvedValue(undefined);
    fsMocks.realpath.mockImplementation(async (targetPath: string) =>
      targetPath === "/prompthub/skills/linked-demo"
        ? "/external/skills/linked-demo"
        : targetPath,
    );
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
      expect.objectContaining({
        recursive: true,
        filter: expect.any(Function),
      }),
    );
  });

  it("dereferences a root symlink source when copy-installing to a platform", async () => {
    await installSkillMd(
      "linked-demo",
      "# skill",
      "claude",
      "/prompthub/skills/linked-demo",
    );

    expect(fsMocks.symlink).not.toHaveBeenCalled();
    expect(fsMocks.cp).toHaveBeenCalledWith(
      "/external/skills/linked-demo",
      "/platform/skills/linked-demo",
      expect.objectContaining({
        recursive: true,
        filter: expect.any(Function),
      }),
    );
  });

  it("registers Cherry Studio installs through its database-backed adapter", async () => {
    await installSkillMd(
      "demo-skill",
      "# skill",
      "cherry-studio",
      "/prompthub/skills/demo-skill",
    );

    expect(cherryStudioMocks.installCherryStudioSkill).toHaveBeenCalledWith(
      expect.objectContaining({ id: "cherry-studio" }),
      "demo-skill",
      "/prompthub/skills/demo-skill",
    );
    expect(fsMocks.cp).not.toHaveBeenCalled();
  });

  it("includes enabled custom agents in supported platforms", () => {
    utilsMocks.getCustomAgentPlatforms.mockReturnValue([
      {
        id: "custom-agent-1",
        name: "Team Agents",
        icon: "Bot",
        rootDir: {
          darwin: "~/.agents",
          win32: "~/.agents",
          linux: "~/.agents",
        },
        skillsRelativePath: "skills",
        isCustom: true,
      },
    ]);

    expect(
      getSupportedPlatforms().some(
        (platform) => platform.id === "custom-agent-1",
      ),
    ).toBe(true);
  });

  it("allows symlink installs for custom agents", async () => {
    utilsMocks.getCustomAgentPlatforms.mockReturnValue([
      {
        id: "custom-agent-1",
        name: "Team Agents",
        icon: "Bot",
        rootDir: {
          darwin: "~/.agents",
          win32: "~/.agents",
          linux: "~/.agents",
        },
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

  it("registers Cherry Studio symlink requests through its database-backed adapter", async () => {
    const result = await installSkillMdSymlink(
      "demo-skill",
      "# skill",
      "cherry-studio",
      "/prompthub/skills/demo-skill",
    );

    expect(cherryStudioMocks.installCherryStudioSkill).toHaveBeenCalledWith(
      expect.objectContaining({ id: "cherry-studio" }),
      "demo-skill",
      "/prompthub/skills/demo-skill",
      { mode: "symlink" },
    );
    expect(fsMocks.symlink).not.toHaveBeenCalled();
    expect(result).toEqual({
      requestedMode: "symlink",
      effectiveMode: "symlink",
    });
  });

  it("falls back to Cherry Studio copy registration when DB-backed symlink creation is not permitted", async () => {
    cherryStudioMocks.installCherryStudioSkill
      .mockRejectedValueOnce(
        Object.assign(new Error("operation not permitted"), { code: "EPERM" }),
      )
      .mockResolvedValueOnce(undefined);

    const result = await installSkillMdSymlink(
      "demo-skill",
      "# skill",
      "cherry-studio",
      "/prompthub/skills/demo-skill",
    );

    expect(cherryStudioMocks.installCherryStudioSkill).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: "cherry-studio" }),
      "demo-skill",
      "/prompthub/skills/demo-skill",
      { mode: "symlink" },
    );
    expect(cherryStudioMocks.installCherryStudioSkill).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: "cherry-studio" }),
      "demo-skill",
      "/prompthub/skills/demo-skill",
    );
    expect(result).toEqual({
      requestedMode: "symlink",
      effectiveMode: "copy",
      fallbackReason: "EPERM: operation not permitted",
    });
  });

  it("falls back to copy install when symlink creation returns EPERM", async () => {
    fsMocks.symlink.mockRejectedValueOnce(
      Object.assign(new Error("operation not permitted"), { code: "EPERM" }),
    );

    const result = await installSkillMdSymlink(
      "demo-skill",
      "# skill",
      "claude",
    );

    expect(fsMocks.symlink).toHaveBeenCalledWith(
      "/prompthub/skills/demo-skill",
      "/platform/skills/demo-skill",
      "dir",
    );
    expect(fsMocks.cp).toHaveBeenCalledWith(
      "/prompthub/skills/demo-skill",
      "/platform/skills/demo-skill",
      expect.objectContaining({
        recursive: true,
        filter: expect.any(Function),
      }),
    );
    expect(result).toEqual({
      requestedMode: "symlink",
      effectiveMode: "copy",
      fallbackReason: "EPERM: operation not permitted",
    });
  });

  it("symlinks the whole skill directory into the platform directory", async () => {
    const result = await installSkillMdSymlink(
      "demo-skill",
      "# skill",
      "claude",
    );

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

    const result = await installSkillMdSymlink(
      "demo-skill",
      "# skill",
      "claude",
    );

    expect(fsMocks.cp).toHaveBeenCalledWith(
      "/prompthub/skills/demo-skill",
      "/platform/skills/demo-skill",
      expect.objectContaining({
        recursive: true,
        filter: expect.any(Function),
      }),
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

  it("installs same-name variants into the shared logical platform directory", async () => {
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
      "/platform/skills/writer",
      expect.objectContaining({
        recursive: true,
        filter: expect.any(Function),
      }),
    );
    expect(fsMocks.writeFile).toHaveBeenCalledWith(
      "/platform/skills/.prompthub-platform-activations.json",
      expect.stringContaining('"writer"'),
      "utf-8",
    );
  });

  it("records activation state for symlink installs so UI reads installed status", async () => {
    await installSkillMdSymlinkForSkill(
      { id: "skill-a", name: "writer", source_id: "source-a" },
      "# writer a",
      "claude",
      "/prompthub/skills/skill-a",
      ["writer"],
    );

    expect(fsMocks.symlink).toHaveBeenCalledWith(
      "/prompthub/skills/skill-a",
      "/platform/skills/writer",
      "dir",
    );
    expect(fsMocks.writeFile).toHaveBeenCalledWith(
      "/platform/skills/.prompthub-platform-activations.json",
      expect.stringContaining('"writer"'),
      "utf-8",
    );
  });

  it("checks install status using logical platform directory plus activation state", async () => {
    internalMocks.fileExists.mockImplementation(async (target: string) => {
      if (target === "/platform/skills/writer/SKILL.md") {
        return true;
      }
      if (target === "/platform/skills/.prompthub-platform-activations.json") {
        return true;
      }
      return false;
    });
    fsMocks.readFile = vi.fn(async (target: string) => {
      if (target === "/platform/skills/.prompthub-platform-activations.json") {
        return JSON.stringify({
          writer: {
            skillId: "skill-a",
            skillName: "writer",
          },
        });
      }
      return "# Writer\n";
    }) as any;

    const status = await getSkillMdInstallStatusForSkill(
      { id: "skill-a", name: "writer", source_id: "source-a" },
      ["writer"],
    );

    expect(Object.values(status).every(Boolean)).toBe(true);
  });

  it("reports whether active platform installs are copies or symlinks", async () => {
    internalMocks.fileExists.mockImplementation(async (target: string) => {
      return (
        target.endsWith("/.prompthub-platform-activations.json") ||
        target.endsWith("/SKILL.md")
      );
    });
    fsMocks.readFile = vi.fn(async () =>
      JSON.stringify({
        writer: {
          skillId: "skill-a",
          skillName: "writer",
        },
      }),
    ) as any;
    utilsMocks.getPlatformSkillsDir.mockImplementation(
      (platform) => `/platform/${platform.id}/skills`,
    );
    fsMocks.lstat.mockImplementation(async (target: string) => {
      if (target.includes("/claude/")) {
        return {
          isSymbolicLink: () => true,
          isDirectory: () => false,
          isFile: () => false,
        };
      }
      return {
        isSymbolicLink: () => false,
        isDirectory: () => true,
        isFile: () => false,
      };
    });

    const status = await getSkillMdInstallStatusDetailsForSkill(
      { id: "skill-a", name: "writer", source_id: "source-a" },
      ["writer"],
    );

    expect(status.claude).toEqual({ installed: true, mode: "symlink" });
    expect(
      Object.values(status).some(
        (entry) => entry.installed && entry.mode === "copy",
      ),
    ).toBe(true);
  });

  it("reports Cherry Studio platform installs as symlinks when the registered folder is a link", async () => {
    const cherrySkillsDir =
      "/Users/demo/Library/Application Support/CherryStudio/Data/Skills";
    internalMocks.fileExists.mockImplementation(async (target: string) => {
      return target.endsWith(".prompthub-platform-activations.json");
    });
    fsMocks.readFile = vi.fn(async () =>
      JSON.stringify({
        writer: {
          skillId: "skill-a",
          skillName: "writer",
        },
      }),
    ) as any;
    utilsMocks.getPlatformSkillsDir.mockImplementation((platform) =>
      platform.id === "cherry-studio"
        ? cherrySkillsDir
        : `/platform/${platform.id}/skills`,
    );
    cherryStudioMocks.getCherryStudioSkillStatus.mockImplementation(
      async (_platform, skillName: string) => skillName === "writer",
    );
    fsMocks.lstat.mockImplementation(async (target: string) => ({
      isSymbolicLink: () => target === `${cherrySkillsDir}/writer`,
      isDirectory: () => target !== `${cherrySkillsDir}/writer`,
      isFile: () => false,
    }));

    const status = await getSkillMdInstallStatusDetailsForSkill(
      { id: "skill-a", name: "writer", source_id: "source-a" },
      ["writer"],
    );

    expect(status["cherry-studio"]).toEqual({
      installed: true,
      mode: "symlink",
    });
  });

  it("reports an agent-imported Cherry Studio skill as installed from its source path without activation state", async () => {
    const cherrySkillsDir =
      "/Users/demo/Library/Application Support/CherryStudio/Data/Skills";
    utilsMocks.getPlatformSkillsDir.mockImplementation((platform) =>
      platform.id === "cherry-studio"
        ? cherrySkillsDir
        : `/platform/${platform.id}/skills`,
    );
    internalMocks.fileExists.mockImplementation(async (target: string) => {
      return !target.endsWith(".prompthub-platform-activations.json");
    });
    cherryStudioMocks.getCherryStudioSkillStatus.mockImplementation(
      async (_platform, skillName: string) => skillName === "skill-creator",
    );

    const status = await getSkillMdInstallStatusDetailsForSkill(
      {
        id: "prompt-skill",
        name: "Skill Creator",
        source_id: "agent-import",
        source_url: `${cherrySkillsDir}/skill-creator`,
        local_repo_path: "/prompthub/skills/skill-creator",
      },
      ["Skill Creator"],
    );

    expect(status["cherry-studio"]).toEqual({
      installed: true,
      mode: "copy",
    });
  });

  it("uninstalls the shared logical platform directory and clears activation", async () => {
    internalMocks.fileExists.mockResolvedValue(true);
    fsMocks.readFile = vi.fn(async () =>
      JSON.stringify({
        writer: {
          skillId: "skill-a",
          skillName: "writer",
        },
      }),
    ) as any;

    await uninstallSkillMdForSkill(
      { id: "skill-a", name: "writer", source_id: "source-a" },
      "claude",
      ["writer"],
    );

    expect(fsMocks.rm).toHaveBeenCalledWith("/platform/skills/writer", {
      recursive: true,
      force: true,
    });
    expect(fsMocks.writeFile).toHaveBeenCalledWith(
      "/platform/skills/.prompthub-platform-activations.json",
      expect.not.stringContaining('"writer"'),
      "utf-8",
    );
  });

  it("propagates Cherry Studio built-in uninstall rejection without clearing activation or deleting files", async () => {
    const builtinError = new Error(
      "Cannot uninstall Cherry Studio built-in skill",
    );
    cherryStudioMocks.uninstallCherryStudioSkill.mockRejectedValueOnce(
      builtinError,
    );

    await expect(
      uninstallSkillMdForSkill(
        {
          id: "skill-built-in",
          name: "find-skills",
          source_id: "agent-import",
        },
        "cherry-studio",
        ["find-skills"],
      ),
    ).rejects.toThrow(/built-in skill/);

    expect(cherryStudioMocks.uninstallCherryStudioSkill).toHaveBeenCalledWith(
      expect.objectContaining({ id: "cherry-studio" }),
      "find-skills",
    );
    expect(fsMocks.rm).not.toHaveBeenCalled();
    expect(fsMocks.writeFile).not.toHaveBeenCalled();
  });

  it("removes the platform target for copy or symlink installs without deleting the PromptHub source", async () => {
    internalMocks.fileExists.mockResolvedValue(true);
    fsMocks.readFile = vi.fn(async () =>
      JSON.stringify({
        writer: {
          skillId: "skill-a",
          skillName: "writer",
        },
      }),
    ) as any;

    await uninstallSkillMdForSkill(
      { id: "skill-a", name: "writer", source_id: "source-a" },
      "claude",
      ["writer"],
    );

    expect(fsMocks.rm).toHaveBeenCalledTimes(1);
    expect(fsMocks.rm).toHaveBeenCalledWith("/platform/skills/writer", {
      recursive: true,
      force: true,
    });
    expect(fsMocks.rm).not.toHaveBeenCalledWith(
      "/prompthub/skills/skill-a",
      expect.anything(),
    );
    expect(fsMocks.rm).not.toHaveBeenCalledWith(
      "/prompthub/skills/writer",
      expect.anything(),
    );
  });
});

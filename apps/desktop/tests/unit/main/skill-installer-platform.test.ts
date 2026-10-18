/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// The filesystem is replaced below; use native absolute paths for its fixtures.
const { fixturePath, fixtureSuffix, separator } = await vi.hoisted(async () => {
  const path = await import("node:path");
  return {
    fixturePath: path.resolve,
    fixtureSuffix: path.normalize,
    separator: path.sep,
  };
});

const fsMocks = vi.hoisted(() => ({
  mkdir: vi.fn(),
  cp: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
  lstat: vi.fn(),
  rm: vi.fn(),
  symlink: vi.fn(),
  realpath: vi.fn(),
}));

const internalMocks = vi.hoisted(() => ({
  getSkillsDirAccessor: vi.fn(() => fixturePath("/prompthub/skills")),
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
    .mockResolvedValue(fixturePath("/prompthub/skills/demo-skill")),
}));

const utilsMocks = vi.hoisted(() => ({
  getPlatformSkillsDir: vi.fn<
    (
      platform: import("@prompthub/shared/constants/platforms").SkillPlatform,
    ) => string
  >(() => fixturePath("/platform/skills")),
  getCustomAgentPlatforms: vi.fn(() => []),
  getConfiguredBuiltinAgentPlatformIds: vi.fn(() => []),
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

// Target replacement is covered with real filesystem failure injection in core.
vi.mock("@prompthub/core/skills/destination", () => ({
  replaceSkillDestination: (
    target: string,
    prepare: (stage: string) => Promise<void>,
  ) => prepare(target),
}));

// Complete package conflict guards are exercised by CLI real-filesystem parity tests.
vi.mock("@prompthub/core/skills/platform-content", () => ({
  assertPlatformContentWritable: vi.fn().mockResolvedValue(undefined),
  fingerprintPlatformPackage: vi.fn().mockResolvedValue(undefined),
  inspectPlatformContent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("fs/promises", () => fsMocks);
vi.mock("@prompthub/core/skills/platform-files", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@prompthub/core/skills/platform-files")
  >()),
  fileExists: internalMocks.fileExists,
  getErrorCode: internalMocks.getErrorCode,
  validateSkillName: internalMocks.validateSkillName,
}));

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
  getPlatformRootDir: () => fixturePath("/platform"),
  getBuiltinAgentOverride: () => undefined,
  getPlatformSkillsDir: utilsMocks.getPlatformSkillsDir,
  getCustomAgentPlatforms: utilsMocks.getCustomAgentPlatforms,
  getConfiguredBuiltinAgentPlatformIds:
    utilsMocks.getConfiguredBuiltinAgentPlatformIds,
  validateMCPConfig: utilsMocks.validateMCPConfig,
}));

vi.mock("@prompthub/core/skills/cherry-studio-skill-platform", () => ({
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
    utilsMocks.getConfiguredBuiltinAgentPlatformIds.mockReturnValue([]);
    utilsMocks.getPlatformSkillsDir.mockReturnValue(
      fixturePath("/platform/skills"),
    );
    fsMocks.lstat.mockRejectedValue(
      Object.assign(new Error("missing"), { code: "ENOENT" }),
    );
    fsMocks.mkdir.mockResolvedValue(undefined);
    fsMocks.cp.mockResolvedValue(undefined);
    fsMocks.readFile.mockResolvedValue("{}");
    fsMocks.writeFile.mockResolvedValue(undefined);
    fsMocks.rename.mockResolvedValue(undefined);
    fsMocks.rm.mockResolvedValue(undefined);
    fsMocks.symlink.mockResolvedValue(undefined);
    fsMocks.realpath.mockImplementation(async (targetPath: string) =>
      targetPath === fixturePath("/prompthub/skills/linked-demo")
        ? fixturePath("/external/skills/linked-demo")
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
      fixturePath("/platform/skills/demo-skill"),
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
      fixturePath("/prompthub/skills/linked-demo"),
    );

    expect(fsMocks.symlink).not.toHaveBeenCalled();
    expect(fsMocks.cp).toHaveBeenCalledWith(
      fixturePath("/external/skills/linked-demo"),
      fixturePath("/platform/skills/linked-demo"),
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
      fixturePath("/prompthub/skills/demo-skill"),
    );

    expect(cherryStudioMocks.installCherryStudioSkill).toHaveBeenCalledWith(
      expect.objectContaining({ id: "cherry-studio" }),
      "demo-skill",
      fixturePath("/prompthub/skills/demo-skill"),
      expect.objectContaining({
        overrides: { "cherry-studio": fixturePath("/platform") },
      }),
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

  it("marks built-in platforms with user overrides as configured targets", () => {
    utilsMocks.getConfiguredBuiltinAgentPlatformIds.mockReturnValue(["claude"]);

    const claude = getSupportedPlatforms().find(
      (platform) => platform.id === "claude",
    );

    expect(claude?.isConfigured).toBe(true);
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
      fixturePath("/prompthub/skills/demo-skill"),
    );

    expect(cherryStudioMocks.installCherryStudioSkill).toHaveBeenCalledWith(
      expect.objectContaining({ id: "cherry-studio" }),
      "demo-skill",
      fixturePath("/prompthub/skills/demo-skill"),
      expect.objectContaining({ mode: "symlink" }),
    );
    expect(fsMocks.symlink).not.toHaveBeenCalled();
    expect(result).toEqual({
      requestedMode: "symlink",
      effectiveMode: "symlink",
    });
  });

  it("propagates Cherry Studio copy-only guidance without a fallback write", async () => {
    const error = Object.assign(
      new Error("Cherry Studio only supports copy distribution"),
      { code: "cherry-copy-only" },
    );
    cherryStudioMocks.installCherryStudioSkill.mockRejectedValueOnce(error);
    await expect(
      installSkillMdSymlink(
        "demo-skill",
        "# skill",
        "cherry-studio",
        fixturePath("/prompthub/skills/demo-skill"),
      ),
    ).rejects.toBe(error);
    expect(cherryStudioMocks.installCherryStudioSkill).toHaveBeenCalledOnce();
    expect(fsMocks.symlink).not.toHaveBeenCalled();
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
      fixturePath("/prompthub/skills/demo-skill"),
      fixturePath("/platform/skills/demo-skill"),
      "dir",
    );
    expect(fsMocks.cp).toHaveBeenCalledWith(
      fixturePath("/prompthub/skills/demo-skill"),
      fixturePath("/platform/skills/demo-skill"),
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

    expect(fsMocks.mkdir).toHaveBeenCalledWith(
      fixturePath("/prompthub/skills/demo-skill"),
      {
        recursive: true,
      },
    );
    expect(fsMocks.mkdir).toHaveBeenCalledWith(
      fixturePath("/platform/skills"),
      {
        recursive: true,
      },
    );
    expect(fsMocks.symlink).toHaveBeenCalledWith(
      fixturePath("/prompthub/skills/demo-skill"),
      fixturePath("/platform/skills/demo-skill"),
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
      fixturePath("/prompthub/skills/demo-skill"),
      fixturePath("/platform/skills/demo-skill"),
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
      fixturePath("/prompthub/skills/skill-a"),
      ["writer"],
    );

    expect(fsMocks.cp).toHaveBeenCalledWith(
      fixturePath("/prompthub/skills/skill-a"),
      fixturePath("/platform/skills/writer"),
      expect.objectContaining({
        recursive: true,
        filter: expect.any(Function),
      }),
    );
    expect(fsMocks.writeFile).toHaveBeenCalledWith(
      expect.stringContaining(".prompthub-platform-activations.json.tmp-"),
      expect.stringContaining('"writer"'),
      "utf-8",
    );
  });

  it("records activation state for symlink installs so UI reads installed status", async () => {
    await installSkillMdSymlinkForSkill(
      { id: "skill-a", name: "writer", source_id: "source-a" },
      "# writer a",
      "claude",
      fixturePath("/prompthub/skills/skill-a"),
      ["writer"],
    );

    expect(fsMocks.symlink).toHaveBeenCalledWith(
      fixturePath("/prompthub/skills/skill-a"),
      fixturePath("/platform/skills/writer"),
      "dir",
    );
    expect(fsMocks.writeFile).toHaveBeenCalledWith(
      expect.stringContaining(".prompthub-platform-activations.json.tmp-"),
      expect.stringContaining('"writer"'),
      "utf-8",
    );
  });

  it("checks install status using logical platform directory plus activation state", async () => {
    internalMocks.fileExists.mockImplementation(async (target: string) => {
      if (target === fixturePath("/platform/skills/writer/SKILL.md")) {
        return true;
      }
      if (
        target ===
        fixturePath("/platform/skills/.prompthub-platform-activations.json")
      ) {
        return true;
      }
      return false;
    });
    fsMocks.readFile = vi.fn(async (target: string) => {
      if (
        target ===
        fixturePath("/platform/skills/.prompthub-platform-activations.json")
      ) {
        return JSON.stringify({
          writer: {
            skillId: "skill-a",
            skillName: "writer",
          },
        });
      }
      return "# Writer\n";
    });

    const status = await getSkillMdInstallStatusForSkill(
      { id: "skill-a", name: "writer", source_id: "source-a" },
      ["writer"],
    );

    const { "agent-skills-global": sharedStatus, ...platformStatus } = status;
    expect(Object.values(platformStatus).every(Boolean)).toBe(true);
    expect(sharedStatus).toBe(false);
  });

  it("does not report same-name inactive variants as installed", async () => {
    internalMocks.fileExists.mockImplementation(async (target: string) => {
      if (target === fixturePath("/platform/skills/writer/SKILL.md")) {
        return true;
      }
      if (
        target ===
        fixturePath("/platform/skills/.prompthub-platform-activations.json")
      ) {
        return true;
      }
      return false;
    });
    fsMocks.readFile = vi.fn(async (target: string) => {
      if (
        target ===
        fixturePath("/platform/skills/.prompthub-platform-activations.json")
      ) {
        return JSON.stringify({
          writer: {
            skillId: "skill-a",
            skillName: "writer",
          },
        });
      }
      return "# Writer\n";
    });

    const activeStatus = await getSkillMdInstallStatusForSkill(
      { id: "skill-a", name: "writer", source_id: "source-a" },
      ["writer"],
    );
    const inactiveStatus = await getSkillMdInstallStatusForSkill(
      { id: "skill-b", name: "writer", source_id: "source-b" },
      ["writer"],
    );
    const inactiveDetails = await getSkillMdInstallStatusDetailsForSkill(
      { id: "skill-b", name: "writer", source_id: "source-b" },
      ["writer"],
    );

    const {
      "agent-skills-global": activeSharedStatus,
      ...activePlatformStatus
    } = activeStatus;
    expect(Object.values(activePlatformStatus).every(Boolean)).toBe(true);
    expect(activeSharedStatus).toBe(false);
    expect(Object.values(inactiveStatus).some(Boolean)).toBe(false);
    expect(
      Object.values(inactiveDetails).some((entry) => entry.installed),
    ).toBe(false);
  });

  it("reports whether active platform installs are copies or symlinks", async () => {
    internalMocks.fileExists.mockImplementation(async (target: string) => {
      return (
        target.endsWith(
          fixtureSuffix("/.prompthub-platform-activations.json"),
        ) || target.endsWith(fixtureSuffix("/SKILL.md"))
      );
    });
    fsMocks.readFile = vi.fn(async () =>
      JSON.stringify({
        writer: {
          skillId: "skill-a",
          skillName: "writer",
        },
      }),
    );
    utilsMocks.getPlatformSkillsDir.mockImplementation((platform) =>
      fixturePath(`/platform/${platform.id}/skills`),
    );
    fsMocks.lstat.mockImplementation(async (target: string) => {
      if (target.includes(`${separator}claude${separator}`)) {
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
    const cherrySkillsDir = fixturePath(
      "/Users/demo/Library/Application Support/CherryStudio/Data/Skills",
    );
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
    );
    utilsMocks.getPlatformSkillsDir.mockImplementation((platform) =>
      platform.id === "cherry-studio"
        ? cherrySkillsDir
        : fixturePath(`/platform/${platform.id}/skills`),
    );
    cherryStudioMocks.getCherryStudioSkillStatus.mockImplementation(
      async (_platform, skillName: string) => skillName === "writer",
    );
    fsMocks.lstat.mockImplementation(async (target: string) => ({
      isSymbolicLink: () => target === fixturePath(cherrySkillsDir, "writer"),
      isDirectory: () => target !== fixturePath(cherrySkillsDir, "writer"),
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
    const cherrySkillsDir = fixturePath(
      "/Users/demo/Library/Application Support/CherryStudio/Data/Skills",
    );
    utilsMocks.getPlatformSkillsDir.mockImplementation((platform) =>
      platform.id === "cherry-studio"
        ? cherrySkillsDir
        : fixturePath(`/platform/${platform.id}/skills`),
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
        source_url: fixturePath(cherrySkillsDir, "skill-creator"),
        local_repo_path: fixturePath("/prompthub/skills/skill-creator"),
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
    );

    await uninstallSkillMdForSkill(
      { id: "skill-a", name: "writer", source_id: "source-a" },
      "claude",
      ["writer"],
    );

    expect(fsMocks.rm).toHaveBeenCalledWith(
      fixturePath("/platform/skills/writer"),
      {
        recursive: true,
        force: true,
      },
    );
    expect(fsMocks.writeFile).toHaveBeenCalledWith(
      expect.stringContaining(".prompthub-platform-activations.json.tmp-"),
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
      expect.objectContaining({
        overrides: { "cherry-studio": fixturePath("/platform") },
      }),
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
    );

    await uninstallSkillMdForSkill(
      { id: "skill-a", name: "writer", source_id: "source-a" },
      "claude",
      ["writer"],
    );

    expect(fsMocks.rm).toHaveBeenCalledWith(
      fixturePath("/platform/skills/writer"),
      {
        recursive: true,
        force: true,
      },
    );
    expect(fsMocks.rm).not.toHaveBeenCalledWith(
      fixturePath("/prompthub/skills/skill-a"),
      expect.anything(),
    );
    expect(fsMocks.rm).not.toHaveBeenCalledWith(
      fixturePath("/prompthub/skills/writer"),
      expect.anything(),
    );
  });
});

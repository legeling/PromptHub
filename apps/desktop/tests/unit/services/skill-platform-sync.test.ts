import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  syncSkillsToPlatforms,
  unsyncSkillsFromPlatforms,
} from "../../../src/renderer/services/skill-platform-sync";
import { createSkillFixture } from "../../fixtures/skills";
import { installWindowMocks } from "../../helpers/window";

describe("syncSkillsToPlatforms", () => {
  beforeEach(() => {
    installWindowMocks({
      api: {
        skill: {
          export: vi.fn().mockResolvedValue("# demo"),
          installMd: vi.fn().mockResolvedValue(undefined),
          installMdSymlink: vi.fn().mockResolvedValue(undefined),
          uninstallMd: vi.fn().mockResolvedValue(undefined),
        },
      },
    });
  });

  it("installs all selected skills to all selected platforms", async () => {
    const progress = vi.fn();

    const result = await syncSkillsToPlatforms(
      [
        createSkillFixture({ id: "skill-1", name: "alpha" }),
        createSkillFixture({ id: "skill-2", name: "beta" }),
      ],
      ["claude", "cursor"],
      "copy",
      progress,
    );

    expect(window.api.skill.export).toHaveBeenCalledTimes(2);
    expect(window.api.skill.installMd).toHaveBeenCalledTimes(4);
    expect(result).toEqual({
      successCount: 4,
      totalCount: 4,
      failures: [],
      fallbacks: [],
    });
    expect(progress).toHaveBeenLastCalledWith({
      current: 4,
      total: 4,
      skillName: "beta",
      platformId: "cursor",
    });
  });

  it("collects failures and continues syncing remaining targets", async () => {
    const installMdSymlink = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("permission denied"));
    (window as any).api.skill.installMdSymlink = installMdSymlink;

    const result = await syncSkillsToPlatforms(
      [{ id: "skill-1", name: "alpha" }] as any,
      ["claude", "cursor"],
      "symlink",
    );

    expect(result.successCount).toBe(1);
    expect(result.totalCount).toBe(2);
    expect(result.failures).toEqual([
      {
        skillName: "alpha",
        platformId: "cursor",
        reason: "permission denied",
      },
    ]);
    expect(result.fallbacks).toEqual([]);
  });

  it("surfaces symlink fallback installs as warnings instead of silent success", async () => {
    const installMdSymlink = vi
      .fn()
      .mockResolvedValueOnce({
        requestedMode: "symlink",
        effectiveMode: "copy",
        fallbackReason: "EPERM: operation not permitted",
      })
      .mockResolvedValueOnce({
        requestedMode: "symlink",
        effectiveMode: "symlink",
      });
    (window as any).api.skill.installMdSymlink = installMdSymlink;

    const result = await syncSkillsToPlatforms(
      [{ id: "skill-1", name: "alpha" }] as any,
      ["claude", "cursor"],
      "symlink",
    );

    expect(result.successCount).toBe(2);
    expect(result.failures).toEqual([]);
    expect(result.fallbacks).toEqual([
      {
        skillName: "alpha",
        platformId: "claude",
        requestedMode: "symlink",
        effectiveMode: "copy",
        reason: "EPERM: operation not permitted",
      },
    ]);
  });

  it("uninstalls all selected skills from selected platforms", async () => {
    const result = await unsyncSkillsFromPlatforms(
      [{ id: "skill-1", name: "alpha" }] as any,
      ["claude", "cursor"],
    );

    expect(window.api.skill.uninstallMd).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      successCount: 2,
      totalCount: 2,
      failures: [],
      fallbacks: [],
    });
  });
});

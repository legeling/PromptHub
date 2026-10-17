import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  syncSkillsToPlatforms,
  unsyncSkillsFromPlatforms,
} from "../../../src/renderer/services/skill-platform-sync";
import i18n from "../../../src/renderer/i18n";
import { createSkillFixture } from "../../fixtures/skills";
import { installWindowMocks } from "../../helpers/window";

describe("syncSkillsToPlatforms", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
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
      skillId: "skill-2",
      platformId: "cursor",
    });
  });

  it("collects failures and continues syncing remaining targets", async () => {
    const installMdSymlink = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("SKILL_PLATFORM:permission-denied"));
    window.api.skill.installMdSymlink = installMdSymlink;

    const result = await syncSkillsToPlatforms(
      [createSkillFixture({ id: "skill-1", name: "alpha" })],
      ["claude", "cursor"],
      "symlink",
    );

    expect(result.successCount).toBe(1);
    expect(result.totalCount).toBe(2);
    expect(result.failures).toEqual([
      {
        skillId: "skill-1",
        platformId: "cursor",
        reason:
          "Cannot access the target directory. Check its write permissions and try again.",
        severity: "warning",
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
    window.api.skill.installMdSymlink = installMdSymlink;

    const result = await syncSkillsToPlatforms(
      [createSkillFixture({ id: "skill-1", name: "alpha" })],
      ["claude", "cursor"],
      "symlink",
    );

    expect(result.successCount).toBe(2);
    expect(result.failures).toEqual([]);
    expect(result.fallbacks).toEqual([
      {
        skillId: "skill-1",
        platformId: "claude",
        requestedMode: "symlink",
        effectiveMode: "copy",
        reason:
          "Current permissions or filesystem do not support symbolic links.",
      },
    ]);
  });

  it("keeps unknown native diagnostics out of user-facing failures", async () => {
    window.api.skill.installMd = vi
      .fn()
      .mockRejectedValue(
        new Error(
          "Error invoking remote method: SQL failure at /private/auth.json",
        ),
      );
    const result = await syncSkillsToPlatforms(
      [createSkillFixture({ id: "skill-1", name: "alpha" })],
      ["claude"],
      "copy",
    );
    expect(result).toEqual({
      successCount: 0,
      totalCount: 1,
      fallbacks: [],
      failures: [
        {
          skillId: "skill-1",
          platformId: "claude",
          severity: "error",
          reason:
            "The platform operation failed. Check the platform configuration and try again; see logs for details.",
        },
      ],
    });
  });

  it("uninstalls all selected skills from selected platforms", async () => {
    const result = await unsyncSkillsFromPlatforms(
      [createSkillFixture({ id: "skill-1", name: "alpha" })],
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

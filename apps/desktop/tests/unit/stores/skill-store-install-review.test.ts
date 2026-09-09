import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/renderer/services/webdav-save-sync", () => ({
  scheduleAllSaveSync: vi.fn(),
}));

import type {
  RegistrySkill,
  SkillUpdateSafetyReview,
} from "@prompthub/shared/types";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { createSkillFixture } from "../../fixtures/skills";
import { installWindowMocks } from "../../helpers/window";

const GITEA_SKILL: RegistrySkill = {
  slug: "private-writer",
  source_id: "source-gitea-private-writer",
  name: "Private Writer",
  description: "A self-hosted Gitea Skill",
  category: "general",
  author: "icelemon",
  source_url: "https://gitea.example.com/team/skills",
  source_branch: "main",
  source_directory: "skills/private-writer",
  canonical_skill_path: "skills/private-writer/SKILL.md",
  directory_fingerprint: "catalog-fingerprint",
  tags: ["writing"],
  version: "1.0.0",
  content: "# Private Writer\n",
};

const REVIEW: SkillUpdateSafetyReview = {
  sourceKey:
    "git:https://gitea.example.com/team/skills#main:skills/private-writer",
  packageFingerprint: "a".repeat(64),
  report: {
    level: "high-risk",
    summary: "Review the user-authored package script.",
    findings: [
      {
        code: "script-file",
        severity: "high",
        title: "Script requires review",
        detail: "The package contains a user-authored script.",
        filePath: "scripts/install.sh",
      },
    ],
    recommendedAction: "review",
    scannedAt: 1,
    checkedFileCount: 2,
    scanMethod: "preflight",
  },
};

function resetStores() {
  useSkillStore.setState({
    skills: [],
    selectedSkillId: null,
    isLoading: false,
    error: null,
    registrySkills: [],
    customStoreSources: [],
    remoteStoreEntries: {},
    pendingPluginChildDeploySkillIds: [],
  });
  useSettingsStore.setState({
    autoScanStoreSkillsBeforeInstall: false,
    skillSafetyChannelPolicies: {},
    skillSafetyStorePolicies: {},
    trustedSkillUpdateSourceKeys: [],
  });
}

describe("registry Skill install safety review", () => {
  beforeEach(() => {
    resetStores();
    installWindowMocks({
      api: {
        skill: {
          getAll: vi.fn().mockResolvedValue([]),
          getRemoteGitPackageSnapshot: vi.fn().mockResolvedValue({
            content: GITEA_SKILL.content,
            directoryFingerprint: "0".repeat(64),
          }),
          saveSafetyReport: vi.fn().mockResolvedValue(undefined),
        },
      },
    });
  });

  it("returns an actionable review result instead of flattening it into an install error", async () => {
    const create = vi.fn();
    const deleteSkill = vi.fn();
    const runPackageOperation = vi.fn().mockResolvedValue({
      status: "review-required",
      operation: "install",
      review: REVIEW,
    });
    (window as any).api.skill.create = create;
    (window as any).api.skill.delete = deleteSkill;
    (window as any).api.skill.runPackageOperation = runPackageOperation;

    const result = await useSkillStore
      .getState()
      .installRegistrySkill(GITEA_SKILL);

    expect(result).toEqual({
      status: "safety-review-required",
      review: REVIEW,
    });
    expect(runPackageOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "install",
        registrySkill: GITEA_SKILL,
        source: {
          kind: "remote-git",
          repoUrl: GITEA_SKILL.source_url,
          branch: GITEA_SKILL.source_branch,
          directory: GITEA_SKILL.source_directory,
        },
      }),
    );
    expect(create).not.toHaveBeenCalled();
    expect(deleteSkill).not.toHaveBeenCalled();
    expect((window as any).api.skill.getAll).not.toHaveBeenCalled();
  });

  it("installs while ignoring legacy content approval fields", async () => {
    const installed = createSkillFixture({
      id: "approved-private-writer",
      name: "private-writer",
      source_id: GITEA_SKILL.source_id,
      local_repo_path: "/managed/private-writer/repo",
    });
    const runPackageOperation = vi.fn().mockResolvedValue({
      status: "completed",
      operation: "install",
      skill: installed,
    });
    const getAll = vi.fn().mockResolvedValue([installed]);
    (window as any).api.skill.runPackageOperation = runPackageOperation;
    (window as any).api.skill.getAll = getAll;

    const result = await useSkillStore
      .getState()
      .installRegistrySkill(GITEA_SKILL, {
        approvedPackageFingerprint: REVIEW.packageFingerprint,
      });

    expect(result).toEqual({ status: "installed", skill: installed });
    expect(runPackageOperation).toHaveBeenCalledWith({
      operation: "install",
      skillId: undefined,
      registrySkill: GITEA_SKILL,
      source: {
        kind: "remote-git",
        repoUrl: GITEA_SKILL.source_url,
        branch: GITEA_SKILL.source_branch,
        directory: GITEA_SKILL.source_directory,
      },
      content: GITEA_SKILL.content,
      markAsBuiltin: true,
      note: undefined,
    });
    expect(getAll).toHaveBeenCalledTimes(1);
  });

  it("does not forward automatic scanning settings to package operations", async () => {
    useSettingsStore.setState({
      autoScanStoreSkillsBeforeInstall: true,
    });
    const installed = createSkillFixture({
      id: "scanned-private-writer",
      name: "private-writer",
      source_id: GITEA_SKILL.source_id,
    });
    const runPackageOperation = vi.fn().mockResolvedValue({
      status: "completed",
      operation: "install",
      skill: installed,
    });
    (window as any).api.skill.runPackageOperation = runPackageOperation;
    (window as any).api.skill.getAll = vi.fn().mockResolvedValue([installed]);

    await useSkillStore.getState().installRegistrySkill(GITEA_SKILL);

    expect(runPackageOperation.mock.calls[0][0].safetyScan).toBeUndefined();
  });

  it("does not forward channel overrides to package operations", async () => {
    useSettingsStore.setState({
      autoScanStoreSkillsBeforeInstall: true,
      skillSafetyChannelPolicies: { "git-repo": "enabled" },
      skillSafetyStorePolicies: { "team-gitea": "disabled" },
    });
    useSkillStore.setState({
      customStoreSources: [
        {
          id: "team-gitea",
          name: "Team Gitea",
          type: "git-repo",
          url: "https://gitea.example.com/team/skills",
          branch: "main",
          enabled: true,
          createdAt: 1,
        },
      ],
    });
    const installed = createSkillFixture({
      id: "policy-private-writer",
      name: "private-writer",
      source_id: GITEA_SKILL.source_id,
    });
    const runPackageOperation = vi.fn().mockResolvedValue({
      status: "completed",
      operation: "install",
      skill: installed,
    });
    (window as any).api.skill.runPackageOperation = runPackageOperation;
    (window as any).api.skill.getAll = vi.fn().mockResolvedValue([installed]);

    await useSkillStore.getState().installRegistrySkill(GITEA_SKILL);

    expect(runPackageOperation).toHaveBeenCalledWith(
      expect.objectContaining({
      }),
    );
  });

  it("surfaces an incomplete main-process rollback without attempting renderer compensation", async () => {
    const create = vi.fn();
    const deleteSkill = vi.fn();
    (window as any).api.skill.create = create;
    (window as any).api.skill.delete = deleteSkill;
    (window as any).api.skill.runPackageOperation = vi.fn().mockResolvedValue({
      status: "failed",
      operation: "install",
      failure: {
        code: "ROLLBACK_INCOMPLETE",
        phase: "rollback",
        summary: "Install rollback could not remove all durable state",
      },
    });

    await expect(
      useSkillStore.getState().installRegistrySkill(GITEA_SKILL),
    ).rejects.toThrow(/Install rollback could not remove all durable state/);
    expect(create).not.toHaveBeenCalled();
    expect(deleteSkill).not.toHaveBeenCalled();
  });
});

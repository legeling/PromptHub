import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/renderer/services/ai", () => ({
  chatCompletion: vi.fn(),
}));

import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { createSkillFixture } from "../../fixtures/skills";
import { installWindowMocks } from "../../helpers/window";

const resetSkillStore = () => {
  useSkillStore.setState({
    skills: [],
    selectedSkillId: null,
    isLoading: false,
    error: null,
    viewMode: "gallery",
    searchQuery: "",
    filterType: "all",
    filterTags: [],
    deployedSkillNames: new Set<string>(),
    storeView: "my-skills",
    registrySkills: [],
    isLoadingRegistry: false,
    storeCategory: "all",
    storeSearchQuery: "",
    selectedRegistrySlug: null,
    customStoreSources: [],
    selectedStoreSourceId: "official",
    remoteStoreEntries: {},
    translationCache: {},
  });
  localStorage.clear();
};

describe("skill store", () => {
  beforeEach(() => {
    resetSkillStore();
    installWindowMocks({
      api: {
        skill: {
          getAll: vi.fn(),
          update: vi.fn(),
          writeLocalFile: vi.fn(),
          getRepoPath: vi.fn(),
        },
      },
    });
  });

  it("applies deployed and tag filters in getFilteredSkills", () => {
    useSkillStore.setState({
      skills: [
        createSkillFixture({
          id: "skill-1",
          name: "alpha",
          tags: ["team", "ops"],
        }),
        createSkillFixture({
          id: "skill-2",
          name: "beta",
          tags: ["docs"],
        }),
      ],
      filterType: "deployed",
      filterTags: ["team"],
      deployedSkillNames: new Set(["alpha"]),
    });

    expect(useSkillStore.getState().getFilteredSkills().map((skill) => skill.id)).toEqual([
      "skill-1",
    ]);
  });

  it("falls back to official source when removing the selected custom source", () => {
    useSkillStore.setState({
      customStoreSources: [
        {
          id: "custom-1",
          name: "Custom",
          type: "marketplace-json",
          url: "https://example.com/skills.json",
          enabled: true,
          createdAt: 1,
        },
      ],
      selectedStoreSourceId: "custom-1",
      remoteStoreEntries: {
        "custom-1": {
          loadedAt: 1,
          skills: [],
        },
      },
    });

    useSkillStore.getState().removeCustomStoreSource("custom-1");

    const state = useSkillStore.getState();
    expect(state.selectedStoreSourceId).toBe("official");
    expect(state.customStoreSources).toHaveLength(0);
    expect(state.remoteStoreEntries["custom-1"]).toBeUndefined();
  });

  it("syncs an intentionally empty SKILL.md back to the local repo on update", async () => {
    const update = vi.fn().mockResolvedValue({
      id: "skill-1",
      name: "alpha",
      instructions: "",
      content: "",
      local_repo_path: "/tmp/skills/alpha",
      protocol_type: "skill",
      is_favorite: false,
      created_at: 1,
      updated_at: 2,
    });
    const writeLocalFile = vi.fn().mockResolvedValue(undefined);
    const getRepoPath = vi.fn().mockResolvedValue("/tmp/skills/alpha");

    (window as any).api.skill.update = update;
    (window as any).api.skill.writeLocalFile = writeLocalFile;
    (window as any).api.skill.getRepoPath = getRepoPath;

    useSkillStore.setState({
      skills: [
        createSkillFixture({
          id: "skill-1",
          name: "alpha",
          instructions: "old content",
          content: "old content",
        }),
      ],
    });

    await useSkillStore.getState().updateSkill("skill-1", {
      instructions: "",
      content: "",
    });

    expect(writeLocalFile).toHaveBeenCalledWith(
      "skill-1",
      "SKILL.md",
      "",
      { skipVersionSnapshot: true },
    );
    expect(useSkillStore.getState().skills[0]?.local_repo_path).toBe(
      "/tmp/skills/alpha",
    );
  });

  it("does not rewrite SKILL.md when updating metadata only", async () => {
    const update = vi.fn().mockResolvedValue({
      id: "skill-1",
      name: "alpha",
      instructions: "same content",
      content: "same content",
      tags: ["ops"],
      local_repo_path: "/tmp/skills/alpha",
      protocol_type: "skill",
      is_favorite: false,
      created_at: 1,
      updated_at: 2,
    });

    (window as any).api.skill.update = update;

    useSkillStore.setState({
      skills: [
        createSkillFixture({
          id: "skill-1",
          name: "alpha",
          instructions: "same content",
          content: "same content",
          tags: ["docs"],
        }),
      ],
    });

    await useSkillStore.getState().updateSkill("skill-1", {
      tags: ["ops"],
    });

    expect((window as any).api.skill.writeLocalFile).not.toHaveBeenCalled();
    expect((window as any).api.skill.getRepoPath).not.toHaveBeenCalled();
  });

  it("normalizes legacy skill payloads when loading skills", async () => {
    (window as any).api.skill.getAll = vi.fn().mockResolvedValue([
      {
        id: "skill-1",
        name: "alpha",
        tags: '["ops","docs"]',
        original_tags: "seed, legacy",
        protocol_type: "skill",
        is_favorite: false,
        currentVersion: "2",
        created_at: "1",
        updated_at: "2",
      },
    ]);

    await useSkillStore.getState().loadSkills();

    expect(useSkillStore.getState().skills).toEqual([
      expect.objectContaining({
        id: "skill-1",
        tags: ["ops", "docs"],
        original_tags: ["seed", "legacy"],
        currentVersion: 2,
        created_at: 1,
        updated_at: 2,
      }),
    ]);
  });

  it("prefers install_name over registry slug when importing a registry skill", async () => {
    const create = vi.fn().mockResolvedValue(
      createSkillFixture({
        id: "skill-2",
        name: "find-skills",
        registry_slug: "vercel-labs-skills-find-skills",
      }),
    );
    const getAll = vi.fn().mockResolvedValue([]);

    (window as any).api.skill.create = create;
    (window as any).api.skill.getAll = getAll;

    await useSkillStore.getState().installRegistrySkill({
      slug: "vercel-labs-skills-find-skills",
      install_name: "find-skills",
      name: "find-skills",
      description: "Community skill",
      category: "dev",
      author: "vercel-labs",
      source_url: "https://github.com/vercel-labs/skills",
      store_url: "https://skills.sh/vercel-labs/skills/find-skills",
      tags: ["search"],
      version: "1.0.0",
      content: "# Finding Skills",
      weekly_installs: "774.9K",
      compatibility: ["opencode", "codex"],
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "find-skills",
        registry_slug: "vercel-labs-skills-find-skills",
      }),
    );
  });

  it("blocks installing official registry skills when only placeholder frontmatter is available", async () => {
    const create = vi.fn();
    const fetchRemoteContent = vi.fn().mockRejectedValue(new Error("network down"));

    (window as any).api.skill.create = create;
    (window as any).api.skill.fetchRemoteContent = fetchRemoteContent;

    await expect(
      useSkillStore.getState().installRegistrySkill({
        slug: "pdf",
        name: "PDF Skill",
        description: "PDF helper",
        category: "office",
        author: "Anthropic",
        source_url: "https://github.com/anthropics/skills/tree/main/skills/pdf",
        content_url:
          "https://raw.githubusercontent.com/anthropics/skills/main/skills/pdf/SKILL.md",
        tags: ["pdf"],
        version: "1.0.0",
        content: `---
name: pdf
description: Use this skill for PDF tasks.
---`,
        compatibility: ["claude"],
      }),
    ).rejects.toThrow(/full SKILL\.md/i);

    expect(create).not.toHaveBeenCalled();
  });

  it("aggregates safety levels when batch scanning installed skills", async () => {
    const scanSafety = vi
      .fn()
      .mockResolvedValueOnce({ level: "safe" })
      .mockResolvedValueOnce({ level: "warn" })
      .mockResolvedValueOnce({ level: "high-risk" })
      .mockResolvedValueOnce({ level: "blocked" });

    (window as any).api.skill.scanSafety = scanSafety;

    useSkillStore.setState({
      skills: [
        createSkillFixture({ id: "skill-1", name: "safe-skill" }),
        createSkillFixture({ id: "skill-2", name: "warn-skill" }),
        createSkillFixture({ id: "skill-3", name: "high-skill" }),
        createSkillFixture({ id: "skill-4", name: "blocked-skill" }),
      ],
    });

    const summary = await useSkillStore.getState().scanInstalledSkillSafety();

    expect(summary).toEqual({
      total: 4,
      safe: 1,
      warn: 1,
      highRisk: 1,
      blocked: 1,
      bySkillId: {
        "skill-1": "safe",
        "skill-2": "warn",
        "skill-3": "high-risk",
        "skill-4": "blocked",
      },
    });
    expect(scanSafety).toHaveBeenCalledTimes(4);
  });
});

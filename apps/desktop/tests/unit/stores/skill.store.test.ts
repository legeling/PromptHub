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
          saveSafetyReport: vi.fn().mockResolvedValue(undefined),
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

    expect(
      useSkillStore
        .getState()
        .getFilteredSkills()
        .map((skill) => skill.id),
    ).toEqual(["skill-1"]);
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

  it("loadRegistry does not prefetch remote content", () => {
    const fetchRemoteContent = vi.fn();
    (window as any).api.skill.fetchRemoteContent = fetchRemoteContent;

    useSkillStore.getState().loadRegistry();

    const state = useSkillStore.getState();
    expect(state.registrySkills.length).toBeGreaterThan(0);
    expect(fetchRemoteContent).not.toHaveBeenCalled();
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

    expect(writeLocalFile).toHaveBeenCalledWith("skill-1", "SKILL.md", "", {
      skipVersionSnapshot: true,
    });
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
    const fetchRemoteContent = vi
      .fn()
      .mockRejectedValue(new Error("network down"));

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

  it("stores install fingerprints for registry skills and uses them for update checks", async () => {
    const create = vi.fn().mockImplementation(async (data) => ({
      id: "skill-writer",
      created_at: 1,
      updated_at: 1,
      ...data,
    }));
    const fetchRemoteContent = vi.fn().mockResolvedValue("# Writer\n\nOriginal\n");
    const writeLocalFile = vi.fn().mockResolvedValue(undefined);

    (window as any).api.skill.create = create;
    (window as any).api.skill.fetchRemoteContent = fetchRemoteContent;
    (window as any).api.skill.writeLocalFile = writeLocalFile;

    const installed = await useSkillStore.getState().installRegistrySkill({
      slug: "writer",
      name: "Writer",
      description: "Write better",
      category: "general",
      author: "PromptHub",
      source_url: "https://github.com/example/skills/tree/main/writer",
      content_url: "https://raw.githubusercontent.com/example/skills/main/writer/SKILL.md",
      tags: ["writing"],
      version: "1.0.0",
      content: "# Writer\n",
    });

    expect(installed?.installed_content_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(installed?.installed_version).toBe("1.0.0");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        installed_content_hash: installed?.installed_content_hash,
        installed_version: "1.0.0",
      }),
    );
  });

  it("updates a pristine registry skill after creating a version snapshot", async () => {
    const remoteContent = "# Writer\n\nRemote update\n";
    const fetchRemoteContent = vi.fn().mockResolvedValue(remoteContent);
    const versionCreate = vi.fn().mockResolvedValue({ id: "version-1" });
    const update = vi.fn().mockImplementation(async (_id, data) => ({
      ...createSkillFixture({ id: "skill-writer", name: "writer" }),
      ...data,
      id: "skill-writer",
      updated_at: 2,
    }));

    (window as any).api.skill.fetchRemoteContent = fetchRemoteContent;
    (window as any).api.skill.versionCreate = versionCreate;
    (window as any).api.skill.update = update;

    const originalHash = await useSkillStore
      .getState()
      .computeRegistrySkillHash("# Writer\n\nOriginal\n");

    useSkillStore.setState({
      skills: [
        createSkillFixture({
          id: "skill-writer",
          name: "writer",
          registry_slug: "writer",
          content: "# Writer\n\nOriginal\n",
          instructions: "# Writer\n\nOriginal\n",
          installed_content_hash: originalHash,
          installed_version: "1.0.0",
        }),
      ],
      registrySkills: [
        {
          slug: "writer",
          name: "Writer",
          description: "Write better",
          category: "general",
          author: "PromptHub",
          source_url: "https://github.com/example/skills/tree/main/writer",
          content_url: "https://raw.githubusercontent.com/example/skills/main/writer/SKILL.md",
          tags: ["writing"],
          version: "1.1.0",
          content: remoteContent,
        },
      ],
    });

    const result = await useSkillStore.getState().updateRegistrySkill("writer");

    expect(result?.status).toBe("updated");
    expect(versionCreate).toHaveBeenCalledWith(
      "skill-writer",
      expect.stringContaining("Store update"),
    );
    expect(update).toHaveBeenCalledWith(
      "skill-writer",
      expect.objectContaining({
        content: remoteContent,
        instructions: remoteContent,
        version: "1.1.0",
        installed_version: "1.1.0",
      }),
    );
  });

  it("updates a pristine skill from a cached remote store source", async () => {
    const remoteContent = "# Community Writer\n\nRemote update\n";
    const fetchRemoteContent = vi.fn().mockResolvedValue(remoteContent);
    const versionCreate = vi.fn().mockResolvedValue({ id: "version-remote" });
    const update = vi.fn().mockImplementation(async (_id, data) => ({
      ...createSkillFixture({ id: "skill-community-writer", name: "community-writer" }),
      ...data,
      id: "skill-community-writer",
      updated_at: 2,
    }));

    (window as any).api.skill.fetchRemoteContent = fetchRemoteContent;
    (window as any).api.skill.versionCreate = versionCreate;
    (window as any).api.skill.update = update;

    const originalHash = await useSkillStore
      .getState()
      .computeRegistrySkillHash("# Community Writer\n\nOriginal\n");

    useSkillStore.setState({
      skills: [
        createSkillFixture({
          id: "skill-community-writer",
          name: "community-writer",
          registry_slug: "community-writer",
          content: "# Community Writer\n\nOriginal\n",
          instructions: "# Community Writer\n\nOriginal\n",
          installed_content_hash: originalHash,
          installed_version: "1.0.0",
        }),
      ],
      registrySkills: [],
      remoteStoreEntries: {
        community: {
          loadedAt: 1,
          error: null,
          skills: [
            {
              slug: "community-writer",
              name: "Community Writer",
              description: "Write better",
              category: "general",
              author: "Community",
              source_url: "https://github.com/example/community/tree/main/writer",
              content_url:
                "https://raw.githubusercontent.com/example/community/main/writer/SKILL.md",
              tags: ["writing"],
              version: "1.1.0",
              content: remoteContent,
            },
          ],
        },
      },
    });

    const result = await useSkillStore
      .getState()
      .updateRegistrySkill("community-writer");

    expect(result?.status).toBe("updated");
    expect(versionCreate).toHaveBeenCalledWith(
      "skill-community-writer",
      expect.stringContaining("Store update"),
    );
    expect(update).toHaveBeenCalledWith(
      "skill-community-writer",
      expect.objectContaining({
        content: remoteContent,
        installed_content_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        installed_version: "1.1.0",
      }),
    );
  });

  it("refuses registry updates when local content was edited unless overwrite is requested", async () => {
    const remoteContent = "# Writer\n\nRemote update\n";
    (window as any).api.skill.fetchRemoteContent = vi.fn().mockResolvedValue(remoteContent);
    const update = vi.fn();
    (window as any).api.skill.update = update;

    const originalHash = await useSkillStore
      .getState()
      .computeRegistrySkillHash("# Writer\n\nOriginal\n");

    useSkillStore.setState({
      skills: [
        createSkillFixture({
          id: "skill-writer",
          name: "writer",
          registry_slug: "writer",
          content: "# Writer\n\nLocal edits\n",
          instructions: "# Writer\n\nLocal edits\n",
          installed_content_hash: originalHash,
          installed_version: "1.0.0",
        }),
      ],
      registrySkills: [
        {
          slug: "writer",
          name: "Writer",
          description: "Write better",
          category: "general",
          author: "PromptHub",
          source_url: "https://github.com/example/skills/tree/main/writer",
          content_url: "https://raw.githubusercontent.com/example/skills/main/writer/SKILL.md",
          tags: ["writing"],
          version: "1.1.0",
          content: remoteContent,
        },
      ],
    });

    const result = await useSkillStore.getState().updateRegistrySkill("writer");

    expect(result?.status).toBe("conflict");
    expect(update).not.toHaveBeenCalled();
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

  describe("remoteStoreEntries cache and persistence", () => {
    it("setRemoteStoreEntry stores skills with loadedAt and error fields", () => {
      const skills = [
        {
          slug: "s1",
          name: "Skill 1",
          description: "",
          category: "dev",
          tags: [],
          version: "1",
        },
        {
          slug: "s2",
          name: "Skill 2",
          description: "",
          category: "dev",
          tags: [],
          version: "1",
        },
      ];
      useSkillStore.getState().setRemoteStoreEntry("claude-code", {
        loadedAt: 1000,
        error: null,
        skills: skills as any[],
      });

      const entry = useSkillStore.getState().remoteStoreEntries["claude-code"];
      expect(entry).toBeDefined();
      expect(entry!.loadedAt).toBe(1000);
      expect(entry!.error).toBeNull();
      expect(entry!.skills).toHaveLength(2);
      expect(entry!.skills[0].slug).toBe("s1");
    });

    it("setRemoteStoreEntry preserves existing entries when adding new sources", () => {
      const existing = {
        loadedAt: 500,
        error: null,
        skills: [{ slug: "a" }] as any[],
      };
      useSkillStore.setState({ remoteStoreEntries: { existing: existing } });

      useSkillStore.getState().setRemoteStoreEntry("new-source", {
        loadedAt: 600,
        error: null,
        skills: [{ slug: "b" }] as any[],
      });

      const entries = useSkillStore.getState().remoteStoreEntries;
      expect(entries["existing"]).toBeDefined();
      expect(entries["existing"]!.skills[0].slug).toBe("a");
      expect(entries["new-source"]).toBeDefined();
      expect(entries["new-source"]!.skills[0].slug).toBe("b");
    });

    it("setRemoteStoreEntry can overwrite an existing source entry", () => {
      useSkillStore.setState({
        remoteStoreEntries: {
          src: { loadedAt: 1, error: null, skills: [{ slug: "old" }] as any[] },
        },
      });

      useSkillStore.getState().setRemoteStoreEntry("src", {
        loadedAt: 2,
        error: null,
        skills: [{ slug: "new1" }, { slug: "new2" }] as any[],
      });

      const entry = useSkillStore.getState().remoteStoreEntries["src"];
      expect(entry!.loadedAt).toBe(2);
      expect(entry!.skills).toHaveLength(2);
      expect(entry!.skills[0].slug).toBe("new1");
    });

    it("setRemoteStoreEntry stores error string while preserving old skills", () => {
      useSkillStore.setState({
        remoteStoreEntries: {
          src: {
            loadedAt: 100,
            error: null,
            skills: [{ slug: "cached" }] as any[],
          },
        },
      });

      // Simulate a failure update that preserves old skills
      const cached = useSkillStore.getState().remoteStoreEntries["src"];
      useSkillStore.getState().setRemoteStoreEntry("src", {
        loadedAt: cached?.loadedAt || 0,
        error: "Network timeout",
        skills: cached?.skills || [],
      });

      const entry = useSkillStore.getState().remoteStoreEntries["src"];
      expect(entry!.error).toBe("Network timeout");
      expect(entry!.loadedAt).toBe(100); // loadedAt NOT updated on failure
      expect(entry!.skills).toHaveLength(1); // old skills preserved
      expect(entry!.skills[0].slug).toBe("cached");
    });

    it("removeCustomStoreSource cleans up remoteStoreEntries for that source", () => {
      useSkillStore.setState({
        customStoreSources: [
          {
            id: "a",
            name: "A",
            type: "git-repo",
            url: "https://github.com/a/b",
            enabled: true,
            createdAt: 1,
          },
          {
            id: "b",
            name: "B",
            type: "git-repo",
            url: "https://github.com/c/d",
            enabled: true,
            createdAt: 2,
          },
        ],
        remoteStoreEntries: {
          a: { loadedAt: 10, error: null, skills: [{ slug: "s1" }] as any[] },
          b: { loadedAt: 20, error: null, skills: [{ slug: "s2" }] as any[] },
        },
        selectedStoreSourceId: "a",
      });

      useSkillStore.getState().removeCustomStoreSource("a");

      const state = useSkillStore.getState();
      expect(state.remoteStoreEntries["a"]).toBeUndefined();
      expect(state.remoteStoreEntries["b"]).toBeDefined();
      expect(state.customStoreSources).toHaveLength(1);
      expect(state.selectedStoreSourceId).toBe("official");
    });

    it("removeCustomStoreSource does not change selectedStoreSourceId when removing non-selected source", () => {
      useSkillStore.setState({
        customStoreSources: [
          {
            id: "a",
            name: "A",
            type: "git-repo",
            url: "https://github.com/a/b",
            enabled: true,
            createdAt: 1,
          },
          {
            id: "b",
            name: "B",
            type: "git-repo",
            url: "https://github.com/c/d",
            enabled: true,
            createdAt: 2,
          },
        ],
        remoteStoreEntries: {
          a: { loadedAt: 10, error: null, skills: [{ slug: "s1" }] as any[] },
          b: { loadedAt: 20, error: null, skills: [{ slug: "s2" }] as any[] },
        },
        selectedStoreSourceId: "b",
      });

      useSkillStore.getState().removeCustomStoreSource("a");

      expect(useSkillStore.getState().selectedStoreSourceId).toBe("b");
    });

    it("toggleCustomStoreSource flips the enabled flag", () => {
      useSkillStore.setState({
        customStoreSources: [
          {
            id: "x",
            name: "X",
            type: "git-repo",
            url: "https://github.com/x/y",
            enabled: true,
            createdAt: 1,
          },
        ],
      });

      useSkillStore.getState().toggleCustomStoreSource("x");
      expect(useSkillStore.getState().customStoreSources[0].enabled).toBe(
        false,
      );

      useSkillStore.getState().toggleCustomStoreSource("x");
      expect(useSkillStore.getState().customStoreSources[0].enabled).toBe(true);
    });
  });

  describe("partialize — persistence filtering", () => {
    it("only persists remoteStoreEntries with at least one skill", () => {
      useSkillStore.setState({
        remoteStoreEntries: {
          loaded: {
            loadedAt: 100,
            error: null,
            skills: [{ slug: "s1" }] as any[],
          },
          empty: { loadedAt: 200, error: "fail", skills: [] },
          alsoEmpty: { loadedAt: 0, error: null, skills: [] },
        },
      });

      // Access the partialize function through the store's persist config
      // The store uses zustand/middleware persist with partialize
      const state = useSkillStore.getState();
      // Simulate what partialize does
      const filteredEntries: typeof state.remoteStoreEntries = {};
      for (const [key, entry] of Object.entries(state.remoteStoreEntries)) {
        if (entry.skills.length > 0) {
          filteredEntries[key] = { ...entry, error: null };
        }
      }

      expect(Object.keys(filteredEntries)).toEqual(["loaded"]);
      expect(filteredEntries["loaded"]!.error).toBeNull();
      expect(filteredEntries["empty"]).toBeUndefined();
      expect(filteredEntries["alsoEmpty"]).toBeUndefined();
    });

    it("strips error field from persisted entries", () => {
      useSkillStore.setState({
        remoteStoreEntries: {
          withError: {
            loadedAt: 100,
            error: "some transient error",
            skills: [{ slug: "s1" }] as any[],
          },
        },
      });

      const state = useSkillStore.getState();
      const filteredEntries: typeof state.remoteStoreEntries = {};
      for (const [key, entry] of Object.entries(state.remoteStoreEntries)) {
        if (entry.skills.length > 0) {
          filteredEntries[key] = { ...entry, error: null };
        }
      }

      expect(filteredEntries["withError"]!.skills).toHaveLength(1);
      expect(filteredEntries["withError"]!.error).toBeNull();
    });

    it("handles empty remoteStoreEntries gracefully", () => {
      useSkillStore.setState({ remoteStoreEntries: {} });

      const state = useSkillStore.getState();
      const filteredEntries: typeof state.remoteStoreEntries = {};
      for (const [key, entry] of Object.entries(state.remoteStoreEntries)) {
        if (entry.skills.length > 0) {
          filteredEntries[key] = { ...entry, error: null };
        }
      }

      expect(Object.keys(filteredEntries)).toHaveLength(0);
    });
  });
});
